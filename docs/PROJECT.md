# Marketing Video Creator

## Full description

Marketing Video Creator is a fast, privacy-first video editing tool that runs entirely in your web browser — no accounts, no uploads, and no software to install. It is built for marketers, social media managers, small business owners, and content creators who need to turn raw footage into polished, shareable clips without wrestling with heavyweight desktop editors or paying for a subscription.

The tool focuses on the three edits people reach for most often. **Split Video** lets you upload a recording, mark cut points on a frame-accurate timeline, and export every segment as its own separate file — perfect for chopping a long webinar or product demo into bite-sized clips. **Insert Videos** lets you drop additional clips into a base video at exact positions; inserted footage of any resolution is automatically scaled and center-cropped to match the original, so the result looks seamless. **Decor Video** adds burned-in text overlays with full control over font family, size, bold, italic, color, position (drag it anywhere on the preview), an optional dark or light readability scrim, and precise on-screen timing.

Every project — including the source video and its edits — is saved locally in your browser, so you can close the tab and pick up exactly where you left off. All processing happens on your own machine using an in-browser build of ffmpeg, which means your footage never leaves your device and the original resolution and quality are preserved. Exports support both MP4 and MOV, with a choice of quality levels, and you pick exactly where the finished files are saved.

## How it works

Open the dashboard and choose one of the three tools, then upload a video from your computer. The video appears on a timeline showing frame thumbnails, with a playhead you can scrub and play. Depending on the tool, you mark cut points, mark insert positions and attach clips to them, or add draggable text overlays and style them in the side panel. A live preview shows exactly what the final result will look like — the same fonts, colors, positions, and timing used in the export.

When you are ready, click Export. The tool first asks where to save the file (a real folder or file picker in supported browsers), then processes everything locally with ffmpeg compiled to WebAssembly: splitting re-encodes each segment for frame-exact cuts, inserting normalizes and stitches clips together, and decorating composites your text onto the video. Because it runs in the browser, nothing is uploaded and the source quality is retained. Finished videos are written straight to the location you chose.

## Use case

A social media manager records a 15-minute product demo and needs assets for a week of posts. Using Split Video, they cut it into four standalone clips. With Insert Videos, they drop a branded intro at the start of each clip. Finally, with Decor Video, they add a headline and a call-to-action caption — each with a dark scrim so the text stays readable over bright footage — timed to appear only during the relevant moments. In minutes, and without uploading a single file, they have a full set of on-brand, ready-to-publish marketing videos.
