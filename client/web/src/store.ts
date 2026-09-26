import { create } from "zustand";
import type { FeatureType, Project, VideoMeta } from "./types";
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

  addInsert: (time: number) => void;
  removeInsert: (id: string) => void;
  setInsertClip: (id: string, file: File) => Promise<void>;

  persist: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  route: "dashboard",
  projects: [],
  current: null,
  videoUrl: null,
  busy: false,

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

  addInsert: (time) => {
    const current = get().current;
    if (!current) return;
    if (current.inserts.some((i) => Math.abs(i.time - time) < 0.05)) return;
    const inserts = [
      ...current.inserts,
      { id: crypto.randomUUID(), time },
    ].sort((a, b) => a.time - b.time);
    get().patchCurrent({ inserts });
  },

  removeInsert: (id) => {
    const current = get().current;
    if (!current) return;
    db.deleteClipBlob(id);
    get().patchCurrent({
      inserts: current.inserts.filter((i) => i.id !== id),
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

  persist: async () => {
    const current = get().current;
    if (current) await db.saveProject(current);
    await get().init();
  },
}));
