import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { formatTime } from "../lib/format";
import { useVideoRect } from "../lib/useVideoRect";
import { Timeline } from "./Timeline";
import { OverlayPreview } from "./OverlayPreview";
import { TextOverlayPanel } from "./TextOverlayPanel";
import { PlayIcon, PauseIcon, TextIcon } from "./Icons";
import type { Project } from "../types";

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

  const duration = project.video!.duration;
  const { width: W, height: H } = project.video!;
  const videoRect = useVideoRect(stageRef, W, H);

  const addOverlay = useStore((s) => s.addOverlay);
  const updateOverlay = useStore((s) => s.updateOverlay);
  const removeOverlay = useStore((s) => s.removeOverlay);

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

  const onAdd = () => {
    const id = addOverlay(currentTime);
    if (id) setSelectedId(id);
  };

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
              <OverlayPreview
                overlays={project.overlays}
                rect={videoRect}
                videoHeight={H}
                selectedId={selectedId}
                currentTime={currentTime}
                playing={playing}
                onSelect={setSelectedId}
                onMove={(id, x, y) => updateOverlay(id, { x, y })}
              />
            )}
          </div>

          <div className="transport">
            <div className="tbtn big" onClick={togglePlay} title="Play / pause">
              {playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} />}
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

        <aside className="side">
          <TextOverlayPanel
            overlays={project.overlays}
            selectedId={selectedId}
            currentTime={currentTime}
            onAdd={onAdd}
            onSelect={setSelectedId}
            onUpdate={updateOverlay}
            onRemove={(id) => {
              removeOverlay(id);
              if (selectedId === id) setSelectedId(null);
            }}
          />
        </aside>
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
