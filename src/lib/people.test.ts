import { describe, expect, it } from "vitest";
import { entry } from "@/test/fixtures";
import type { PersonGroup, PersonLink } from "@/types/db";
import {
  DEFAULT_GROUP_COLOR,
  GROUP_COLORS,
  RECENT_NP,
  averageNp,
  connectionsOf,
  convexHull,
  fmtAgo,
  groupHex,
  boxGap,
  buildGroupTree,
  groupLabelSpot,
  initials,
  layoutWeb,
  webHeight,
  nextGroupColor,
  orderPair,
  tint,
  personStats,
  rankByUse,
  type Box,
  type Point,
  type WebLayoutInput,
} from "@/lib/people";
import { toDay } from "@/lib/stats";

function link(id: number, a: number, b: number, tone: -1 | 0 | 1 = 0, label = ""): PersonLink {
  const [person_a, person_b] = orderPair(a, b);
  return { id, person_a, person_b, tone, label, updated_at: "2026-01-01T00:00:00Z" };
}

describe("groups", () => {
  it("groupHex falls back to the default colour for unknown keys", () => {
    expect(groupHex("teal")).toBe("#0f766e");
    expect(groupHex("nope")).toBe(groupHex(DEFAULT_GROUP_COLOR));
    expect(groupHex(null)).toBe("#4f46e5");
  });

  it("keeps every colour key valid for the DB and unique, including the original eight", () => {
    const keys = GROUP_COLORS.map((c) => c.key);
    expect(keys).toHaveLength(32);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(GROUP_COLORS.map((c) => c.hex)).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z]{1,20}$/);
    for (const k of ["indigo", "sky", "teal", "violet", "fuchsia", "amber", "orange", "slate"]) expect(keys).toContain(k);
  });

  it("tint mixes a colour with white", () => {
    expect(tint("#4f46e5", 1)).toBe("#4f46e5");
    expect(tint("#4f46e5", 0)).toBe("#ffffff");
    expect(tint("#000000", 0.5)).toBe("#808080");
  });

  it("nextGroupColor picks the first unused colour in its contrast order, then cycles", () => {
    expect(nextGroupColor([])).toBe("indigo");
    expect(nextGroupColor(["indigo"])).toBe("orange");
    expect(nextGroupColor(["indigo", "orange"])).toBe("teal");
    const all = GROUP_COLORS.map((c) => c.key);
    expect(all).toContain(nextGroupColor(all));
    // Every auto-picked colour is a real palette colour.
    const used: string[] = [];
    for (let i = 0; i < all.length; i++) used.push(nextGroupColor(used));
    expect(new Set(used)).toEqual(new Set(all));
  });
});

describe("buildGroupTree", () => {
  const g = (id: number, name: string, parent_id: number | null, members: number[] = []): PersonGroup => ({
    id,
    name,
    color: "indigo",
    position: null,
    parent_id,
    members,
  });

  it("nests groups depth-first and rolls members up", () => {
    // Madeira ⊃ { Dance Class ⊃ { Salsa }, Work Colleagues }, Family
    const tree = buildGroupTree([
      g(1, "Madeira", null, [9]),
      g(2, "Dance Class", 1, [1, 2]),
      g(3, "Work Colleagues", 1, [3, 2]),
      g(4, "Family", null, [5]),
      g(5, "Salsa", 2, [7]),
    ]);
    expect(tree.ordered.map((o) => [o.group.name, o.depth])).toEqual([
      ["Madeira", 0],
      ["Dance Class", 1],
      ["Salsa", 2],
      ["Work Colleagues", 1],
      ["Family", 0],
    ]);
    expect(tree.allMembers(1).sort()).toEqual([1, 2, 3, 7, 9]);
    expect(tree.allMembers(2).sort()).toEqual([1, 2, 7]);
    expect(tree.descendants(1)).toEqual([2, 5, 3]);
    expect(tree.ancestors(5)).toEqual([2, 1]);
    expect(tree.path(5)).toEqual(["Madeira", "Dance Class", "Salsa"]);
    expect(tree.height(1)).toBe(2);
    expect(tree.height(3)).toBe(0);
    expect(tree.childrenOf(null).map((x) => x.id)).toEqual([1, 4]);
  });

  it("treats missing parents and loops as top level instead of hanging", () => {
    const tree = buildGroupTree([g(1, "A", 2), g(2, "B", 1), g(3, "C", 99)]);
    expect(tree.ordered).toHaveLength(3);
    expect(tree.parentOf(3)).toBeNull();
    // The loop is broken at one end, so both groups are still shown.
    expect([tree.parentOf(1), tree.parentOf(2)].filter((p) => p === null)).toHaveLength(1);
  });
});

