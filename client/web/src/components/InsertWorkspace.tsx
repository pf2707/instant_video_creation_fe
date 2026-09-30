import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import * as db from "../db";
import { formatTime } from "../lib/format";
import { useVideoRect } from "../lib/useVideoRect";
import {
  buildLeaves,
  leafTotal,
  leafIndexAt,
  leafLocal,
  insertStartComp,
  compToBaseTime,
  type InsertNode,
} from "../lib/composite";
import { CompositeTimeline } from "./CompositeTimeline";
import { OverlayPreview } from "./OverlayPreview";
import { InsertPanel } from "./Editor";
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, PlusIcon } from "./Icons";
import type { Project } from "../types";

export function InsertWorkspace({
  project,
  videoUrl,
}: {
  project: Project;
  videoUrl: string | null;
}) {
  const baseRef = useRef<HTMLVideoElement>(null);
  const clipRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const baseDuration = project.video!.duration;
  const { width: W, height: H } = project.video!;
  const videoRect = useVideoRect(stageRef, W, H);

  const addInsert = useStore((s) => s.addInsert);
  const addOverlay = useStore((s) => s.addOverlay);
  const updateOverlay = useStore((s) => s.updateOverlay);
  const removeOverlay = useStore((s) => s.removeOverlay);

  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  // Object URLs for each inserted clip, so the preview can play them.
  const [clipUrls, setClipUrls] = useState<Map<string, string>>(new Map());
  const insertsKey = project.inserts
    .map((i) => `${i.id}:${i.parentId ?? ""}:${i.clip?.name ?? ""}:${i.clip?.size ?? 0}`)
    .join(",");
  useEffect(() => {
    let cancelled = false;
    const urls = new Map<string, string>();
    (async () => {
      for (const ins of project.inserts) {
        if (!ins.clip) continue;
        const blob = await db.getClipBlob(ins.id);
        if (blob && !cancelled) urls.set(ins.id, URL.createObjectURL(blob));
      }
      if (cancelled) urls.forEach((u) => URL.revokeObjectURL(u));
      else setClipUrls(urls);
    })();
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertsKey]);

  const leaves = useMemo(() => {
    const nodes: InsertNode[] = project.inserts
      .filter((i) => i.clip && clipUrls.has(i.id))
      .map((i) => ({
        id: i.id,
        parentId: i.parentId,
        time: i.time,
        duration: i.clip!.duration,
        url: clipUrls.get(i.id),
      }));
    return buildLeaves(baseDuration, videoUrl ?? undefined, nodes);
  }, [project.inserts, clipUrls, baseDuration, videoUrl]);
  const total = leafTotal(leaves);

  // --- Composite player ---------------------------------------------------
  const [compTime, setCompTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [seekTick, setSeekTick] = useState(0);

  const compRef = useRef(0);
  const playingRef = useRef(false);
  const activeRef = useRef(0);
  const pendingLocal = useRef(0);
  compRef.current = compTime;
  playingRef.current = playing;
  activeRef.current = activeIndex;

  const activeLeaf = leaves[activeIndex];

  const seekAndPlay = (el: HTMLVideoElement, t: number) => {
    try {
      el.currentTime = t;
    } catch {
      /* not seekable yet */
    }
    if (playingRef.current) el.play().catch(() => {});
  };

  // Seek/play the active leaf whenever it (or an explicit seek) changes.
  useEffect(() => {
    const leaf = leaves[activeIndex];
    const base = baseRef.current;
    const clip = clipRef.current;
    if (!leaf || !base || !clip) return;
    const target = pendingLocal.current;
    pendingLocal.current = leaf.inStart;

    if (leaf.isBase) {
      clip.pause();
      seekAndPlay(base, target);
    } else {
      base.pause();
      if (clip.getAttribute("data-src") !== leaf.url) {
        clip.src = leaf.url!;
        clip.setAttribute("data-src", leaf.url!);
        const once = () => {
          clip.removeEventListener("loadedmetadata", once);
          seekAndPlay(clip, target);
        };
        clip.addEventListener("loadedmetadata", once);
      } else {
        seekAndPlay(clip, target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, seekTick]);

  // Playback loop: advance through leaves, report combined time.
  useEffect(() => {
    if (!playing) return;
    const leaf = leaves[activeRef.current];
    const el = leaf && !leaf.isBase ? clipRef.current : baseRef.current;
    el?.play().catch(() => {});
    let raf = 0;
    const loop = () => {
      const l = leaves[activeRef.current];
      if (!l) {
        setPlaying(false);
        return;
      }
      const e = l.isBase ? baseRef.current : clipRef.current;
      if (e) {
        setCompTime(Math.min(l.compStart + (e.currentTime - l.inStart), total));
        if (e.currentTime >= l.inEnd - 0.06) {
          const next = activeRef.current + 1;
          if (next < leaves.length) {
            pendingLocal.current = leaves[next].inStart;
            setActiveIndex(next);
          } else {
            e.pause();
            setPlaying(false);
            setCompTime(total);
            return;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, leaves, total]);

  // Re-anchor when the leaf list changes (added/removed/loaded a clip).
  useEffect(() => {
    const idx = leafIndexAt(leaves, compRef.current);
    pendingLocal.current = leaves[idx] ? leafLocal(leaves[idx], compRef.current) : 0;
    setActiveIndex(idx);
    setSeekTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaves]);

  const seekComposite = (t: number) => {
    const clamped = Math.min(Math.max(t, 0), total);
    const idx = leafIndexAt(leaves, clamped);
    const leaf = leaves[idx];
    setCompTime(clamped);
    if (!leaf) return;
    if (idx === activeIndex) {
      const el = leaf.isBase ? baseRef.current : clipRef.current;
      if (el) el.currentTime = leafLocal(leaf, clamped);
    } else {
      pendingLocal.current = leafLocal(leaf, clamped);
      setActiveIndex(idx);
    }
  };

  const play = () => {
    if (compRef.current >= total - 0.05) seekComposite(0);
    setPlaying(true);
  };
  const pause = () => {
    setPlaying(false);
    baseRef.current?.pause();
    clipRef.current?.pause();
  };
  const togglePlay = () => (playing ? pause() : play());

  // Where are we? (which source + local time) — drives marking + overlays.
  const curIdx = leafIndexAt(leaves, compTime);
  const curLeaf = leaves[curIdx];
  const currentSourceKey = curLeaf ? curLeaf.sourceKey : "base";
  const currentLocal = curLeaf ? leafLocal(curLeaf, compTime) : 0;
  const currentBaseTime = compToBaseTime(leaves, compTime);
  const insideClip = !!curLeaf && !curLeaf.isBase;

  const boundaries = leaves.map((l) => l.compStart).filter((c) => c > 0.01);
  const prevBoundary = () => seekComposite([...boundaries].reverse().find((c) => c < compTime - 0.05) ?? 0);
  const nextBoundary = () => seekComposite(boundaries.find((c) => c > compTime + 0.05) ?? total);

  const onAddInsert = () =>
    addInsert(currentLocal, currentSourceKey === "base" ? undefined : currentSourceKey);
  const onAddText = () => {
    const id = addOverlay(currentBaseTime);
    if (id) setSelectedOverlayId(id);
  };
  const seekToInsert = (id: string) => {
    const c = insertStartComp(leaves, id);
    if (c !== null) seekComposite(c);
  };

  const showBase = !activeLeaf || activeLeaf.isBase;

  return (
    <>
      <div className="editor-body">
        <div className="preview-wrap">
          <div className="video-stage" ref={stageRef}>
            <span className="badge">
              {project.video!.name} · {W}×{H} · base {formatTime(baseDuration)} · combined{" "}
              {formatTime(total)}
            </span>
            {videoUrl && (
              <video
                ref={baseRef}
                src={videoUrl}
                style={{ visibility: showBase ? "visible" : "hidden" }}
                onClick={togglePlay}
              />
            )}
            <video
              ref={clipRef}
              style={{ visibility: showBase ? "hidden" : "visible" }}
              onClick={togglePlay}
            />
            {videoRect && showBase && project.overlays.length > 0 && (
              <OverlayPreview
                overlays={project.overlays}
                rect={videoRect}
                videoHeight={H}
                selectedId={selectedOverlayId}
                currentTime={currentBaseTime}
                playing={playing}
                onSelect={setSelectedOverlayId}
                onMove={(id, x, y) => updateOverlay(id, { x, y })}
              />
            )}
            {insideClip && (
              <span className="insert-badge">
                ▶ {curLeaf!.depth > 1 ? `Nested clip (L${curLeaf!.depth})` : "Inserted clip"}
              </span>
            )}
          </div>

          <div className="transport">
            <div className="tbtn" onClick={prevBoundary} title="Previous boundary">
              <PrevIcon width={16} height={16} />
            </div>
            <div className="tbtn big" onClick={togglePlay} title="Play / pause combined">
              {playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} />}
            </div>
            <div className="tbtn" onClick={nextBoundary} title="Next boundary">
              <NextIcon width={16} height={16} />
            </div>
            <input
              className="comp-scrub"
              type="range"
              min={0}
              max={Math.max(total, 0.1)}
              step={0.01}
              value={Math.min(compTime, total)}
              onChange={(e) => seekComposite(Number(e.target.value))}
            />
            <div className="time">
              <b>{formatTime(compTime)}</b> / {formatTime(total)}
            </div>
            <button className="btn primary mark-btn" onClick={onAddInsert}>
              <PlusIcon width={15} height={15} />
              {insideClip ? "Insert into this clip" : "Add insert here"}
            </button>
          </div>
        </div>

        <InsertPanel
          project={project}
          onSeekInsert={seekToInsert}
          overlayProps={{
            selectedId: selectedOverlayId,
            currentTime: currentBaseTime,
            onAdd: onAddText,
            onSelect: setSelectedOverlayId,
            onUpdate: updateOverlay,
            onRemove: (id) => {
              removeOverlay(id);
              if (selectedOverlayId === id) setSelectedOverlayId(null);
            },
          }}
        />
      </div>

      <CompositeTimeline
        leaves={leaves}
        total={total}
        currentComp={compTime}
        baseVideoUrl={videoUrl}
        baseDuration={baseDuration}
        onSeek={seekComposite}
      />
    </>
  );
}
