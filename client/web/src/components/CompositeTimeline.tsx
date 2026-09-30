import { useRef } from "react";
import { formatTime } from "../lib/format";
import { useFilmstrip } from "../lib/filmstrip";
import type { Leaf } from "../lib/composite";
import { FilmIcon } from "./Icons";

const BASE_FRAMES = 24;

/**
 * Timeline for the Insert editor that visualises the COMBINED stream: base
 * slices (as filmstrip) and inserted clips (as green-outlined filmstrip blocks),
 * laid end-to-end. Nested clips are shaded slightly darker by depth. Clicking or
 * dragging scrubs the combined stream.
 */
export function CompositeTimeline({
  leaves,
  total,
  currentComp,
  baseVideoUrl,
  baseDuration,
  onSeek,
}: {
  leaves: Leaf[];
  total: number;
  currentComp: number;
  baseVideoUrl: string | null;
  baseDuration: number;
  onSeek: (comp: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const baseFrames = useFilmstrip(baseVideoUrl, baseDuration, BASE_FRAMES);

  const seekFromEvent = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    onSeek(Math.min(total, Math.max(0, ratio * total)));
  };
  const onMouseDown = (e: React.MouseEvent) => {
    seekFromEvent(e.clientX);
    const move = (ev: MouseEvent) => seekFromEvent(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const ticks = 6;
  const labels = Array.from({ length: ticks }, (_, i) => {
    const ratio = i / (ticks - 1);
    return { left: `${ratio * 100}%`, text: formatTime(total * ratio) };
  });

  const baseFrameTime = (i: number) => ((i + 0.5) / BASE_FRAMES) * baseDuration;
  const playheadPct = total > 0 ? Math.min(100, (currentComp / total) * 100) : 0;

  return (
    <div className="timeline">
      <div className="ruler">
        {labels.map((l, i) => (
          <span key={i} style={{ left: l.left }}>
            {l.text}
          </span>
        ))}
      </div>
      <div className="track ctrack" ref={trackRef} onMouseDown={onMouseDown}>
        {leaves.map((leaf, li) => {
          const w = total > 0 ? ((leaf.compEnd - leaf.compStart) / total) * 100 : 0;
          if (leaf.isBase) {
            const segFrames = baseFrames
              .map((src, i) => ({ src, t: baseFrameTime(i) }))
              .filter((f) => f.t >= leaf.inStart && f.t <= leaf.inEnd);
            return (
              <div className="cseg base" key={li} style={{ flex: `0 0 ${w}%` }}>
                {segFrames.length > 0 ? (
                  segFrames.map((f, i) => (
                    <div className="frame" key={i} style={{ backgroundImage: `url(${f.src})` }} />
                  ))
                ) : (
                  <div className="frame placeholder" />
                )}
              </div>
            );
          }
          return (
            <div
              className="cseg clip"
              key={li}
              style={{ flex: `0 0 ${w}%`, ["--depth" as string]: leaf.depth }}
              title={leaf.depth > 1 ? "Clip inside a clip" : "Inserted clip"}
            >
              <ClipFilmstrip url={leaf.url!} inStart={leaf.inStart} inEnd={leaf.inEnd} />
              <span className="clip-tag">
                <FilmIcon width={11} height={11} />
                {leaf.depth > 1 ? `L${leaf.depth} ` : ""}
                {formatTime(leaf.inEnd - leaf.inStart)}
              </span>
            </div>
          );
        })}
        <div className="playhead" style={{ left: `${playheadPct}%` }} />
      </div>
      <div className="ctrack-legend">
        <span><i className="sw base" /> Base video</span>
        <span><i className="sw clip" /> Inserted clip</span>
        <span className="muted">Click to scrub · nested clips shaded darker</span>
      </div>
    </div>
  );
}

/** Filmstrip thumbnails for a slice [inStart, inEnd] of one clip. */
function ClipFilmstrip({ url, inStart, inEnd }: { url: string; inStart: number; inEnd: number }) {
  const span = inEnd - inStart;
  const count = Math.max(2, Math.min(10, Math.round(span)));
  // Sample across [0, inEnd] then keep the frames inside the slice.
  const frames = useFilmstrip(url, inEnd, Math.max(count, Math.round(inEnd)));
  const step = inEnd / Math.max(1, frames.length);
  const inSlice = frames
    .map((src, i) => ({ src, t: (i + 0.5) * step }))
    .filter((f) => f.t >= inStart && f.t <= inEnd);
  const show = inSlice.length > 0 ? inSlice : frames.map((src) => ({ src, t: 0 }));
  return (
    <>
      {show.length > 0 ? (
        show.map((f, i) => (
          <div className="frame" key={i} style={{ backgroundImage: `url(${f.src})` }} />
        ))
      ) : (
        <div className="frame placeholder" />
      )}
    </>
  );
}
