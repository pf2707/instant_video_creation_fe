import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { OutputFormat, Project, Quality, TextOverlay } from "../types";
import { toFfmpegTime } from "./format";
import { buildLeaves, type InsertNode } from "./composite";

// Single-threaded ESM core, self-hosted from /public so it loads same-origin
// (no CDN, no CORS, works offline). The worker imports it as an ES module, so
// this must be the ESM build. No SharedArrayBuffer requirement.
const CORE_BASE = `${window.location.origin}${import.meta.env.BASE_URL}ffmpeg`;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Recent ffmpeg log lines, used to build a useful error message on failure.
const recentLogs: string[] = [];
// Single progress listener delegates to whatever export step is running.
let progressCb: ((ratio: number) => void) | null = null;

export type ProgressFn = (info: { label: string; ratio: number }) => void;

/** Lazily load the ffmpeg.wasm core (cached across calls). */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const instance = new FFmpeg();
    instance.on("log", ({ message }) => {
      recentLogs.push(message);
      if (recentLogs.length > 60) recentLogs.shift();
      if (import.meta.env.DEV) console.debug("[ffmpeg]", message);
    });
    instance.on("progress", ({ progress }) => {
      if (progressCb) progressCb(Math.min(Math.max(progress, 0), 1));
    });
    // Pass same-origin URLs directly; the module worker will `import()` the
    // core and Emscripten streams the wasm from wasmURL.
    await instance.load({
      coreURL: `${CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${CORE_BASE}/ffmpeg-core.wasm`,
    });
    ffmpeg = instance;
    return instance;
  })();

  return loadPromise;
}

export interface ExportedFile {
  name: string;
  blob: Blob;
}

const CONTAINER: Record<OutputFormat, { ext: string; mime: string }> = {
  mp4: { ext: "mp4", mime: "video/mp4" },
  mov: { ext: "mov", mime: "video/quicktime" },
};

const CRF: Record<Quality, number> = {
  original: 18,
  high: 20,
  medium: 24,
};

function safeName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "video";
}

/** Run one ffmpeg command; throw with the tail of the log if it fails. */
async function run(ff: FFmpeg, args: string[]): Promise<void> {
  recentLogs.length = 0;
  let code: number | undefined;
  try {
    code = (await ff.exec(args)) as unknown as number;
  } catch (err) {
    throw new Error(
      `ffmpeg crashed: ${lastError()}${err instanceof Error ? ` (${err.message})` : ""}`,
    );
  }
  if (typeof code === "number" && code !== 0) {
    throw new Error(`ffmpeg failed (code ${code}): ${lastError()}`);
  }
}

function lastError(): string {
  // Prefer lines that look like an actual error message.
  const err = recentLogs.filter((l) => /error|invalid|not |unable|no such|failed/i.test(l));
  const pick = (err.length ? err : recentLogs).slice(-3).join(" · ");
  return pick || "no ffmpeg output";
}

/** The most recent ffmpeg log lines, for surfacing details in the UI. */
export function getRecentLogs(): string[] {
  return [...recentLogs];
}

/**
 * Split the base video into one file per segment defined by the cut points.
 * "original" quality uses stream copy (fast, lossless, keyframe-aligned);
 * other qualities re-encode for frame-accurate cuts.
 */
