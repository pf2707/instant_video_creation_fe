import { create } from "zustand";
import type { FeatureType, Project, TextOverlay, VideoMeta } from "./types";
import { createProject } from "./types";
import * as db from "./db";
import { probeVideo } from "./lib/format";

type Route = "dashboard" | "editor";

interface AppState {
  route: Route;
  projects: Project[];
  current: Project | null;
  /** Object URL for the current base video (preview + frame extraction). */
  videoUrl: string | null;
  busy: boolean;

  init: () => Promise<void>;
  newProject: (type: FeatureType) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  closeEditor: () => void;
  removeProject: (project: Project) => Promise<void>;

  patchCurrent: (patch: Partial<Project>) => void;
  setBaseVideo: (file: File) => Promise<void>;

  addCut: (time: number) => void;
  removeCut: (id: string) => void;

  addInsert: (time: number, parentId?: string) => void;
  removeInsert: (id: string) => void;
  setInsertClip: (id: string, file: File) => Promise<void>;

  /** Last font size the user set, reused for the next new overlay. */
  lastFontSize: number | null;
  /** Last overlay position (0..1), reused for the next new overlay. */
  lastOverlayX: number | null;
  lastOverlayY: number | null;
  addOverlay: (start?: number) => string | undefined;
  updateOverlay: (id: string, patch: Partial<TextOverlay>) => void;
  removeOverlay: (id: string) => void;

  persist: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  route: "dashboard",
  projects: [],
  current: null,
  videoUrl: null,
  busy: false,
  lastFontSize: null,
  lastOverlayX: null,
  lastOverlayY: null,

  init: async () => {
    const projects = await db.listProjects();
    set({ projects });
  },

  newProject: async (type) => {
    const project = createProject(type);
    await db.saveProject(project);
    set({ current: project, route: "editor", videoUrl: null });
    await get().init();
  },

  openProject: async (id) => {
    const project = await db.getProject(id);
    if (!project) return;
    // Backfill fields added after this project was first saved.
    project.overlays ??= [];
    project.cuts ??= [];
    project.inserts ??= [];
    const blob = await db.getVideoBlob(id);
    const prev = get().videoUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      current: project,
      route: "editor",
      videoUrl: blob ? URL.createObjectURL(blob) : null,
    });
  },

  closeEditor: () => {
    const prev = get().videoUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({ route: "dashboard", current: null, videoUrl: null });
    get().init();
  },

  removeProject: async (project) => {
    await db.deleteProject(project);
    await get().init();
  },

  patchCurrent: (patch) => {
    const current = get().current;
    if (!current) return;
    const updated = { ...current, ...patch, updatedAt: Date.now() };
    set({ current: updated });
    db.saveProject(updated);
  },

  setBaseVideo: async (file) => {
    const current = get().current;
    if (!current) return;
    set({ busy: true });
    try {
      const { duration, width, height } = await probeVideo(file);
      const video: VideoMeta = {
        name: file.name,
        mimeType: file.type || "video/mp4",
        size: file.size,
        duration,
        width,
        height,
      };
      await db.saveVideoBlob(current.id, file);
      const prev = get().videoUrl;
      if (prev) URL.revokeObjectURL(prev);
      const name =
        current.name === "Untitled project"
          ? file.name.replace(/\.[^.]+$/, "")
          : current.name;
      const updated = {
        ...current,
        video,
        name,
        updatedAt: Date.now(),
      };
      await db.saveProject(updated);
      set({ current: updated, videoUrl: URL.createObjectURL(file) });
    } finally {
      set({ busy: false });
    }
  },

  addCut: (time) => {
    const current = get().current;
    if (!current) return;
    if (current.cuts.some((c) => Math.abs(c.time - time) < 0.05)) return;
    const cuts = [...current.cuts, { id: crypto.randomUUID(), time }].sort(
      (a, b) => a.time - b.time,
    );
    get().patchCurrent({ cuts });
  },

  removeCut: (id) => {
    const current = get().current;
    if (!current) return;
    get().patchCurrent({ cuts: current.cuts.filter((c) => c.id !== id) });
  },

  addInsert: (time, parentId) => {
    const current = get().current;
    if (!current) return;
    // Allow stacking at the same spot, but don't create two EMPTY points there
    // within the same parent source.
    if (
      current.inserts.some(
        (i) => i.parentId === parentId && Math.abs(i.time - time) < 0.05 && !i.clip,
      )
    )
      return;
    const inserts = [
      ...current.inserts,
      { id: crypto.randomUUID(), time, parentId },
    ].sort((a, b) => a.time - b.time);
    get().patchCurrent({ inserts });
  },

  removeInsert: (id) => {
    const current = get().current;
    if (!current) return;
    // Collect the insert and all of its descendants (nested clips).
    const toRemove = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const i of current.inserts) {
        if (i.parentId && toRemove.has(i.parentId) && !toRemove.has(i.id)) {
          toRemove.add(i.id);
          grew = true;
        }
      }
    }
    toRemove.forEach((rid) => db.deleteClipBlob(rid));
    get().patchCurrent({
      inserts: current.inserts.filter((i) => !toRemove.has(i.id)),
    });
  },

  setInsertClip: async (id, file) => {
    const current = get().current;
    if (!current) return;
    set({ busy: true });
    try {
      const { duration, width, height } = await probeVideo(file);
      await db.saveClipBlob(id, file);
      const inserts = current.inserts.map((i) =>
        i.id === id
          ? {
              ...i,
              clip: {
                name: file.name,
                mimeType: file.type || "video/mp4",
                size: file.size,
                duration,
                width,
                height,
              },
            }
          : i,
      );
      get().patchCurrent({ inserts });
    } finally {
      set({ busy: false });
    }
  },

  addOverlay: (start) => {
    const current = get().current;
    if (!current || !current.video) return undefined;
    const fontSize =
      get().lastFontSize ?? Math.round(current.video.height * 0.08);
    const startTime = Math.min(Math.max(start ?? 0, 0), current.video.duration);
    const overlay: TextOverlay = {
      id: crypto.randomUUID(),
      text: "Your text",
      x: get().lastOverlayX ?? 0.5,
      y: get().lastOverlayY ?? 0.5,
      fontSize,
      fontFamily: "Inter",
      bold: true,
      italic: false,
      color: "#ffffff",
      background: "dark",
      start: startTime,
      end: current.video.duration,
    };
    get().patchCurrent({ overlays: [...current.overlays, overlay] });
    return overlay.id;
  },

  updateOverlay: (id, patch) => {
    const current = get().current;
    if (!current) return;
    // Remember font size and position for the next new overlay.
    if (patch.fontSize != null) set({ lastFontSize: patch.fontSize });
    if (patch.x != null) set({ lastOverlayX: patch.x });
    if (patch.y != null) set({ lastOverlayY: patch.y });
    get().patchCurrent({
      overlays: current.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  },

  removeOverlay: (id) => {
    const current = get().current;
    if (!current) return;
    get().patchCurrent({ overlays: current.overlays.filter((o) => o.id !== id) });
  },

  persist: async () => {
    const current = get().current;
    if (current) await db.saveProject(current);
    await get().init();
  },
}));
