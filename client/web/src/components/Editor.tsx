import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { formatTime, formatBytes } from "../lib/format";
import { Timeline, type Marker } from "./Timeline";
import { ExportModal } from "./ExportModal";
import { useToast } from "./Toast";
import type { InsertPoint, Project } from "../types";
import {
  BackIcon,
  CheckIcon,
  ExportIcon,
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  UploadIcon,
  PlusIcon,
  SplitIcon,
} from "./Icons";

export function Editor() {
  const project = useStore((s) => s.current);
  const videoUrl = useStore((s) => s.videoUrl);
  const busy = useStore((s) => s.busy);
  const closeEditor = useStore((s) => s.closeEditor);
  const patch = useStore((s) => s.patchCurrent);
  const setBaseVideo = useStore((s) => s.setBaseVideo);

  const [showExport, setShowExport] = useState(false);

  if (!project) return null;

  return (
    <div className="editor">
      <div className="editor-head">
        <button className="back-btn" onClick={closeEditor}>
          <BackIcon width={15} height={15} /> Dashboard
        </button>
        <div className="proj-title">
          <span className={`pill ${project.type}`}>
            {project.type === "split" ? "Split" : "Insert"}
          </span>
          <input
            value={project.name}
            onChange={(e) => patch({ name: e.target.value })}
            spellCheck={false}
          />
        </div>
        <div className="spacer" />
        <span className="save-state">
          <CheckIcon width={15} height={15} /> Saved locally
        </span>
        <button
          className="btn primary"
          disabled={!project.video}
          onClick={() => setShowExport(true)}
        >
          <ExportIcon />
          {project.type === "split" ? "Export clips" : "Export combined"}
        </button>
      </div>

      {!project.video ? (
        <UploadState busy={busy} onFile={setBaseVideo} />
      ) : (
        <EditorWorkspace project={project} videoUrl={videoUrl} />
      )}

      {showExport && (
        <ExportModal project={project} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}

function UploadState({
  busy,
  onFile,
}: {
  busy: boolean;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const toast = useToast((s) => s.show);

  const handle = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast("Please choose a video file", "err");
      return;
    }
    onFile(file);
  };

  return (
    <div className="editor-body" style={{ gridTemplateColumns: "1fr" }}>
      <div
        className={`dropzone ${drag ? "drag" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files?.[0]);
        }}
      >
        <div>
          <div className="dz-ico">
            <UploadIcon width={30} height={30} />
          </div>
          <h3>Upload a video to begin</h3>
          <p>
            Drag &amp; drop your file here, or choose from your computer.
            <br />
            Supports MP4 and MOV. Nothing leaves your device.
          </p>
          <button
            className="btn primary"
            style={{ margin: "0 auto" }}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <span className="spinner" /> : <UploadIcon />}
            {busy ? "Reading…" : "Choose video"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => handle(e.target.files?.[0])}
          />
        </div>
      </div>
    </div>
  );
}

function EditorWorkspace({
  project,
  videoUrl,
}: {
  project: Project;
  videoUrl: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const duration = project.video!.duration;

  const addCut = useStore((s) => s.addCut);
  const addInsert = useStore((s) => s.addInsert);

  // Keep local currentTime in sync via rAF while playing for a smooth playhead.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setCurrentTime(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    if (playing) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
    setCurrentTime(t);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const markers: Marker[] =
    project.type === "split"
      ? project.cuts.map((c) => ({ id: c.id, time: c.time }))
      : project.inserts.map((i) => ({ id: i.id, time: i.time, filled: !!i.clip }));

  const times = markers.map((m) => m.time).sort((a, b) => a - b);
  const prevMarker = () => {
    const t = [...times].reverse().find((x) => x < currentTime - 0.01);
    seek(t ?? 0);
  };
  const nextMarker = () => {
    const t = times.find((x) => x > currentTime + 0.01);
    seek(t ?? duration);
  };

  const mark = () => {
    if (project.type === "split") addCut(currentTime);
    else addInsert(currentTime);
  };

  return (
    <>
      <div className="editor-body">
        <div className="preview-wrap">
          <div className="video-stage">
            <span className="badge">
              {project.video!.name} · {project.video!.width}×{project.video!.height} ·{" "}
              {formatTime(duration)}
            </span>
            {videoUrl && (
              <video
                ref={videoRef}
                src={videoUrl}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onClick={togglePlay}
              />
            )}
          </div>

          <div className="transport">
            <div className="tbtn" onClick={prevMarker} title="Previous marker">
              <PrevIcon width={16} height={16} />
            </div>
            <div className="tbtn big" onClick={togglePlay} title="Play / pause">
              {playing ? (
                <PauseIcon width={16} height={16} />
              ) : (
                <PlayIcon width={16} height={16} />
              )}
            </div>
            <div className="tbtn" onClick={nextMarker} title="Next marker">
              <NextIcon width={16} height={16} />
            </div>
            <div className="time">
              <b>{formatTime(currentTime)}</b> / {formatTime(duration)}
            </div>
            <button className="btn primary mark-btn" onClick={mark}>
              <PlusIcon width={15} height={15} />
              {project.type === "split" ? "Add cut here" : "Add insert here"}
            </button>
          </div>
        </div>

        {project.type === "split" ? (
          <SplitPanel project={project} onSeek={seek} />
        ) : (
          <InsertPanel project={project} onSeek={seek} />
        )}
      </div>

      <Timeline
        type={project.type}
        duration={duration}
        currentTime={currentTime}
        videoUrl={videoUrl}
        markers={markers}
        onSeek={seek}
      />
    </>
  );
}

function SplitPanel({
  project,
  onSeek,
}: {
  project: Project;
  onSeek: (t: number) => void;
}) {
  const removeCut = useStore((s) => s.removeCut);
  const patch = useStore((s) => s.patchCurrent);
  const cuts = [...project.cuts].sort((a, b) => a.time - b.time);

  return (
    <aside className="side">
      <h4>Cut Points ({cuts.length})</h4>
      <div className="side-sec">
        {cuts.length === 0 ? (
          <div className="empty-markers">
            No cut points yet. Move the playhead and press{" "}
            <b>Add cut here</b>.
          </div>
        ) : (
          <ul className="marker-list">
            {cuts.map((c, i) => (
              <li className="marker-item split-m" key={c.id}>
                <span className="dot" />
                <div className="grow">
                  <div className="m-time" onClick={() => onSeek(c.time)}>
                    {formatTime(c.time)}
                  </div>
                  <div className="m-sub">
                    Clip {i + 1} → Clip {i + 2}
                  </div>
                </div>
                <button className="m-x" onClick={() => removeCut(c.id)} title="Remove">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="hint">
          <SplitIcon width={13} height={13} style={{ verticalAlign: "-2px" }} />{" "}
          Exporting produces{" "}
          <b>{cuts.length + 1} file{cuts.length ? "s" : ""}</b> — one per segment.
        </div>
      </div>
      <h4>Output</h4>
      <OutputOptions project={project} patch={patch} />
    </aside>
  );
}

function InsertPanel({
  project,
  onSeek,
}: {
  project: Project;
  onSeek: (t: number) => void;
}) {
  const removeInsert = useStore((s) => s.removeInsert);
  const setInsertClip = useStore((s) => s.setInsertClip);
  const patch = useStore((s) => s.patchCurrent);
  const inserts = [...project.inserts].sort((a, b) => a.time - b.time);

  return (
    <aside className="side">
      <h4>Insert Points ({inserts.length})</h4>
      <div className="side-sec">
        {inserts.length === 0 ? (
          <div className="empty-markers">
            No insert points yet. Move the playhead and press{" "}
            <b>Add insert here</b>.
          </div>
        ) : (
          <ul className="marker-list">
            {inserts.map((ins) => (
              <InsertRow
                key={ins.id}
                insert={ins}
                onSeek={() => onSeek(ins.time)}
                onRemove={() => removeInsert(ins.id)}
                onClip={(f) => setInsertClip(ins.id, f)}
              />
            ))}
          </ul>
        )}
        <div className="hint">
          Each insert point needs a clip. Uploaded clips are <b>not</b> shown on
          the timeline — only the marker. Export stitches them into the base.
        </div>
      </div>
      <h4>Output</h4>
      <OutputOptions project={project} patch={patch} />
    </aside>
  );
}

function InsertRow({
  insert,
  onSeek,
  onRemove,
  onClip,
}: {
  insert: InsertPoint;
  onSeek: () => void;
  onRemove: () => void;
  onClip: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast((s) => s.show);
  return (
    <li className={`marker-item insert-m ${insert.clip ? "filled" : ""}`}>
      <span className="dot" />
      <div className="grow">
        <div className="m-time" onClick={onSeek}>
          {formatTime(insert.time)}
        </div>
        {insert.clip ? (
          <div className="m-sub">
            {insert.clip.name} · {formatTime(insert.clip.duration)} ·{" "}
            {formatBytes(insert.clip.size)}
          </div>
        ) : (
          <div className="m-sub empty">No clip yet</div>
        )}
      </div>
      <button className="up-btn" onClick={() => inputRef.current?.click()}>
        {insert.clip ? "Replace" : "Upload"}
      </button>
      <button className="m-x" onClick={onRemove} title="Remove">
        ✕
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && !f.type.startsWith("video/")) {
            toast("Please choose a video file", "err");
            return;
          }
          if (f) onClip(f);
          e.target.value = "";
        }}
      />
    </li>
  );
}

function OutputOptions({
  project,
  patch,
}: {
  project: Project;
  patch: (p: Partial<Project>) => void;
}) {
  return (
    <div className="side-sec">
      <div className="field">
        <label>Format</label>
        <div className="seg">
          {(["mp4", "mov"] as const).map((f) => (
            <button
              key={f}
              className={project.format === f ? "active" : ""}
              onClick={() => patch({ format: f })}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Quality</label>
        <div className="seg">
          {(["original", "high", "medium"] as const).map((q) => (
            <button
              key={q}
              className={project.quality === q ? "active" : ""}
              onClick={() => patch({ quality: q })}
            >
              {q[0].toUpperCase() + q.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