describe("connections", () => {
  it("orderPair puts the smaller id first", () => {
    expect(orderPair(5, 2)).toEqual([2, 5]);
    expect(orderPair(2, 5)).toEqual([2, 5]);
  });

  it("connectionsOf resolves the other end and sorts strong feelings first", () => {
    const names: Record<number, string> = { 1: "Me", 2: "Bea", 3: "Al", 4: "Cy", 5: "Dan" };
    const links = [link(1, 1, 2, 0), link(2, 3, 1, 1), link(3, 1, 4, -1), link(4, 2, 3, 1), link(5, 5, 1, 1)];
    const got = connectionsOf(1, links, (id) => names[id]);
    // Positive first (by name), then negative, then neutral; the 2↔3 link isn't 1's.
    expect(got.map((c) => c.other)).toEqual([3, 5, 4, 2]);
  });
});

describe("initials", () => {
  it("uses first + last word, or the first two letters of one word", () => {
    expect(initials("Jana Nováková")).toBe("JN");
    expect(initials("Anna Marie Svobodová")).toBe("AS");
    expect(initials("mom")).toBe("Mo");
    expect(initials("  Šárka  ")).toBe("Šá");
    expect(initials("X")).toBe("X");
    expect(initials("")).toBe("?");
  });
});

describe("personStats", () => {
  it("counts logs, first/last day, NP split and recent NP in date order", () => {
    const entries = [
      entry({ entry_date: "2026-03-05", people: [{ person_id: 1, np: 3 }] }),
      entry({
        entry_date: "2026-03-01",
        people: [
          { person_id: 1, np: 1 },
          { person_id: 2, np: 2 },
        ],
      }),
      entry({ entry_date: "2026-03-03", people: [{ person_id: 1, np: 2 }] }),
      entry({ entry_date: "2026-03-04" }),
    ];
    const stats = personStats(entries);
    const s1 = stats.get(1)!;
    expect(s1.count).toBe(3);
    expect(s1.firstDay).toBe(toDay("2026-03-01"));
    expect(s1.lastDay).toBe(toDay("2026-03-05"));
    expect(s1.np).toEqual([1, 1, 1]);
    expect(s1.recent).toEqual([1, 2, 3]);
    expect(averageNp(s1)).toBe(2);
    expect(stats.get(2)!.count).toBe(1);
    expect(stats.has(3)).toBe(false);
    expect(averageNp(undefined)).toBeNull();
  });

  it("keeps only the most recent NP values", () => {
    const entries = Array.from({ length: RECENT_NP + 4 }, (_, i) =>
      entry({ entry_date: `2026-04-${String(i + 1).padStart(2, "0")}`, people: [{ person_id: 7, np: i < 4 ? 1 : 3 }] }),
    );
    const s = personStats(entries).get(7)!;
    expect(s.recent).toHaveLength(RECENT_NP);
    expect(s.recent.every((np) => np === 3)).toBe(true);
    expect(s.count).toBe(RECENT_NP + 4);
  });
});

