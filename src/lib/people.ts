import type { DecryptedEntry, LinkTone, Person, PersonGroup, PersonLink, PersonNp } from "@/types/db";
import { toDay } from "@/lib/stats";

/**
 * Pure People-page logic: group colours, connection tones, per-person log stats and the
 * force-directed "web" layout. No React, no network.
 */

// ── Groups ───────────────────────────────────────────────────────────────────

/**
 * Group colours, in picker order (four rows of 8, by hue). All are ≥ 3.4:1 on white (group names
 * and initials are drawn in them), picked from the Tailwind scale to be as far apart (CIEDE2000)
 * as 32 colours allow. Green, emerald, red and rose are left out on purpose — they mean
 * positive / negative connections on the same page. Keys are stored in `np_person_groups.color`
 * (DB check `^[a-z]{1,20}$`), so never rename or remove one.
 */
export const GROUP_COLORS: { key: string; label: string; hex: string }[] = [
  { key: "navy", label: "Navy", hex: "#1e3a8a" },
  { key: "ocean", label: "Ocean", hex: "#0369a1" },
  { key: "blue", label: "Blue", hex: "#2563eb" },
  { key: "cornflower", label: "Cornflower", hex: "#3b82f6" },
  { key: "sky", label: "Sky", hex: "#0284c7" },
  { key: "aqua", label: "Aqua", hex: "#0891b2" },
  { key: "cyan", label: "Cyan", hex: "#0e7490" },
  { key: "petrol", label: "Petrol", hex: "#164e63" },

  { key: "indigo", label: "Indigo", hex: "#4f46e5" },
  { key: "periwinkle", label: "Periwinkle", hex: "#6366f1" },
  { key: "violet", label: "Violet", hex: "#7c3aed" },
  { key: "grape", label: "Grape", hex: "#4c1d95" },
  { key: "lilac", label: "Lilac", hex: "#a855f7" },
  { key: "plum", label: "Plum", hex: "#86198f" },
  { key: "magenta", label: "Magenta", hex: "#a21caf" },
  { key: "fuchsia", label: "Fuchsia", hex: "#c026d3" },

  { key: "orchid", label: "Orchid", hex: "#d946ef" },
  { key: "flamingo", label: "Flamingo", hex: "#ec4899" },
  { key: "pink", label: "Pink", hex: "#db2777" },
  { key: "berry", label: "Berry", hex: "#9d174d" },
  { key: "brown", label: "Brown", hex: "#7c2d12" },
  { key: "bronze", label: "Bronze", hex: "#854d0e" },
  { key: "amber", label: "Amber", hex: "#b45309" },
  { key: "orange", label: "Orange", hex: "#ea580c" },

  { key: "ochre", label: "Ochre", hex: "#a16207" },
  { key: "olive", label: "Olive", hex: "#3f6212" },
  { key: "teal", label: "Teal", hex: "#0f766e" },
  { key: "pine", label: "Pine", hex: "#134e4a" },
  { key: "slate", label: "Slate", hex: "#475569" },
  { key: "charcoal", label: "Charcoal", hex: "#334155" },
  { key: "graphite", label: "Graphite", hex: "#52525b" },
  { key: "stone", label: "Stone", hex: "#57534e" },
];

/** The DB default; also what unknown keys fall back to. */
export const DEFAULT_GROUP_COLOR = "indigo";

/** Order new groups get colours in: each one far from the last, so siblings never look alike. */
const AUTO_ORDER = [
  "indigo",
  "orange",
  "teal",
  "fuchsia",
  "sky",
  "amber",
  "violet",
  "slate",
  "pink",
  "cyan",
  "plum",
  "brown",
  "blue",
  "berry",
  "navy",
  "stone",
  "olive",
  "lilac",
  "aqua",
  "ochre",
  "cornflower",
  "orchid",
  "pine",
  "flamingo",
  "periwinkle",
  "bronze",
  "petrol",
  "magenta",
  "ocean",
  "grape",
  "charcoal",
  "graphite",
];

/** Hex for a stored group colour key; unknown keys fall back to the default colour. */
export function groupHex(key: string | null | undefined): string {
  const c = GROUP_COLORS.find((g) => g.key === key) ?? GROUP_COLORS.find((g) => g.key === DEFAULT_GROUP_COLOR)!;
  return c.hex;
}

