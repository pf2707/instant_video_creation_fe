import {
  createStore,
  get,
  set,
  del,
  values,
  type UseStore,
} from "idb-keyval";
import type { Project } from "./types";

// Separate object stores: small JSON project records vs. large video blobs.
const projectStore: UseStore = createStore("mvc-projects", "projects");
const blobStore: UseStore = createStore("mvc-blobs", "blobs");

const videoKey = (projectId: string) => `video:${projectId}`;
const clipKey = (insertId: string) => `clip:${insertId}`;

// --- Projects -------------------------------------------------------------

export async function listProjects(): Promise<Project[]> {
  const all = (await values(projectStore)) as Project[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Promise<Project | undefined> {
  return get<Project>(id, projectStore);
}

export async function saveProject(project: Project): Promise<void> {
  await set(project.id, { ...project, updatedAt: Date.now() }, projectStore);
}

export async function deleteProject(project: Project): Promise<void> {
  await del(project.id, projectStore);
  await del(videoKey(project.id), blobStore);
  await Promise.all(
    project.inserts.map((i) => del(clipKey(i.id), blobStore)),
  );
}

// --- Blobs ----------------------------------------------------------------

export function saveVideoBlob(projectId: string, blob: Blob): Promise<void> {
  return set(videoKey(projectId), blob, blobStore);
}

export function getVideoBlob(projectId: string): Promise<Blob | undefined> {
  return get<Blob>(videoKey(projectId), blobStore);
}

export function saveClipBlob(insertId: string, blob: Blob): Promise<void> {
  return set(clipKey(insertId), blob, blobStore);
}

export function getClipBlob(insertId: string): Promise<Blob | undefined> {
  return get<Blob>(clipKey(insertId), blobStore);
}

export function deleteClipBlob(insertId: string): Promise<void> {
  return del(clipKey(insertId), blobStore);
}
