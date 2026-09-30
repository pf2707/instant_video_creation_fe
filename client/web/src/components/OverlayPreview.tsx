import { useState } from "react";
import type { TextOverlay } from "../types";
import {
  fontShorthand,
  scrimColor,
  SCRIM_PAD_X,
  SCRIM_PAD_Y,
  SCRIM_RADIUS,
} from "../lib/textRender";
import type { Rect } from "../lib/useVideoRect";

// Text snaps to center when within this fraction of 0.5.
const SNAP = 0.02;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * The draggable text layer that sits over the video preview. Shared by the
 * Decor, Split and Insert editors.
 */
export function OverlayPreview({
  overlays,
  rect,
  videoHeight,
  selectedId,
  currentTime,
  playing,
  onSelect,
  onMove,
}: {
  overlays: TextOverlay[];
  rect: Rect;
  videoHeight: number;
  selectedId: string | null;
  currentTime: number;
  playing: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
}) {
  const [guides, setGuides] = useState({ v: false, h: false });

  return (
    <div
      className="overlay-layer"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onMouseDown={() => onSelect(null)}
    >
      {guides.v && <div className="align-guide v" />}
      {guides.h && <div className="align-guide h" />}
      {overlays.map((o) => {
        const active = currentTime >= o.start - 0.01 && currentTime <= o.end + 0.01;
        // While paused, keep the selected overlay draggable outside its window
        // (shown dimmed). While playing, follow the timing so preview == export.
        const show = active || (!playing && o.id === selectedId);
        if (!show) return null;
        return (
          <OverlayText
            key={o.id}
            overlay={o}
            rect={rect}
            videoHeight={videoHeight}
            selected={o.id === selectedId}
            ghost={!active}
            onSelect={() => onSelect(o.id)}
            onMove={(x, y) => onMove(o.id, x, y)}
            onGuides={setGuides}
          />
        );
      })}
    </div>
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
  onGuides,
}: {
  overlay: TextOverlay;
  rect: Rect;
  videoHeight: number;
  selected: boolean;
  ghost: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onGuides: (g: { v: boolean; h: boolean }) => void;
}) {
  const fontScale = rect.height / videoHeight;
  const scrim = scrimColor(overlay.background);

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    const layer = (e.currentTarget as HTMLElement).parentElement!;
    const move = (ev: MouseEvent) => {
      const lr = layer.getBoundingClientRect();
      let x = clamp01((ev.clientX - lr.left) / lr.width);
      let y = clamp01((ev.clientY - lr.top) / lr.height);
      const v = Math.abs(x - 0.5) < SNAP;
      const h = Math.abs(y - 0.5) < SNAP;
      if (v) x = 0.5;
      if (h) y = 0.5;
      onGuides({ v, h });
      onMove(x, y);
    };
    const up = () => {
      onGuides({ v: false, h: false });
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
        <div key={i}>{line || " "}</div>
      ))}
    </div>
  );
}