/** `hex` mixed with white: t = 0 → white, 1 → the colour itself. For SVG fills (no color-mix). */
export function tint(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(255 + (c - 255) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The next colour for a new group: the first in AUTO_ORDER no group uses yet (cycles once all are taken). */
export function nextGroupColor(used: string[]): string {
  return AUTO_ORDER.find((k) => !used.includes(k)) ?? AUTO_ORDER[used.length % AUTO_ORDER.length];
}

export interface GroupTree {
  /** Every group, depth-first (parents before their subgroups; siblings in list order). */
  ordered: { group: PersonGroup; depth: number }[];
  group: (id: number) => PersonGroup | undefined;
  /** Effective parent: null for top-level groups, missing parents and loop breaks. */
  parentOf: (id: number) => number | null;
  /** Subgroups of `id` (null = top-level groups), in list order. */
  childrenOf: (id: number | null) => PersonGroup[];
  /** Parent, grandparent, … (nearest first). */
  ancestors: (id: number) => number[];
  /** Every group below `id`, depth-first. */
  descendants: (id: number) => number[];
  /** Direct members plus everyone in its subgroups (unique). */
  allMembers: (id: number) => number[];
  /** Levels of subgroups below: 0 = none. */
  height: (id: number) => number;
  /** Names from the top-level group down to this one. */
  path: (id: number) => string[];
}

/**
 * The group hierarchy from flat rows (already in saved order). Defensive about bad data: a
 * parent that doesn't exist or a loop makes that group top-level instead of hanging the page.
 */
export function buildGroupTree(groups: PersonGroup[]): GroupTree {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const parent = new Map<number, number | null>();
  for (const g of groups) parent.set(g.id, g.parent_id !== null && byId.has(g.parent_id) ? g.parent_id : null);
  // Break loops: walk up from each group; reaching it again means it's in a loop.
  for (const g of groups) {
    const seen = new Set<number>([g.id]);
    let cur = parent.get(g.id) ?? null;
    while (cur !== null) {
      if (seen.has(cur)) {
        parent.set(g.id, null);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur) ?? null;
    }
  }
  const children = new Map<number | null, PersonGroup[]>();
  for (const g of groups) {
    const p = parent.get(g.id) ?? null;
    children.set(p, [...(children.get(p) ?? []), g]);
  }
  const ordered: { group: PersonGroup; depth: number }[] = [];
  const height = new Map<number, number>();
  const walk = (g: PersonGroup, depth: number): number => {
    ordered.push({ group: g, depth });
    let h = 0;
    for (const c of children.get(g.id) ?? []) h = Math.max(h, walk(c, depth + 1) + 1);
    height.set(g.id, h);
    return h;
  };
  for (const g of children.get(null) ?? []) walk(g, 0);

  const descendants = (id: number): number[] => (children.get(id) ?? []).flatMap((c) => [c.id, ...descendants(c.id)]);
  const ancestors = (id: number): number[] => {
    const out: number[] = [];
    let cur = parent.get(id) ?? null;
    while (cur !== null) {
      out.push(cur);
      cur = parent.get(cur) ?? null;
    }
    return out;
  };
  return {
    ordered,
    group: (id) => byId.get(id),
    parentOf: (id) => parent.get(id) ?? null,
    childrenOf: (id) => children.get(id) ?? [],
    ancestors,
    descendants,
    allMembers: (id) => [...new Set([id, ...descendants(id)].flatMap((g) => byId.get(g)?.members ?? []))],
    height: (id) => height.get(id) ?? 0,
    path: (id) => [...ancestors(id).reverse(), id].map((g) => byId.get(g)?.name ?? "…"),
  };
}

// ── Connections ──────────────────────────────────────────────────────────────

/**
 * Connection tones. Colours are theme tokens with hex fallbacks (SVG strokes vanish when a
 * token is missing, e.g. with Turbopack's stale dev CSS cache).
 */
export const TONES: Record<LinkTone, { label: string; color: string }> = {
  [-1]: { label: "Negative", color: "var(--tie-negative, #dc2626)" },
  0: { label: "Neutral", color: "var(--tie-neutral, #8f8d86)" },
  1: { label: "Positive", color: "var(--tie-positive, #16a34a)" },
};

export const TONE_ORDER: LinkTone[] = [-1, 0, 1];

/** Your own energy with a person ("vibe") uses the same scale and colours, in energy words. */
export const VIBE_LABELS: Record<LinkTone, string> = { [-1]: "Draining", 0: "Neutral", 1: "Energizing" };

/** Connections are undirected and stored once, smaller id first. */
export function orderPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

/** A person's connections with the other end resolved, strongest feeling first, then by name. */
export function connectionsOf(
  personId: number,
  links: PersonLink[],
  nameOf: (id: number) => string,
): { link: PersonLink; other: number }[] {
  return links
    .filter((l) => l.person_a === personId || l.person_b === personId)
    .map((link) => ({ link, other: link.person_a === personId ? link.person_b : link.person_a }))
    .sort(
      (x, y) =>
        Math.abs(y.link.tone) - Math.abs(x.link.tone) ||
        y.link.tone - x.link.tone ||
        nameOf(x.other).localeCompare(nameOf(y.other)),
    );
}

// ── People ───────────────────────────────────────────────────────────────────

/** "Jana Nováková" → "JN", "Mom" → "Mo", "" → "?". Code-point safe. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const chars = Array.from(words[0]);
    return chars[0].toUpperCase() + (chars[1] ?? "").toLowerCase();
  }
  return (Array.from(words[0])[0] + Array.from(words[words.length - 1])[0]).toUpperCase();
}

/** Saved order, with hidden people after the visible ones (each group keeps its order). */
export function displayOrder(people: Person[]): Person[] {
  return [...people].sort((a, b) => Number(a.hidden) - Number(b.hidden));
}

export interface PersonStats {
  /** Logs that include the person. */
  count: number;
  firstDay: number;
  lastDay: number;
  /** How many of those logs rated their NP Low / OK / Great. */
  np: [number, number, number];
  /** NP on their most recent logs, oldest first (at most RECENT_NP). */
  recent: PersonNp[];
}

export const RECENT_NP = 16;

/** Per-person log stats from the cached history (any order). */
export function personStats(entries: DecryptedEntry[]): Map<number, PersonStats> {
  const rows: { id: number; day: number; at: string; np: PersonNp }[] = [];
  for (const e of entries) {
    const day = toDay(e.entry_date);
    for (const p of e.people ?? []) rows.push({ id: p.person_id, day, at: e.created_at, np: p.np });
  }
  rows.sort((a, b) => a.day - b.day || a.at.localeCompare(b.at));

  const map = new Map<number, PersonStats>();
  for (const r of rows) {
    let s = map.get(r.id);
    if (!s) {
      s = { count: 0, firstDay: r.day, lastDay: r.day, np: [0, 0, 0], recent: [] };
      map.set(r.id, s);
    }
    s.count++;
    s.lastDay = r.day;
    s.np[r.np - 1]++;
    s.recent.push(r.np);
    if (s.recent.length > RECENT_NP) s.recent.shift();
  }
  return map;
}

/** "Recently" for ordering the New Entry people picker. */
export const RECENT_USE_DAYS = 90;

/**
 * People in the order the New Entry picker offers them: most logged in the last RECENT_USE_DAYS
 * first, then most logged overall, then their saved order (so new people go last). Without the
 * history yet, the saved order as is.
 */
export function rankByUse<T extends { id: number }>(people: T[], entries: DecryptedEntry[] | undefined, today: number): T[] {
  if (!entries) return people;
  const recent = new Map<number, number>();
  const total = new Map<number, number>();
  for (const e of entries) {
    const isRecent = toDay(e.entry_date) > today - RECENT_USE_DAYS;
    for (const { person_id } of e.people ?? []) {
      total.set(person_id, (total.get(person_id) ?? 0) + 1);
      if (isRecent) recent.set(person_id, (recent.get(person_id) ?? 0) + 1);
    }
  }
  return people
    .map((p, i) => ({ p, i }))
    .sort(
      (a, b) =>
        (recent.get(b.p.id) ?? 0) - (recent.get(a.p.id) ?? 0) ||
        (total.get(b.p.id) ?? 0) - (total.get(a.p.id) ?? 0) ||
        a.i - b.i,
    )
    .map(({ p }) => p);
}

/** Average NP (1–3) over all of a person's logs, or null without logs. */
export function averageNp(s: PersonStats | undefined): number | null {
  if (!s || s.count === 0) return null;
  return (s.np[0] + 2 * s.np[1] + 3 * s.np[2]) / s.count;
}

/** 0 → "today", 1 → "yesterday", 9 → "9 days ago", 30 → "4 weeks ago", 400 → "1 year ago". */
export function fmtAgo(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30.4)} months ago`;
  const years = Math.max(1, Math.round(days / 365));
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

// ── Geometry ─────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** Convex hull (Andrew's monotone chain), counter-clockwise; duplicates removed; ≤ 2 points as-is. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
  if (pts.length <= 2) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Separation between two boxes: > 0 = that many px apart, < 0 = overlapping by that much. */
export function boxGap(a: Box, b: Box): number {
  return Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
}

export interface LabelSpot {
  x: number;
  /** Text baseline. */
  y: number;
  anchor: "start" | "middle" | "end";
  box: Box;
}

/**
 * Where a group's name goes on the web. Candidates around each member — above (preferred),
 * under their name, right, left — are scored by how far the label stays from `obstacles`
 * (people's discs and names) and inside `bounds`; the first one that's clear wins, else the
 * least crowded. `labelW` is the label's (estimated) width; `lift` pushes the spots further out
 * (an outer group's label sits in its wider halo, outside its subgroups' labels).
 */
export function groupLabelSpot(
  members: Point[],
  obstacles: Box[],
  labelW: number,
  o: { nodeR: number; nameY: number; bounds: Box; lift?: number },
): LabelSpot {
  const CLEAR = 2;
  let best: LabelSpot | null = null;
  let bestScore = -Infinity;
  const consider = (x: number, y: number, anchor: LabelSpot["anchor"], pref: number) => {
    const x0 = anchor === "start" ? x : anchor === "end" ? x - labelW : x - labelW / 2;
    const box = { x0, y0: y - 8, x1: x0 + labelW, y1: y + 2 };
    let gap = Math.min(box.x0 - o.bounds.x0, o.bounds.x1 - box.x1, box.y0 - o.bounds.y0, o.bounds.y1 - box.y1);
    for (const ob of obstacles) gap = Math.min(gap, boxGap(box, ob));
    // Clear spots tie on gap, then go by preference and height; crowded ones by how crowded.
    const score = Math.min(gap, CLEAR) * 100 + pref - y * 1e-3;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y, anchor, box };
    }
  };
  const lift = o.lift ?? 0;
  for (const m of members) {
    consider(m.x, m.y - o.nodeR - 6 - lift, "middle", 4);
    consider(m.x, m.y + o.nameY + 13 + lift, "middle", 3);
    consider(m.x + o.nodeR + 6 + lift, m.y + 3, "start", 2);
    consider(m.x - o.nodeR - 6 - lift, m.y + 3, "end", 2);
  }
  return best!;
}

// ── Web layout ───────────────────────────────────────────────────────────────

export interface WebLayoutInput {
  /** People on the web, in display order (also the tie-break for the starting circle). */
  ids: number[];
  /** Connections; `w` scales the pull (positive ties pull closer than negative ones). */
  links: { a: number; b: number; w?: number }[];
  /** Member ids per group (members are pulled towards their group's centre). */
  groups: number[][];
  width: number;
  height: number;
  /** Free space kept around the layout for halos and labels (px). */
  pad: { x: number; top: number; bottom: number };
  /** Minimum distance between two people, horizontally / vertically (px). */
  gap: { x: number; y: number };
}

/** Pull of a connection by tone: friends sit closer, tense pairs a little further apart. */
export const TONE_PULL: Record<LinkTone, number> = { [-1]: 0.6, 0: 1, 1: 1.4 };

const ITERATIONS = 400;
const GRAVITY = 0.12;
const COHESION = 0.9;
/** Max px per abstract unit: small webs don't get stretched across the whole card. */
const MAX_SCALE = 150;

/**
 * Deterministic force-directed layout (Fruchterman–Reingold with gravity and group cohesion),
 * computed in abstract units (ideal edge length 1), then fitted into the box and de-overlapped.
 * Same input → same positions, so the web looks the same on every visit.
 */
export function layoutWeb(input: WebLayoutInput): Map<number, Point> {
  const { ids, width, height, pad, gap } = input;
  const n = ids.length;
  const out = new Map<number, Point>();
  if (n === 0) return out;
  const box = { x0: pad.x, x1: width - pad.x, y0: pad.top, y1: height - pad.bottom };
  if (n === 1) {
    out.set(ids[0], { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
    return out;
  }

  const index = new Map(ids.map((id, i) => [id, i]));
  const edges = input.links.flatMap((l) => {
    const a = index.get(l.a);
    const b = index.get(l.b);
    return a === undefined || b === undefined || a === b ? [] : [{ a, b, w: l.w ?? 1 }];
  });
  const groups = input.groups
    .map((m) => [...new Set(m.flatMap((id) => (index.has(id) ? [index.get(id)!] : [])))])
    .filter((m) => m.length >= 2);

  // Start on a circle, grouped people side by side (first group wins), so groups begin together.
  const firstGroup = new Map<number, number>();
  input.groups.forEach((members, g) => members.forEach((id) => firstGroup.has(id) || firstGroup.set(id, g)));
  const order = ids.map((id, i) => ({ i, g: firstGroup.get(id) ?? Infinity })).sort((p, q) => p.g - q.g || p.i - q.i);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const r0 = Math.max(1, n / (2 * Math.PI));
  order.forEach(({ i }, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / n;
    x[i] = r0 * Math.cos(a);
    y[i] = r0 * Math.sin(a);
  });

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let it = 0; it < ITERATIONS; it++) {
    const temp = 0.6 * (1 - it / ITERATIONS) + 0.005;
    dx.fill(0);
    dy.fill(0);
    // Repulsion between everyone: 1/d.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ex = x[i] - x[j];
        const ey = y[i] - y[j];
        const d2 = Math.max(ex * ex + ey * ey, 1e-4);
        const f = 1 / d2; // (1/d) along the unit vector (e/d)
        dx[i] += ex * f;
        dy[i] += ey * f;
        dx[j] -= ex * f;
        dy[j] -= ey * f;
      }
    }
    // Attraction along connections: d², scaled by the tone's pull.
    for (const { a, b, w } of edges) {
      const ex = x[a] - x[b];
      const ey = y[a] - y[b];
      const d = Math.sqrt(ex * ex + ey * ey);
      const f = d * w; // d² along the unit vector
      dx[a] -= ex * f;
      dy[a] -= ey * f;
      dx[b] += ex * f;
      dy[b] += ey * f;
    }
    // Group members drift towards their group's centre.
    for (const members of groups) {
      let cx = 0;
      let cy = 0;
      for (const i of members) {
        cx += x[i];
        cy += y[i];
      }
      cx /= members.length;
      cy /= members.length;
      for (const i of members) {
        dx[i] += (cx - x[i]) * COHESION;
        dy[i] += (cy - y[i]) * COHESION;
      }
    }
    for (let i = 0; i < n; i++) {
      // Gravity (∝ d²) keeps loners and separate clusters from drifting off.
      const d = Math.sqrt(x[i] * x[i] + y[i] * y[i]);
      dx[i] -= x[i] * d * GRAVITY;
      dy[i] -= y[i] * d * GRAVITY;
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]);
      if (len > 0) {
        const step = Math.min(len, temp);
        x[i] += (dx[i] / len) * step;
        y[i] += (dy[i] / len) * step;
      }
    }
  }

  // Fit into the box (each axis on its own, but never more than 1.6× stretched vs. the other).
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]);
    maxX = Math.max(maxX, x[i]);
    minY = Math.min(minY, y[i]);
    maxY = Math.max(maxY, y[i]);
  }
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  let sx = Math.min(MAX_SCALE, maxX > minX ? bw / (maxX - minX) : MAX_SCALE);
  let sy = Math.min(MAX_SCALE, maxY > minY ? bh / (maxY - minY) : MAX_SCALE);
  sx = Math.min(sx, sy * 1.6);
  sy = Math.min(sy, sx * 1.6);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = (box.x0 + box.x1) / 2 + (x[i] - midX) * sx;
    py[i] = (box.y0 + box.y1) / 2 + (y[i] - midY) * sy;
  }

  // De-overlap: push pairs apart until they're ≥ `gap` apart (elliptical: labels are wide).
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = (px[i] - px[j]) / gap.x;
        let ey = (py[i] - py[j]) / gap.y;
        let d = Math.sqrt(ex * ex + ey * ey);
        if (d >= 1) continue;
        if (d < 1e-6) {
          // Same spot: split along a fixed, index-based direction (deterministic).
          const a = (i * 2.399963) % (2 * Math.PI);
          ex = Math.cos(a);
          ey = Math.sin(a);
          d = 1e-6;
        }
        const push = (1 - d) / 2 + 0.001;
        const ux = ex / Math.max(d, 1e-6);
        const uy = ey / Math.max(d, 1e-6);
        px[i] += ux * push * gap.x;
        py[i] += uy * push * gap.y;
        px[j] -= ux * push * gap.x;
        py[j] -= uy * push * gap.y;
        moved = true;
      }
    }
    for (let i = 0; i < n; i++) {
      px[i] = Math.min(box.x1, Math.max(box.x0, px[i]));
      py[i] = Math.min(box.y1, Math.max(box.y0, py[i]));
    }
    if (!moved) break;
  }

  ids.forEach((id, i) => out.set(id, { x: px[i], y: py[i] }));
  return out;
}

/** Height for the web card: grows with the number of people, within limits (px). */
export function webHeight(people: number, wide: boolean): number {
  const base = wide ? 300 : 280;
  return Math.round(Math.min(wide ? 520 : 480, base + Math.max(0, people - 4) * (wide ? 14 : 16)));
}
