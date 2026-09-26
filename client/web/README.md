# Marketing Video Creator — Web

A browser-only video tool. Two features:

1. **Split Video** — mark cut points on a timeline, export one file per segment.
2. **Insert Videos** — mark positions in a base video, upload a clip per position, export the combined video.

Everything runs client-side: video processing uses **ffmpeg.wasm**, and projects
(including the video/clip blobs) are saved locally in **IndexedDB**. Nothing is
uploaded to any server.

## Stack

- React 18 + TypeScript + Vite
- [zustand](https://github.com/pmndrs/zustand) for state
- [`@ffmpeg/ffmpeg`](https://ffmpegwasm.netlify.app/) (single-threaded core, loaded from unpkg)
- [`idb-keyval`](https://github.com/jakearchibald/idb-keyval) for local persistence

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
```

## How it works

- **Split** — for each segment between cut points: `Original` quality uses
  ffmpeg stream copy (`-c copy`, lossless, keyframe-aligned); `High`/`Medium`
  re-encode with libx264 for frame-accurate cuts.
- **Insert** — each base slice and inserted clip is normalized to the base
  resolution (scaled + padded, 30 fps, h264/aac) into MPEG-TS pieces, then
  concatenated with `-c copy`. This lets clips of different sizes/codecs join
  cleanly.
- **Save location** — uses the File System Access API (`showSaveFilePicker` /
  `showDirectoryPicker`) in Chrome/Edge so you pick where to save; falls back to
  regular downloads in other browsers.

## ffmpeg core

The single-threaded `@ffmpeg/core` is **self-hosted**: `scripts/copy-core.mjs`
copies it from `node_modules` into `public/ffmpeg/` (run automatically via the
`predev` / `prebuild` hooks). It loads same-origin, so there's no CDN, no CORS,
and it works offline. `public/ffmpeg/` is gitignored and regenerated on install.

## Notes / limits

- ffmpeg.wasm is single-threaded here, so exporting large/long videos can be
  slow and memory-heavy. Fine for short marketing clips; a native ffmpeg backend
  would be the upgrade path if that becomes a problem.
- The location-picker save dialog uses the File System Access API, which only
  Chrome and Edge support. Other browsers fall back to downloads.
