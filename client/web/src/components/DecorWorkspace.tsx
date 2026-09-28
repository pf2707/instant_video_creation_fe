import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { formatTime } from "../lib/format";
import {
  FONT_FAMILIES,
  fontShorthand,
  scrimColor,
  SCRIM_PAD_X,
  SCRIM_PAD_Y,
  SCRIM_RADIUS,
} from "../lib/textRender";
import { Timeline } from "./Timeline";
import { PlayIcon, PauseIcon, TextIcon } from "./Icons";
import type { Project, TextOverlay } from "../types";

// Matches the 12px inset applied to the <video> in .video-stage.
const STAGE_INSET = 12;

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function DecorWorkspace({
  project,
  videoUrl,
}: {
  project: Project;
  videoUrl: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [videoRect, setVideoRect] = useState<Rect | null>(null);

  const duration = project.video!.duration;
  const { width: W, height: H } = project.video!;

  const addOverlay = useStore((s) => s.addOverlay);
  const updateOverlay = useStore((s) => s.updateOverlay);
  const removeOverlay = useStore((s) => s.removeOverlay);

  // Smooth playhead while playing.
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

  // Track the displayed (letterboxed) video rectangle inside the stage so text
  // overlays sit exactly over the video content.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const innerW = el.clientWidth - STAGE_INSET * 2;
      const innerH = el.clientHeight - STAGE_INSET * 2;
      const scale = Math.min(innerW / W, innerH / H);
      const dispW = W * scale;
      const dispH = H * scale;
      setVideoRect({
        left: STAGE_INSET + (innerW - dispW) / 2,
        top: STAGE_INSET + (innerH - dispH) / 2,
        width: dispW,
        height: dispH,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H]);

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

  const onAdd = () => {
    const id = addOverlay();
    if (id) setSelectedId(id);
  };

  const overlays = project.overlays;
  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  return (
    <>
      <div className="editor-body">
        <div className="preview-wrap">
          <div className="video-stage" ref={stageRef}>
            <span className="badge">
              {project.video!.name} · {W}×{H} · {formatTime(duration)}
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

            {videoRect && (
              <div
                className="overlay-layer"
                style={{
                  left: videoRect.left,
                  top: videoRect.top,
                  width: videoRect.width,
                  height: videoRect.height,
                }}
                onMouseDown={() => setSelectedId(null)}
              >
                {overlays
                  .map((o) => {
                    const active =
                      currentTime >= o.start - 0.01 && currentTime <= o.end + 0.01;
                    // When paused, keep the selected overlay draggable even
                    // outside its window (shown dimmed). When playing, follow
                    // the timing exactly so the preview matches the export.
                    const show = active || (!playing && o.id === selectedId);
                    if (!show) return null;
                    return (
                      <OverlayText
                        key={o.id}
                        overlay={o}
                        rect={videoRect}
                        videoHeight={H}
                        selected={o.id === selectedId}
                        ghost={!active}
                        onSelect={() => setSelectedId(o.id)}
                        onMove={(x, y) => updateOverlay(o.id, { x, y })}
                      />
                    );
                  })}
              </div>
            )}
          </div>

          <div className="transport">
            <div className="tbtn big" onClick={togglePlay} title="Play / pause">
              {playing ? (
                <PauseIcon width={16} height={16} />
              ) : (
                <PlayIcon width={16} height={16} />
              )}
            </div>
            <div className="time">
              <b>{formatTime(currentTime)}</b> / {formatTime(duration)}
            </div>
            <button className="btn primary mark-btn" onClick={onAdd}>
              <TextIcon width={15} height={15} />
              Add text overlay
            </button>
          </div>
        </div>

        <DecorPanel
          overlays={overlays}
          selected={selected}
          currentTime={currentTime}
          onSelect={setSelectedId}
          onUpdate={(patch) => selected && updateOverlay(selected.id, patch)}
          onRemove={(id) => {
            removeOverlay(id);
            if (selectedId === id) setSelectedId(null);
          }}
          onAdd={onAdd}
        />
      </div>

      <Timeline
        type="decor"
        duration={duration}
        currentTime={currentTime}
        videoUrl={videoUrl}
        markers={[]}
        onSeek={seek}
      />
    </>
  );
}

function OverlayText({
  overlay,
  rect,
  videoHeight,
  selected,
  ghost,
  onSelect,
  onMove,
}: {
  overlay: TextOverlay;
  rect: Rect;
  videoHeight: number;
  selected: boolean;
  ghost: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
}) {
  const fontScale = rect.height / videoHeight;
  const scrim = scrimColor(overlay.background);

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    const layer = (e.currentTarget as HTMLElement).parentElement!;
    const move = (ev: MouseEvent) => {
      const lr = layer.getBoundingClientRect();
      onMove(
        clamp01((ev.clientX - lr.left) / lr.width),
        clamp01((ev.clientY - lr.top) / lr.height),
      );
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className={`overlay-text ${selected ? "selected" : ""} ${ghost ? "ghost" : ""}`}
      style={{
        left: `${overlay.x * 100}%`,
        top: `${overlay.y * 100}%`,
        font: fontShorthand(overlay, overlay.fontSize * fontScale),
        color: overlay.color,
        background: scrim ?? undefined,
        padding: scrim ? `${SCRIM_PAD_Y}em ${SCRIM_PAD_X}em` : undefined,
        borderRadius: scrim ? `${SCRIM_RADIUS}em` : undefined,
      }}
      onMouseDown={onMouseDown}
    >
      {overlay.text.split("\n").map((line, i) => (
        <div key={i}>{line || " "}</div>
      ))}
    </div>
  );
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function DecorPanel({
  overlays,
  selected,
  currentTime,
  onSelect,
  onUpdate,
  onRemove,
  onAdd,
}: {
  overlays: TextOverlay[];
  selected: TextOverlay | null;
  currentTime: number;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<TextOverlay>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <aside className="side">
      <h4>Text Overlays ({overlays.length})</h4>
      <div className="side-sec">
        {overlays.length === 0 ? (
          <div className="empty-markers">
            No text yet. Press <b>Add text overlay</b> to start.
          </div>
        ) : (
          <ul className="marker-list">
            {overlays.map((o) => (
              <li
                key={o.id}
                className={`marker-item decor-m ${selected?.id === o.id ? "active" : ""}`}
                onClick={() => onSelect(o.id)}
              >
                <span className="dot" />
                <div className="grow">
                  <div className="m-time">{o.text.split("\n")[0] || "(empty)"}</div>
                  <div className="m-sub">
                    {formatTime(o.start)}–{formatTime(o.end)}
                  </div>
                </div>
                <button
                  className="m-x"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(o.id);
                  }}
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn ghost add-text-btn" onClick={onAdd}>
          <TextIcon width={14} height={14} /> Add text overlay
        </button>
      </div>

      {selected && (
        <>
          <h4>Text Style</h4>
          <div className="side-sec">
            <div className="field">
              <label>Text</label>
              <textarea
                className="text-input"
                rows={2}
                value={selected.text}
                onChange={(e) => onUpdate({ text: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Font</label>
              <select
                className="select-input"
                value={selected.fontFamily}
                onChange={(e) => onUpdate({ fontFamily: e.target.value })}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="field row">
              <div>
                <label>Size (px)</label>
                <input
                  className="num-input"
                  type="number"
                  min={8}
                  max={2000}
                  value={selected.fontSize}
                  onChange={(e) =>
                    onUpdate({ fontSize: Math.max(8, Number(e.target.value) || 8) })
                  }
                />
              </div>
              <div>
                <label>Color</label>
                <input
                  className="color-input"
                  type="color"
                  value={selected.color}
                  onChange={(e) => onUpdate({ color: e.target.value })}
                />
              </div>
              <div>
                <label>Style</label>
                <div className="seg">
                  <button
                    className={selected.bold ? "active" : ""}
                    style={{ fontWeight: 700 }}
                    onClick={() => onUpdate({ bold: !selected.bold })}
                  >
                    B
                  </button>
                  <button
                    className={selected.italic ? "active" : ""}
                    style={{ fontStyle: "italic" }}
                    onClick={() => onUpdate({ italic: !selected.italic })}
                  >
                    I
                  </button>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Background (for readability)</label>
              <div className="seg">
                {(["none", "dark", "light"] as const).map((b) => (
                  <button
                    key={b}
                    className={(selected.background ?? "none") === b ? "active" : ""}
                    onClick={() => onUpdate({ background: b })}
                  >
                    {b[0].toUpperCase() + b.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <h4>Visible When</h4>
          <div className="side-sec">
            <div className="field row">
              <div>
                <label>Start</label>
                <div className="time-set">
                  <input
                    className="num-input"
                    type="number"
                    min={0}
                    step={0.1}
                    value={round1(selected.start)}
                    onChange={(e) => onUpdate({ start: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <button className="tiny-btn" onClick={() => onUpdate({ start: currentTime })}>
                    now
                  </button>
                </div>
              </div>
              <div>
                <label>End</label>
                <div className="time-set">
                  <input
                    className="num-input"
                    type="number"
                    min={0}
                    step={0.1}
                    value={round1(selected.end)}
                    onChange={(e) => onUpdate({ end: Number(e.target.value) || 0 })}
                  />
                  <button className="tiny-btn" onClick={() => onUpdate({ end: currentTime })}>
                    now
                  </button>
                </div>
              </div>
            </div>
            <div className="hint">
              Drag the text on the preview to position it. It's burned into the
              video on export.
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
