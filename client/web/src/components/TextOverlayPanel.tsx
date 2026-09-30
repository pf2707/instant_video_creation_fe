import { useState } from "react";
import type { TextOverlay } from "../types";
import { FONT_FAMILIES } from "../lib/textRender";
import { formatTime } from "../lib/format";
import { TextIcon } from "./Icons";

/**
 * The text-overlay editing panel (list + style + timing), rendered inside the
 * side <aside> of any editor. Shared by Decor, Split and Insert.
 */
export function TextOverlayPanel({
  overlays,
  selectedId,
  currentTime,
  onAdd,
  onSelect,
  onUpdate,
  onRemove,
}: {
  overlays: TextOverlay[];
  selectedId: string | null;
  currentTime: number;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TextOverlay>) => void;
  onRemove: (id: string) => void;
}) {
  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  return (
    <>
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
                className={`marker-item decor-m ${selectedId === o.id ? "active" : ""}`}
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
                onChange={(e) => onUpdate(selected.id, { text: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Font</label>
              <select
                className="select-input"
                value={selected.fontFamily}
                onChange={(e) => onUpdate(selected.id, { fontFamily: e.target.value })}
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
                <FontSizeInput
                  key={selected.id}
                  value={selected.fontSize}
                  onChange={(n) => onUpdate(selected.id, { fontSize: n })}
                />
              </div>
              <div>
                <label>Color</label>
                <input
                  className="color-input"
                  type="color"
                  value={selected.color}
                  onChange={(e) => onUpdate(selected.id, { color: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Style</label>
              <div className="seg">
                {(
                  [
                    ["Normal", { bold: false, italic: false }],
                    ["Bold", { bold: true, italic: false }],
                    ["Italic", { bold: false, italic: true }],
                  ] as const
                ).map(([label, val]) => {
                  const active =
                    selected.bold === val.bold && selected.italic === val.italic;
                  return (
                    <button
                      key={label}
                      className={active ? "active" : ""}
                      style={{
                        fontWeight: val.bold ? 700 : 400,
                        fontStyle: val.italic ? "italic" : "normal",
                      }}
                      onClick={() => onUpdate(selected.id, val)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <label>Background (for readability)</label>
              <div className="seg">
                {(["none", "dark", "light"] as const).map((b) => (
                  <button
                    key={b}
                    className={(selected.background ?? "none") === b ? "active" : ""}
                    onClick={() => onUpdate(selected.id, { background: b })}
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
                    onChange={(e) =>
                      onUpdate(selected.id, { start: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                  <button
                    className="tiny-btn"
                    onClick={() => onUpdate(selected.id, { start: currentTime })}
                  >
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
                    onChange={(e) => onUpdate(selected.id, { end: Number(e.target.value) || 0 })}
                  />
                  <button
                    className="tiny-btn"
                    onClick={() => onUpdate(selected.id, { end: currentTime })}
                  >
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
    </>
  );
}

/**
 * Font-size field with local text state so the user can fully clear it and type
 * a new number. An empty field is treated as size 1. Keyed by overlay id in the
 * parent so it re-initialises when a different overlay is selected.
 */
function FontSizeInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  return (
    <input
      className="num-input"
      type="number"
      min={1}
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        if (v === "") {
          onChange(1);
        } else {
          const n = Number(v);
          if (!isNaN(n) && n >= 1) onChange(Math.round(n));
        }
      }}
      onBlur={() => {
        if (text === "" || Number(text) < 1) setText("1");
      }}
    />
  );
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
