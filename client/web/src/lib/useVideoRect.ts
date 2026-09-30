import { useLayoutEffect, useState, type RefObject } from "react";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Matches the 12px inset applied to the <video> in .video-stage.
export const STAGE_INSET = 12;

/**
 * Tracks the displayed (letterboxed) video rectangle inside the stage element,
 * so text overlays can be positioned exactly over the video content. Recomputes
 * on resize.
 */
export function useVideoRect(
  stageRef: RefObject<HTMLElement>,
  videoWidth: number,
  videoHeight: number,
): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const innerW = el.clientWidth - STAGE_INSET * 2;
      const innerH = el.clientHeight - STAGE_INSET * 2;
      const scale = Math.min(innerW / videoWidth, innerH / videoHeight);
      const dispW = videoWidth * scale;
      const dispH = videoHeight * scale;
      setRect({
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
  }, [stageRef, videoWidth, videoHeight]);

  return rect;
}
