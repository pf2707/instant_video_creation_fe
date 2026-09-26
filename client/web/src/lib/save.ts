import type { ExportedFile } from "./ffmpeg";

// The File System Access API lets the user pick a save location (Chrome/Edge).
// Crucially, the picker must be opened while the page still has "transient user
// activation" from the click — i.e. BEFORE the long ffmpeg export runs. So we
// split saving into two steps: pickSink() (during the click) and writeSink()
// (after export). Browsers without the API fall back to normal downloads.
const hasSaveFilePicker = "showSaveFilePicker" in window;
const hasDirectoryPicker = "showDirectoryPicker" in window;

export type Sink =
  | { mode: "dir"; dir: any }
  | { mode: "file"; file: any }
  | { mode: "download" };

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Ask the user where to save, during the click gesture.
 * Returns null if the user cancelled the picker.
 */
export async function pickSink(
  count: number,
  suggestedName: string,
): Promise<Sink | null> {
  try {
    if (count > 1 && hasDirectoryPicker) {
      // @ts-expect-error – File System Access API not in TS lib yet.
      const dir = await window.showDirectoryPicker({ mode: "readwrite" });
      return { mode: "dir", dir };
    }
    if (count === 1 && hasSaveFilePicker) {
      const ext = suggestedName.split(".").pop() ?? "mp4";
      // @ts-expect-error – File System Access API not in TS lib yet.
      const file = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: "Video", accept: { "video/*": [`.${ext}`] } }],
      });
      return { mode: "file", file };
    }
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") return null; // cancelled
    // Any other error: fall through to download mode.
  }
  return { mode: "download" };
}

/** Write exported files to a previously chosen sink. */
export async function writeSink(
  sink: Sink,
  files: ExportedFile[],
): Promise<void> {
  if (sink.mode === "dir") {
    for (const file of files) {
      const handle = await sink.dir.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.blob);
      await writable.close();
    }
    return;
  }
  if (sink.mode === "file") {
    const writable = await sink.file.createWritable();
    await writable.write(files[0].blob);
    await writable.close();
    return;
  }
  // download mode
  for (const file of files) download(file.blob, file.name);
}
