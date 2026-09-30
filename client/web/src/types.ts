export type FeatureType = "split" | "insert" | "decor";
export type OutputFormat = "mp4" | "mov";
export type Quality = "original" | "high" | "medium";

export interface VideoMeta {
  name: string;
  mimeType: string;
  size: number;
  duration: number; // seconds
  width: number;
  height: number;
}

/** A cut point for the Split feature (timestamp in seconds). */
export interface Cut {
  id: string;
  time: number;
}

/** An insert point for the Insert feature. */
export interface InsertPoint {
  id: string;
  /** Position (seconds) within the parent source. */
  time: number;
  /**
   * Which source this clip is inserted into: undefined = the base video,
   * otherwise the id of another insert (nesting a clip inside a clip).
   */
  parentId?: string;
  /** Metadata of the uploaded clip for this point, if any. */
  clip?: VideoMeta;
}

/** A text overlay for the Decor feature. */
export interface TextOverlay {
  id: string;
  text: string;
  /** Center position as a fraction (0..1) of the video width/height. */
  x: number;
  y: number;
  /** Font size in video pixels. */
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  color: string; // hex
  /** Semi-transparent scrim behind the text for readability. */
  background: "none" | "dark" | "light";
  /** Time range (seconds) the overlay is visible. */
  start: number;
  end: number;
}

export interface Project {
  id: string;
  name: string;
  type: FeatureType;
  createdAt: number;
  updatedAt: number;
  /** Base video metadata (undefined until a video is uploaded). */
  video?: VideoMeta;
  cuts: Cut[];
  inserts: InsertPoint[];
  overlays: TextOverlay[];
  format: OutputFormat;
  quality: Quality;
}

export function createProject(type: FeatureType): Project {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name: "Untitled project",
    type,
    createdAt: now,
    updatedAt: now,
    cuts: [],
    inserts: [],
    overlays: [],
    format: "mp4",
    quality: "original",
  };
}
