import { useEffect, useState } from "react";

/**
 * Generates evenly-spaced thumbnail data URLs from a video for the timeline
 * filmstrip. Best-effort: returns [] until ready and on any failure.
 */
export function useFilmstrip(
  videoUrl: string | null,
  duration: number,
  count = 12,
): string[] {
  const [frames, setFrames] = useState<string[]>([]);

  useEffect(() => {
    setFrames([]);
    if (!videoUrl || !duration || !isFinite(duration)) return;

    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.src = videoUrl;

    const canvas = document.createElement("canvas");
    const out: string[] = [];

    const capture = (index: number) => {
      if (cancelled) return;
      if (index >= count) {
        setFrames([...out]);
        return;
      }
      const t = (duration * (index + 0.5)) / count;
      const onSeeked = () => {
        video.removeEventListener("seeked", onSeeked);
        if (cancelled) return;
        const w = 96;
        const h = Math.max(
          1,
          Math.round((w * (video.videoHeight || 9)) / (video.videoWidth || 16)),
        );
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        try {
          ctx?.drawImage(video, 0, 0, w, h);
          out.push(canvas.toDataURL("image/jpeg", 0.6));
        } catch {
          // Tainted/undrawable frame — stop and keep what we have.
          setFrames([...out]);
          return;
        }
        // Update progressively so the strip fills in as frames arrive.
        setFrames([...out]);
        capture(index + 1);
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = Math.min(t, duration - 0.05);
    };

    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      capture(0);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", () => setFrames([]));

    return () => {
      cancelled = true;
    };
  }, [videoUrl, duration, count]);

  return frames;
}