export async function exportSplit(
  project: Project,
  videoBlob: Blob,
  onProgress: ProgressFn,
): Promise<ExportedFile[]> {
  if (!project.video) throw new Error("No base video");
  const ff = await getFFmpeg();
  const { ext, mime } = CONTAINER[project.format];
  const base = safeName(project.name);

  const boundaries = [
    0,
    ...project.cuts.map((c) => c.time).sort((a, b) => a - b),
    project.video.duration,
  ];

  const inputName = `input.${guessExt(project.video.mimeType)}`;
  await ff.writeFile(inputName, await fetchFile(videoBlob));

  const results: ExportedFile[] = [];
  const segments = boundaries.length - 1;

  try {
    for (let i = 0; i < segments; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];
      if (end - start < 0.05) continue;
      const out = `clip_${i + 1}.${ext}`;

      progressCb = (r) =>
        onProgress({ label: `Exporting clip ${i + 1} of ${segments}`, ratio: (i + r) / segments });

      // Re-encode each segment so cuts land on the EXACT frame. Stream copy can
      // only cut at keyframes, which makes a clip start slightly before its cut
      // point and duplicate the tail of the previous clip. Seeking before -i is
      // fast, and with re-encoding the output still starts precisely at -ss.
      const dur = end - start;
      await run(ff, [
        "-ss", toFfmpegTime(start),
        "-i", inputName,
        "-t", toFfmpegTime(dur),
        "-c:v", "libx264", "-preset", "veryfast",
        "-crf", String(CRF[project.quality]),
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        out,
      ]);

      const data = await ff.readFile(out);
      results.push({
        name: `${base}_clip_${i + 1}.${ext}`,
        blob: new Blob([data as unknown as BlobPart], { type: mime }),
      });
      await ff.deleteFile(out).catch(() => {});
    }
  } finally {
    progressCb = null;
    await ff.deleteFile(inputName).catch(() => {});
  }

  if (results.length === 0) throw new Error("No clips were produced");
  onProgress({ label: "Done", ratio: 1 });
  return results;
}

/**
 * Insert clips into the base video at each filled insert point.
 * All pieces are normalized to the base resolution and concatenated so that
 * clips with different resolutions/codecs join cleanly.
 */
