/**
 * Flattens a (possibly nested) set of inserts into an ordered list of playable
 * "leaves" — contiguous slices of a single source (the base video or a clip).
 * A clip can itself contain inserts, so clips are expanded recursively. This
 * powers both the live preview and the export without re-encoding logic
 * needing to know about the tree shape.
 */

export interface InsertNode {
  id: string;
  parentId?: string; // undefined = base video
  time: number; // position within the parent source
  duration: number; // clip length
  url?: string; // object URL, for preview
}

export interface Leaf {
  sourceKey: string; // "base" or an insert id
  isBase: boolean;
  url?: string;
  inStart: number; // in/out within the source media
  inEnd: number;
  compStart: number; // position within the combined timeline
  compEnd: number;
  depth: number; // nesting depth (0 = base slice, 1 = clip, 2 = clip-in-clip…)
}

/** Keep only inserts whose whole parent chain is present (renderable). */
export function renderableInserts(nodes: InsertNode[]): InsertNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, boolean>();
  const ok = (n: InsertNode): boolean => {
    const cached = memo.get(n.id);
    if (cached !== undefined) return cached;
    let res = true;
    if (n.parentId) {
      const p = byId.get(n.parentId);
      res = p ? ok(p) : false;
    }
    memo.set(n.id, res);
    return res;
  };
  return nodes.filter(ok);
}

export function buildLeaves(
  baseDuration: number,
  baseUrl: string | undefined,
  nodes: InsertNode[],
): Leaf[] {
  const good = renderableInserts(nodes);
  const childrenOf = (key: string | undefined) =>
    good.filter((n) => (n.parentId ?? undefined) === key).sort((a, b) => a.time - b.time);

  const leaves: Leaf[] = [];
  let comp = 0;
  const push = (
    sourceKey: string,
    isBase: boolean,
    url: string | undefined,
    s: number,
    e: number,
    depth: number,
  ) => {
    if (e - s < 0.02) return;
    leaves.push({ sourceKey, isBase, url, inStart: s, inEnd: e, compStart: comp, compEnd: comp + (e - s), depth });
    comp += e - s;
  };

  const expand = (
    key: string | undefined,
    url: string | undefined,
    duration: number,
    depth: number,
  ) => {
    const sourceKey = key ?? "base";
    const isBase = key === undefined;
    let prev = 0;
    for (const child of childrenOf(key)) {
      const t = Math.min(Math.max(child.time, 0), duration);
      push(sourceKey, isBase, url, prev, t, depth);
      expand(child.id, child.url, child.duration, depth + 1);
      prev = t;
    }
    push(sourceKey, isBase, url, prev, duration, depth);
  };

  expand(undefined, baseUrl, baseDuration, 0);
  return leaves;
}

export function leafTotal(leaves: Leaf[]): number {
  return leaves.length ? leaves[leaves.length - 1].compEnd : 0;
}

export function leafIndexAt(leaves: Leaf[], comp: number): number {
  for (let i = 0; i < leaves.length; i++) {
    if (comp < leaves[i].compEnd - 0.001) return i;
  }
  return Math.max(0, leaves.length - 1);
}

/** Local media time within a leaf for a combined-timeline position. */
export function leafLocal(leaf: Leaf, comp: number): number {
  return leaf.inStart + (comp - leaf.compStart);
}

/** Combined position of a clip's first appearance (for jumping to it). */
export function insertStartComp(leaves: Leaf[], insertId: string): number | null {
  const leaf = leaves.find((l) => l.sourceKey === insertId);
  return leaf ? leaf.compStart : null;
}

/** The equivalent base-video time at a combined position (for base overlays). */
export function compToBaseTime(leaves: Leaf[], comp: number): number {
  let base = 0;
  for (const leaf of leaves) {
    if (comp <= leaf.compStart) break;
    const within = Math.min(comp, leaf.compEnd) - leaf.compStart;
    if (leaf.isBase) base += within;
  }
  return base;
}
