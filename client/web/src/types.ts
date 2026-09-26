export type FeatureType = "split" | "insert";
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
  time: number;
  /** Metadata of the uploaded clip for this point, if any. */
  clip?: VideoMeta;
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
    format: "mp4",
    quality: "original",
  };
}
