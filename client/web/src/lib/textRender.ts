import type { TextOverlay } from "../types";

/** Font choices offered in the text panel (all commonly available). */
export const FONT_FAMILIES = [
  "Inter",
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "Impact",
];

/** CSS font shorthand for an overlay, at a given rendered font size (px). */
export function fontShorthand(o: TextOverlay, sizePx: number): string {
  const style = o.italic ? "italic" : "normal";
  const weight = o.bold ? "700" : "400";
  const family = /\s/.test(o.fontFamily) ? `"${o.fontFamily}"` : o.fontFamily;
  return `${style} ${weight} ${sizePx}px ${family}, sans-serif`;
}

const LINE_HEIGHT = 1.2;
// Scrim geometry, expressed as multiples of font size so preview and export
// scale together. Padding/radius reused by the preview via `em` units.
export const SCRIM_PAD_X = 0.35;
export const SCRIM_PAD_Y = 0.18;
export const SCRIM_RADIUS = 0.2;

export function scrimColor(bg: TextOverlay["background"]): string | null {
  if (bg === "dark") return "rgba(0,0,0,0.55)";
  if (bg === "light") return "rgba(255,255,255,0.82)";
  return null;
}

/**
 * Rasterize a text overlay to a transparent PNG the size of the video, with the
 * text positioned exactly as in the preview. Using canvas (rather than ffmpeg
 * drawtext) means preview and export share the browser's font rendering, and no
 * font files need to be bundled into ffmpeg.
 */
export function renderOverlayPng(
  overlay: TextOverlay,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const fs = overlay.fontSize;
  ctx.font = fontShorthand(overlay, fs);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = overlay.text.split("\n");
  const lineH = fs * LINE_HEIGHT;
  const cx = overlay.x * width;
  const cy = overlay.y * height;
  const totalH = lineH * lines.length;

  // Optional scrim behind the text block for readability.
  const scrim = scrimColor(overlay.background);
  if (scrim) {
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l || " ").width));
    const padX = fs * SCRIM_PAD_X;
    const padY = fs * SCRIM_PAD_Y;
    const boxW = maxW + padX * 2;
    const boxH = totalH + padY * 2;
    const r = Math.min(fs * SCRIM_RADIUS, boxW / 2, boxH / 2);
    ctx.fillStyle = scrim;
    ctx.beginPath();
    ctx.roundRect(cx - boxW / 2, cy - boxH / 2, boxW, boxH, r);
    ctx.fill();
  }

  // A soft shadow keeps light text readable even without a scrim.
  ctx.fillStyle = overlay.color;
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = Math.max(2, fs * 0.06);
  ctx.shadowOffsetY = Math.max(1, fs * 0.03);

  lines.forEach((line, i) => {
    ctx.fillText(line, cx, cy - totalH / 2 + lineH * (i + 0.5));
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to render text"))),
      "image/png",
    );
  });
}