describe("rankByUse", () => {
  const today = toDay("2026-11-25");
  const ppl = [1, 2, 3, 4, 5].map((id) => ({ id }));
  const log = (date: string, ...ids: number[]) =>
    entry({ entry_date: date, people: ids.map((person_id) => ({ person_id, np: 2 as const })) });

  it("puts the most logged in the last 90 days first, then overall, then saved order", () => {
    const entries = [
      log("2026-11-20", 3, 4),
      log("2026-11-10", 3),
      log("2026-10-01", 4),
      log("2024-01-01", 2, 2, 2, 5), // long ago: only counts overall
      log("2024-02-01", 2),
    ];
    // 3: 2 recent · 4: 2 recent (+0) · 2: 0 recent, 4 overall · 5: 1 overall · 1: never
    expect(rankByUse(ppl, entries, today).map((p) => p.id)).toEqual([3, 4, 2, 5, 1]);
  });

  it("keeps the saved order without history", () => {
    expect(rankByUse(ppl, undefined, today).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    expect(rankByUse(ppl, [], today).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("fmtAgo", () => {
  it("reads naturally at every scale", () => {
    expect(fmtAgo(0)).toBe("today");
    expect(fmtAgo(1)).toBe("yesterday");
    expect(fmtAgo(9)).toBe("9 days ago");
    expect(fmtAgo(30)).toBe("4 weeks ago");
    expect(fmtAgo(100)).toBe("3 months ago");
    expect(fmtAgo(400)).toBe("1 year ago");
    expect(fmtAgo(800)).toBe("2 years ago");
  });
});

describe("convexHull", () => {
  it("drops inner points and duplicates", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 },
      { x: 4, y: 4 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 2, y: 2 });
  });

  it("returns one or two points as they are", () => {
    expect(convexHull([{ x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }]);
    expect(
      convexHull([
        { x: 3, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
    ]);
    expect(
      convexHull([
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("groupLabelSpot", () => {
  const o = { nodeR: 20, nameY: 34, bounds: { x0: 0, y0: 0, x1: 600, y1: 400 } };
  const disc = (p: Point): Box => ({ x0: p.x - 20, y0: p.y - 20, x1: p.x + 20, y1: p.y + 20 });
  const name = (p: Point): Box => ({ x0: p.x - 20, y0: p.y + 25, x1: p.x + 20, y1: p.y + 37 });
  const obstacles = (pts: Point[]) => pts.flatMap((p) => [disc(p), name(p)]);

  it("boxGap is positive when apart and negative when overlapping", () => {
    expect(boxGap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 15, y0: 0, x1: 20, y1: 10 })).toBe(5);
    expect(boxGap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 8, y0: 6, x1: 20, y1: 20 })).toBe(-2);
  });

  it("goes above the top member when nothing is in the way", () => {
    const members = [{ x: 100, y: 100 }, { x: 200, y: 200 }];
    const spot = groupLabelSpot(members, obstacles(members), 50, o);
    expect(spot).toMatchObject({ x: 100, y: 74, anchor: "middle" });
  });

  it("avoids an outsider's name sitting right above the members", () => {
    const members = [{ x: 100, y: 100 }];
    const outsider = { x: 100, y: 45 }; // its name (y 70–82) covers the spot above
    const spot = groupLabelSpot(members, obstacles([...members, outsider]), 50, o);
    expect(spot.y).not.toBe(74);
    for (const ob of obstacles([...members, outsider])) expect(boxGap(spot.box, ob)).toBeGreaterThanOrEqual(0);
  });

  it("stays inside the bounds", () => {
    const members = [{ x: 590, y: 20 }];
    const spot = groupLabelSpot(members, obstacles(members), 50, o);
    expect(spot.box.x1).toBeLessThanOrEqual(600);
    expect(spot.box.y0).toBeGreaterThanOrEqual(0);
  });
});

describe("layoutWeb", () => {
  const base: Omit<WebLayoutInput, "ids" | "links" | "groups"> = {
    width: 600,
    height: 420,
    pad: { x: 40, top: 40, bottom: 50 },
    gap: { x: 70, y: 56 },
  };
  const dist = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y);
  const ids = Array.from({ length: 10 }, (_, i) => i + 1);

  it("handles empty and single-person webs", () => {
    expect(layoutWeb({ ...base, ids: [], links: [], groups: [] }).size).toBe(0);
    const one = layoutWeb({ ...base, ids: [9], links: [], groups: [] });
    expect(one.get(9)).toEqual({ x: 300, y: (40 + 370) / 2 });
  });

  it("is deterministic", () => {
    const input = {
      ...base,
      ids,
      links: [
        { a: 1, b: 2 },
        { a: 3, b: 4, w: 1.4 },
      ],
      groups: [[5, 6, 7]],
    };
    expect([...layoutWeb(input)]).toEqual([...layoutWeb(input)]);
  });

  it("keeps everyone inside the padded box and apart from each other", () => {
    const pos = layoutWeb({
      ...base,
      ids,
      links: [
        { a: 1, b: 2 },
        { a: 2, b: 3 },
        { a: 3, b: 1 },
        { a: 4, b: 5 },
      ],
      groups: [
        [1, 2, 3],
        [6, 7],
      ],
    });
    expect(pos.size).toBe(10);
    for (const p of pos.values()) {
      expect(p.x).toBeGreaterThanOrEqual(40);
      expect(p.x).toBeLessThanOrEqual(560);
      expect(p.y).toBeGreaterThanOrEqual(40);
      expect(p.y).toBeLessThanOrEqual(370);
    }
    const pts = [...pos.values()];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const e = Math.hypot((pts[i].x - pts[j].x) / 70, (pts[i].y - pts[j].y) / 56);
        expect(e).toBeGreaterThan(0.97);
      }
    }
  });

  it("puts connected people closer than unconnected ones", () => {
    const links = [
      { a: 1, b: 2 },
      { a: 3, b: 4 },
      { a: 5, b: 6 },
    ];
    const pos = layoutWeb({ ...base, ids, links, groups: [] });
    const linked = links.map((l) => dist(pos.get(l.a)!, pos.get(l.b)!));
    const linkedSet = new Set(links.map((l) => `${l.a}-${l.b}`));
    const others: number[] = [];
    for (const a of ids)
      for (const b of ids) if (a < b && !linkedSet.has(`${a}-${b}`)) others.push(dist(pos.get(a)!, pos.get(b)!));
    const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    expect(Math.max(...linked)).toBeLessThan(avg(others));
  });

  it("clusters group members together", () => {
    const g1 = [1, 2, 3, 4];
    const g2 = [5, 6, 7, 8];
    const pos = layoutWeb({ ...base, ids: [...g1, ...g2], links: [], groups: [g1, g2] });
    const pairs = (a: number[], b: number[]) =>
      a.flatMap((i) => b.filter((j) => j !== i).map((j) => dist(pos.get(i)!, pos.get(j)!)));
    const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
    const within = avg([...pairs(g1, g1), ...pairs(g2, g2)]);
    const across = avg(pairs(g1, g2));
    expect(within).toBeLessThan(across);
  });

  it("ignores links to people who aren't on the web", () => {
    const pos = layoutWeb({ ...base, ids: [1, 2], links: [{ a: 1, b: 99 }], groups: [[2, 99]] });
    expect(pos.size).toBe(2);
  });
});

describe("webHeight", () => {
  const phone = { width: 328, pad: { x: 57, top: 55, bottom: 57 }, gap: { x: 74, y: 54 } };
  const laptop = { width: 736, pad: { x: 69, top: 73, bottom: 75 }, gap: { x: 80, y: 64 } };

  it("never goes below the minimum", () => {
    expect(webHeight(0, phone)).toBe(280);
    expect(webHeight(3, laptop)).toBe(280);
  });

  it("grows with the number of people instead of packing them tighter", () => {
    for (const fit of [phone, laptop]) {
      const h = [20, 45, 90, 180].map((n) => webHeight(n, fit));
      for (let i = 1; i < h.length; i++) expect(h[i]).toBeGreaterThan(h[i - 1]);
    }
    // Twice the people ≈ twice the inner height (a constant density), not a fixed cap.
    const inner = (n: number, fit: typeof phone) => webHeight(n, fit) - fit.pad.top - fit.pad.bottom;
    expect(inner(180, laptop) / inner(90, laptop)).toBeGreaterThan(1.8);
  });

  it("makes a narrow card taller than a wide one for the same people", () => {
    expect(webHeight(45, phone)).toBeGreaterThan(webHeight(45, laptop));
  });
});

describe("layoutWeb in a tall box (phones)", () => {
  const n = 40;
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const gap = { x: 74, y: 54 };
  const pad = { x: 50, top: 40, bottom: 40 };
  const width = 330;
  const height = webHeight(n, { width, pad, gap });
  const pos = layoutWeb({
    ids,
    links: [],
    groups: [ids.slice(0, 15), ids.slice(15, 25), ids.slice(25, 33)],
    width,
    height,
    pad,
    gap,
  });
  const pts = [...pos.values()];

  it("uses the height: spread out vertically, not a blob in the middle", () => {
    const ys = pts.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan((height - pad.top - pad.bottom) * 0.8);
  });

  it("keeps everyone in the box and apart", () => {
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(pad.x);
      expect(p.x).toBeLessThanOrEqual(width - pad.x);
      expect(p.y).toBeGreaterThanOrEqual(pad.top);
      expect(p.y).toBeLessThanOrEqual(height - pad.bottom);
    }
    let crowded = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (Math.hypot((pts[i].x - pts[j].x) / gap.x, (pts[i].y - pts[j].y) / gap.y) < 0.97) crowded++;
      }
    }
    expect(crowded).toBe(0);
  });
});
