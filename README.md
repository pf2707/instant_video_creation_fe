# Marketing Video Creator

A fast, privacy-first video editing tool that runs entirely in your web browser.
No accounts, no uploads, no software to install — all editing and video
processing happen locally on your machine, so your footage never leaves your
device.

## Features

- **✂️ Split Video** — mark cut points on a frame-accurate timeline and export
  each segment as its own file.
- **➕ Insert Videos** — insert clips into a base video at exact positions;
  clips of any resolution are scaled and center-cropped to match the original.
- **🅰️ Decor Video** — add text overlays with custom font, size, bold, italic,
  color, position (drag anywhere), a readability scrim, and precise timing —
  burned into the video on export.

All work is saved locally (including the source video) so you can close the tab
and resume later. Exports support **MP4** and **MOV** with selectable quality,
and you choose where the finished files are saved.

## How it works

Everything runs client-side. Video processing uses **FFmpeg compiled to
WebAssembly**, editing state and media are stored in the browser via
**IndexedDB**, and exports are written to disk with the **File System Access
API**. There is no server component.

## Tech stack

React 18 · TypeScript · Vite · Zustand · `@ffmpeg/ffmpeg` (wasm) · `idb-keyval`

## Getting started

The web client lives in [`client/web`](client/web).

```bash
cd client/web
npm install      # also vendors the ffmpeg core into public/ffmpeg
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

**Requirements:** Node 18+ (developed on Node 22).

**Recommended browser:** Chrome or Edge — required for the "choose save
location" dialog. Other browsers download to the default folder instead.

## Project structure

```
marketing_video_creator/
├── client/web/          # the web application (React + Vite)
├── docs/                # project & source documentation
│   ├── PROJECT.md       # product description, how it works, use cases
│   └── ARCHITECTURE.md  # source-code documentation for developers
└── demo/                # static HTML design mockup
```

## Documentation

- **[docs/PROJECT.md](docs/PROJECT.md)** — product overview, how it works, and
  use cases.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — full source-code
  documentation: architecture, data model, state, video pipelines, and how to
  extend the app.
- **[client/web/README.md](client/web/README.md)** — web-client dev notes
  (ffmpeg core vendoring, limitations).

## Limitations

- The save-location dialog requires the File System Access API (Chrome/Edge).
- FFmpeg runs single-threaded in the browser, so very large/long videos are
  slower and more memory-heavy. Short marketing clips are the sweet spot.

## Licensing

First-party application code is yours to license. Note that `@ffmpeg/core`
bundles FFmpeg under **LGPL/GPL**; if you redistribute this project, review the
FFmpeg license and include the required notices. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#14-third-party-dependencies--licensing)
for details.
