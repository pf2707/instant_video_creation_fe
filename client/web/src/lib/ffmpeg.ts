import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import type { OutputFormat, Project, Quality } from "../types";
import { toFfmpegTime } from "./format";

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

  const active = project.inserts
    .filter((i) => i.clip && clipBlobs.has(i.id))
    .sort((a, b) => a.time - b.time);
  if (active.length === 0) throw new Error("No insert clips to combine");

  const inputName = `base.${guessExt(project.video.mimeType)}`;
  await ff.writeFile(inputName, await fetchFile(videoBlob));

  type Seg =
    | { kind: "base"; start: number; end: number }
    | { kind: "clip"; file: string };

  const segs: Seg[] = [];
  let prev = 0;
  for (const ins of active) {
    if (ins.time - prev > 0.05) segs.push({ kind: "base", start: prev, end: ins.time });
    const file = `clip_${ins.id}.${guessExt(ins.clip!.mimeType)}`;
    await ff.writeFile(file, await fetchFile(clipBlobs.get(ins.id)!));
    segs.push({ kind: "clip", file });
    prev = ins.time;
  }
  if (duration - prev > 0.05) segs.push({ kind: "base", start: prev, end: duration });

  // Base slices are already at the target resolution — just normalize.
  const baseVf = `scale=${W}:${H},fps=30,format=yuv420p,setsar=1`;
  // Inserted clips: scale to COVER the frame, then center-crop to the exact
  // base resolution (fill, no black bars). Odd sizes are rounded to even.
  const clipVf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,format=yuv420p,setsar=1`;
  const normalized: string[] = [];
  const finalOut = `output.${ext}`;

  try {
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const out = `norm_${i}.ts`;
      const common = [
        "-vf", seg.kind === "base" ? baseVf : clipVf,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf),
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-f", "mpegts", out,
      ];
      const args =
        seg.kind === "base"
          ? ["-i", inputName, "-ss", toFfmpegTime(seg.start), "-to", toFfmpegTime(seg.end), ...common]
          : ["-i", seg.file, ...common];

      progressCb = (r) =>
        onProgress({
          label: `Rendering segment ${i + 1} of ${segs.length}`,
          ratio: ((i + r) / segs.length) * 0.9,
        });
      await run(ff, args);
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
    await ff.deleteFile(inputName).catch(() => {});
    await ff.deleteFile("concat.txt").catch(() => {});
    await ff.deleteFile(finalOut).catch(() => {});
    for (const n of normalized) await ff.deleteFile(n).catch(() => {});
    for (const seg of segs) if (seg.kind === "clip") await ff.deleteFile(seg.file).catch(() => {});
  }
}

function guessExt(mime: string): string {
  if (mime.includes("quicktime") || mime.includes("mov")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("matroska")) return "mkv";
  return "mp4";
}
