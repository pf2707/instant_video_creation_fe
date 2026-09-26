import { useRef } from "react";
import type { FeatureType } from "../types";
import { formatTime } from "../lib/format";
import { useFilmstrip } from "../lib/filmstrip";

export interface Marker {
  id: string;
  time: number;
  filled?: boolean;
}

interface TimelineProps {
  type: FeatureType;
  duration: number;
  currentTime: number;
  videoUrl: string | null;
  markers: Marker[];
  onSeek: (time: number) => void;
}

const FRAME_COUNT = 14;

export function Timeline({
  type,
  duration,
  currentTime,
  videoUrl,
  markers,
  onSeek,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frames = useFilmstrip(videoUrl, duration, FRAME_COUNT);

  const pct = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    onSeek(Math.min(duration, Math.max(0, ratio * duration)));
  };

  const onTrackMouse = (e: React.MouseEvent) => {
    seekFromEvent(e.clientX);
    const move = (ev: MouseEvent) => seekFromEvent(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // Ruler labels
  const ticks = 6;
  const labels = Array.from({ length: ticks }, (_, i) => {
    const ratio = i / (ticks - 1);
    return { left: `${ratio * 100}%`, text: formatTime(duration * ratio) };
  });

  // Segment labels for split: one "CLIP n" per region between cut boundaries.
  const sorted = [...markers].sort((a, b) => a.time - b.time);
  const boundaries = [0, ...sorted.map((m) => m.time), duration];
  const segLabels =
    type === "split"
      ? boundaries.slice(0, -1).map((start, i) => ({
          left: pct((start + boundaries[i + 1]) / 2),
          label: `CLIP ${i + 1}`,
        }))
      : [];

  return (
    <div className="timeline">
      <div className="ruler">
        {labels.map((l, i) => (
          <span key={i} style={{ left: l.left }}>
            {l.text}
          </span>
        ))}
      </div>
      <div className="track" ref={trackRef} onMouseDown={onTrackMouse}>
        {Array.from({ length: FRAME_COUNT }, (_, i) =>
          frames[i] ? (
            <div
              key={i}
              className="frame"
              style={{ backgroundImage: `url(${frames[i]})` }}
            />
          ) : (
            <div key={i} className="frame placeholder" />
          ),
        )}

        <div className="playhead" style={{ left: pct(currentTime) }} />

        {type === "split" &&
          sorted.map((m) => <div key={m.id} className="cut" style={{ left: pct(m.time) }} />)}
        {type === "split" &&
          segLabels.map((s, i) => (
            <div key={i} className="seg-label" style={{ left: s.left }}>
              {s.label}
            </div>
          ))}

        {type === "insert" &&
          sorted.map((m) => (
            <div
              key={m.id}
              className={`ins ${m.filled ? "filled" : ""}`}
              style={{ left: pct(m.time) }}
            />
          ))}
      </div>
    </div>
  );
}
