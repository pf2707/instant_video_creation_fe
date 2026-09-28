import { useState } from "react";
import type { OutputFormat, Project, Quality } from "../types";
import { useStore } from "../store";
import { useToast } from "./Toast";
import * as db from "../db";
import {
  exportSplit,
  exportInsert,
  exportDecor,
  getRecentLogs,
  type ExportedFile,
} from "../lib/ffmpeg";
import { pickSink, writeSink } from "../lib/save";
import { renderOverlayPng } from "../lib/textRender";
import { formatTime } from "../lib/format";

export function ExportModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const patch = useStore((s) => s.patchCurrent);
  const toast = useToast((s) => s.show);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ label: "", ratio: 0 });
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const isSplit = project.type === "split";
  const isDecor = project.type === "decor";
  const clipCount = project.cuts.length + 1;
  const filledInserts = project.inserts.filter((i) => i.clip).length;
  const emptyInserts = project.inserts.length - filledInserts;
  const overlayCount = project.overlays.length;

  const canExport = isSplit
    ? project.cuts.length > 0
    : isDecor
      ? overlayCount > 0
      : filledInserts > 0;

  const run = async () => {
    setError(null);
    setLogs([]);

    // Ask for the save location FIRST, while the click still counts as a user
    // gesture — the picker can't be opened after the long ffmpeg step.
    const outCount = isSplit ? clipCount : 1;
    const suffix = isSplit ? "" : isDecor ? "_text" : "_combined";
    const suggested = `${project.name}${suffix}.${project.format}`;
    const sink = await pickSink(outCount, suggested);
    if (!sink) return; // user cancelled the picker

    setBusy(true);
    setProgress({ label: "Loading ffmpeg…", ratio: 0 });
    try {
      const videoBlob = await db.getVideoBlob(project.id);
      if (!videoBlob) throw new Error("Video data missing");

      let files: ExportedFile[];
      if (isSplit) {
        files = await exportSplit(project, videoBlob, setProgress);
      } else if (isDecor) {
        setProgress({ label: "Rendering text…", ratio: 0 });
        const { width, height } = project.video!;
        const rendered = await Promise.all(
          project.overlays.map(async (overlay) => ({
            overlay,
            png: await renderOverlayPng(overlay, width, height),
          })),
        );
        files = [await exportDecor(project, videoBlob, rendered, setProgress)];
      } else {
        const clipBlobs = new Map<string, Blob>();
        for (const ins of project.inserts) {
          if (!ins.clip) continue;
          const b = await db.getClipBlob(ins.id);
          if (b) clipBlobs.set(ins.id, b);
        }
        files = [await exportInsert(project, videoBlob, clipBlobs, setProgress)];
      }

      setProgress({ label: "Saving…", ratio: 1 });
      await writeSink(sink, files);
      toast(
        isSplit
          ? `Exported ${files.length} clips`
          : isDecor
            ? "Exported video with text"
            : "Exported combined video",
      );
      onClose();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Export failed";
      setError(msg);
      setLogs(getRecentLogs());
      toast("Export failed", "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h3>
            {isSplit
              ? `Export ${clipCount} clips`
              : isDecor
                ? "Export video with text"
                : "Export combined video"}
          </h3>
          <p>
            {isSplit
              ? "Each segment between cut points is saved as its own file."
              : isDecor
                ? `${overlayCount} text overlay${overlayCount === 1 ? "" : "s"} will be burned into the video.`
                : "Inserts are stitched into the base video at each point."}
          </p>
        </div>

        <div className="modal-body">
          <div className="opt-row">
            <div className="lbl">
              Format
              <small>Output container</small>
            </div>
            <div className="seg">
              {(["mp4", "mov"] as OutputFormat[]).map((f) => (
                <button
                  key={f}
                  className={project.format === f ? "active" : ""}
                  disabled={busy}
                  onClick={() => patch({ format: f })}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="opt-row">
            <div className="lbl">
              Quality
              <small>
                {project.quality === "original"
                  ? "Highest quality"
                  : "Re-encoded · smaller files"}
              </small>
            </div>
            <div className="seg">
              {(["original", "high", "medium"] as Quality[]).map((q) => (
                <button
                  key={q}
                  className={project.quality === q ? "active" : ""}
                  disabled={busy}
                  onClick={() => patch({ quality: q })}
                >
                  {q[0].toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {isSplit && (
            <div className="out-list">
              {Array.from({ length: clipCount }, (_, i) => {
                const bounds = [0, ...project.cuts.map((c) => c.time), project.video!.duration];
                const dur = bounds[i + 1] - bounds[i];
                return (
                  <div className="out-item" key={i}>
                    <span className="oi">▸</span>
                    clip_{i + 1}.{project.format}
                    <span className="sz">{formatTime(dur)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!isSplit && emptyInserts > 0 && (
            <div className="warn">
              {emptyInserts} insert point{emptyInserts > 1 ? "s have" : " has"} no clip
              yet and will be skipped.
            </div>
          )}

          {error && (
            <div className="warn err-box">
              <b>Export failed.</b> {error}
              {logs.length > 0 && (
                <pre className="log-dump">{logs.slice(-14).join("\n")}</pre>
              )}
            </div>
          )}

          {busy && (
            <div className="progress-wrap">
              <div className="progress-label">
                <span>{progress.label}</span>
                <span>{Math.round(progress.ratio * 100)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress.ratio * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={run} disabled={busy || !canExport}>
            {busy ? (
              <>
                <span className="spinner" /> Exporting…
              </>
            ) : (
              "Choose location & export"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