export async function exportInsert(
  project: Project,
  videoBlob: Blob,
  clipBlobs: Map<string, Blob>,
  onProgress: ProgressFn,
): Promise<ExportedFile> {
  if (!project.video) throw new Error("No base video");
  const ff = await getFFmpeg();
  const { ext, mime } = CONTAINER[project.format];
  const { width: W, height: H, duration } = project.video;
  const crf = CRF[project.quality];

  const nodes: InsertNode[] = project.inserts
    .filter((i) => i.clip && clipBlobs.has(i.id))
    .map((i) => ({ id: i.id, parentId: i.parentId, time: i.time, duration: i.clip!.duration }));
  if (nodes.length === 0) throw new Error("No insert clips to combine");

  // Flatten the (possibly nested) inserts into ordered source slices.
  const leaves = buildLeaves(duration, undefined, nodes);
  const mimeById = new Map(project.inserts.map((i) => [i.id, i.clip?.mimeType ?? "video/mp4"]));

  // Write each source media once, keyed by its sourceKey.
  const baseFile = `base.${guessExt(project.video.mimeType)}`;
  const sourceFiles = new Map<string, string>([["base", baseFile]]);
  await ff.writeFile(baseFile, await fetchFile(videoBlob));
  for (const leaf of leaves) {
    if (leaf.isBase || sourceFiles.has(leaf.sourceKey)) continue;
    const file = `clip_${leaf.sourceKey}.${guessExt(mimeById.get(leaf.sourceKey)!)}`;
    await ff.writeFile(file, await fetchFile(clipBlobs.get(leaf.sourceKey)!));
    sourceFiles.set(leaf.sourceKey, file);
  }

  // Base slices already match the target resolution; clips are scaled to COVER
  // then center-cropped (fill, no black bars).
  const baseVf = `scale=${W}:${H},fps=30,format=yuv420p,setsar=1`;
  const clipVf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,format=yuv420p,setsar=1`;
  const normalized: string[] = [];
  const finalOut = `output.${ext}`;

  try {
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      const out = `norm_${i}.ts`;
      progressCb = (r) =>
        onProgress({
          label: `Rendering segment ${i + 1} of ${leaves.length}`,
          ratio: ((i + r) / leaves.length) * 0.9,
        });
      await run(ff, [
        "-i", sourceFiles.get(leaf.sourceKey)!,
        "-ss", toFfmpegTime(leaf.inStart),
        "-to", toFfmpegTime(leaf.inEnd),
        "-vf", leaf.isBase ? baseVf : clipVf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-f", "mpegts", out,
      ]);
      normalized.push(out);
    }

    onProgress({ label: "Joining segments", ratio: 0.95 });
    const concatList = normalized.map((n) => `file '${n}'`).join("\n");
    await ff.writeFile("concat.txt", new TextEncoder().encode(concatList));
    progressCb = null;
    await run(ff, [
      "-f", "concat", "-safe", "0", "-i", "concat.txt",
      "-c", "copy", "-movflags", "+faststart", finalOut,
    ]);

    const data = await ff.readFile(finalOut);
    onProgress({ label: "Done", ratio: 1 });
    return { name: `${safeName(project.name)}_combined.${ext}`, blob: new Blob([data as unknown as BlobPart], { type: mime }) };
  } finally {
    progressCb = null;
    await ff.deleteFile("concat.txt").catch(() => {});
    await ff.deleteFile(finalOut).catch(() => {});
    for (const n of normalized) await ff.deleteFile(n).catch(() => {});
    for (const f of sourceFiles.values()) await ff.deleteFile(f).catch(() => {});
  }
}

/**
 * Burn text overlays into the base video. Each overlay is supplied as a
 * full-frame transparent PNG (rendered in the browser) and composited with the
 * overlay filter, with per-overlay time gating via `enable`.
 */
export async function exportDecor(
  project: Project,
  videoBlob: Blob,
  overlays: { overlay: TextOverlay; png: Blob }[],
  onProgress: ProgressFn,
): Promise<ExportedFile> {
  if (!project.video) throw new Error("No base video");
  if (overlays.length === 0) throw new Error("Add at least one text overlay");
  const ff = await getFFmpeg();
  const { ext, mime } = CONTAINER[project.format];
  const { duration } = project.video;

  const inputName = `input.${guessExt(project.video.mimeType)}`;
  await ff.writeFile(inputName, await fetchFile(videoBlob));

  const args = ["-i", inputName];
  for (let i = 0; i < overlays.length; i++) {
    await ff.writeFile(`ov_${i}.png`, await fetchFile(overlays[i].png));
    args.push("-i", `ov_${i}.png`);
  }

  // Chain overlays: [0:v][1:v]overlay[t0];[t0][2:v]overlay[t1];...
  let prev = "[0:v]";
  const steps: string[] = [];
  overlays.forEach(({ overlay }, i) => {
    const out = i === overlays.length - 1 ? "[vout]" : `[t${i}]`;
    const gated = overlay.start > 0.01 || overlay.end < duration - 0.01;
    // Commas inside the enable expression must be escaped in a filtergraph.
    const enable = gated
      ? `:enable=between(t\\,${toFfmpegTime(overlay.start)}\\,${toFfmpegTime(overlay.end)})`
      : "";
    steps.push(`${prev}[${i + 1}:v]overlay=x=0:y=0${enable}${out}`);
    prev = out;
  });

  progressCb = (r) => onProgress({ label: "Rendering text overlays", ratio: r });
  await run(ff, [
    ...args,
    "-filter_complex", steps.join(";"),
    "-map", "[vout]",
    "-map", "0:a?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", String(CRF[project.quality]),
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    `output.${ext}`,
  ]);
  progressCb = null;

  const data = await ff.readFile(`output.${ext}`);
  const blob = new Blob([data as unknown as BlobPart], { type: mime });

  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile(`output.${ext}`).catch(() => {});
  for (let i = 0; i < overlays.length; i++) await ff.deleteFile(`ov_${i}.png`).catch(() => {});

  onProgress({ label: "Done", ratio: 1 });
  return { name: `${safeName(project.name)}_text.${ext}`, blob };
}

function guessExt(mime: string): string {
  if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("matroska")) return "mkv";
  return "mp4";
}
