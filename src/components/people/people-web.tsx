"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import type { LinkTone } from "@/types/db";
import type { PeopleModel } from "@/hooks/use-people";
import { cn } from "@/lib/utils";
import { useStoredState } from "@/hooks/use-stored-state";
import {
  TONES,
  TONE_PULL,
  VIBE_LABELS,
  connectionsOf,
  convexHull,
  groupHex,
  boxGap,
  groupLabelSpot,
  initials,
  layoutWeb,
  tint,
  webHeight,
  type Box,
  type GroupTree,
  type Point,
} from "@/lib/people";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ToneLegend, TonePill } from "@/components/people/tone";

/** Sizes of everything on the web: roomy on wide cards, tighter on phones (< `WIDE_MIN` px). */
interface Dims {
  /** Person disc radius. */
  nodeR: number;
  /** Group halos: a blob of this radius around each member, centred `haloDy` low so names sit inside. */
  haloR: number;
  haloDy: number;
  /** Each level of subgroups inside a group widens its halo by this much (nested rings). */
  nest: number;
  /** Name label baseline, below a person's centre. */
  nameY: number;
  /** Minimum distance between two people (layout). */
  gap: { x: number; y: number };
  /** Free space around the layout, before nesting (halos, names, group labels). */
  pad: { x: number; top: number; bottom: number };
  nameFont: number;
  initialsFont: number;
  /** Names longer than this are cut with "…". */
  nameMax: number;
  /** Rough width of one name character (px) at `nameFont`, for collision checks. */
  charW: number;
}
const WIDE: Dims = {
  nodeR: 20,
  haloR: 40,
  haloDy: 6,
  nest: 13,
  nameY: 34,
  gap: { x: 80, y: 64 },
  pad: { x: 48, top: 52, bottom: 54 },
  nameFont: 11,
  initialsFont: 12,
  nameMax: 14,
  charW: 6.2,
};
const COMPACT: Dims = {
  nodeR: 15,
  haloR: 28,
  haloDy: 5,
  nest: 9,
  nameY: 27,
  gap: { x: 74, y: 54 },
  pad: { x: 40, top: 38, bottom: 40 },
  nameFont: 10,
  initialsFont: 10,
  nameMax: 13,
  charW: 5.6,
};
const WIDE_MIN = 560;
const TWEEN_MS = 520;

type Focus = { kind: "person"; id: number } | { kind: "link"; id: number } | null;

function samePositions(a: Map<number, Point>, b: Map<number, Point>) {
  if (a.size !== b.size) return false;
  for (const [id, p] of b) {
    const q = a.get(id);
    if (!q || Math.abs(q.x - p.x) > 0.5 || Math.abs(q.y - p.y) > 0.5) return false;
  }
  return true;
}

/**
 * Glides people to their new spots when the web changes (a connection or group added), so the
 * eye can follow who moved. Resizes and reduced-motion jump straight there.
 */
function useTween(target: Map<number, Point>, width: number): Map<number, Point> {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  const widthRef = useRef(width);
  useEffect(() => {
    const from = shownRef.current;
    const instant =
      widthRef.current !== width ||
      samePositions(from, target) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    widthRef.current = width;
    const start = performance.now();
    let raf = requestAnimationFrame(function step(now) {
      const k = instant ? 1 : Math.min(1, (now - start) / TWEEN_MS);
      const e = 1 - (1 - k) ** 3;
      const next = new Map<number, Point>();
      for (const [id, p] of target) {
        const q = from.get(id);
        next.set(id, q ? { x: q.x + (p.x - q.x) * e, y: q.y + (p.y - q.y) * e } : p);
      }
      shownRef.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, width]);
  return shown;
}

/** Rounded blob around points: a hull path stroked as wide as the halo (round joins/caps). */
function haloPath(points: Point[]): string | null {
  const hull = convexHull(points);
  if (hull.length < 2) return null;
  return (
    hull.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + (hull.length > 2 ? " Z" : "")
  );
}

function shortName(name: string, max: number) {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

/** Rough text widths (px) for collision checks — Geist at these sizes. */
const nameWidth = (name: string, d: Dims) => shortName(name, d.nameMax).length * d.charW + 4;
const groupLabelWidth = (name: string, size: number) => name.length * size * 0.78 + 6;
/** Group names shrink a step per nesting level: top-level 11px, subgroups 9.5px, deeper 8.5px. */
const groupLabelSize = (depth: number) => Math.max(8.5, 11 - depth * 1.5);
/** Top-level group names sit this much further out, a little clear of their halo. */
const TOP_LABEL_GAP = 8;
const pillWidth = (label: string) => Math.min(160, label.length * 6.3 + 30);

/**
 * "Your web": everyone as a constellation — connections as lines in their tone's colour, groups
 * as soft halos, your own energy with someone as a ring around them. Tap a person to light up
 * their ties (with labels), tap again to open them.
 */
export function PeopleWeb({ model, onOpen }: { model: PeopleModel; onOpen: (id: number) => void }) {
  const { tree } = model;
  // Group filter: show one group (with its subgroups) on its own — a big web gets long.
  const [storedFilter, setFilter] = useStoredState<number | null>("np.people.web-group", null);
  const filter = storedFilter !== null && tree.group(storedFilter) ? storedFilter : null;
  const { people, links, shownGroups } = useMemo(() => {
    if (filter === null) return { people: model.people, links: model.links, shownGroups: tree.ordered };
    const ids = new Set(tree.allMembers(filter));
    const inside = new Set([filter, ...tree.descendants(filter)]);
    const base = tree.ancestors(filter).length;
    return {
      people: model.people.filter((p) => ids.has(p.id)),
      links: model.links.filter((l) => ids.has(l.person_a) && ids.has(l.person_b)),
      // Depth relative to the shown group, so its name is sized like a top-level one.
      shownGroups: tree.ordered
        .filter(({ group }) => inside.has(group.id))
        .map(({ group, depth }) => ({ group, depth: depth - base })),
    };
  }, [filter, model.people, model.links, tree]);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [focus, setFocus] = useState<Focus>(null);
  const anyVibe = people.some((p) => p.vibe !== null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const wide = width >= WIDE_MIN;
  const d = wide ? WIDE : COMPACT;
  const { nodeR, nameY } = d;
  // Deepest nesting: outer halos need room at the edges.
  const nest = Math.max(0, ...shownGroups.map(({ group }) => tree.height(group.id)));
  const extra = nest * d.nest + TOP_LABEL_GAP;
  const pad = useMemo(
    () => ({ x: d.pad.x + extra, top: d.pad.top + extra, bottom: d.pad.bottom + extra }),
    [d, extra],
  );
  const height = webHeight(people.length, { width, pad, gap: d.gap });
  const target = useMemo(
    () =>
      width
        ? layoutWeb({
            ids: people.map((p) => p.id),
            links: links.map((l) => ({ a: l.person_a, b: l.person_b, w: TONE_PULL[l.tone] })),
            // Depth-first, each with everyone in its subgroups: nested groups cluster inside their parent.
            groups: shownGroups.map(({ group }) => tree.allMembers(group.id)),
            width,
            height,
            pad,
            gap: d.gap,
          })
        : new Map<number, Point>(),
    [people, links, shownGroups, tree, width, height, pad, d.gap],
  );
  const shown = useTween(target, width);
  const pos = (id: number) => shown.get(id) ?? target.get(id);

  // Drop a focus whose person / link is gone.
  const focusOk =
    focus === null ||
    (focus.kind === "person" ? people.some((p) => p.id === focus.id) : links.some((l) => l.id === focus.id));
  const active = focusOk ? focus : null;

  const focusPerson = active?.kind === "person" ? active.id : null;
  const focusLink = active?.kind === "link" ? (links.find((l) => l.id === active.id) ?? null) : null;
  const neighbours = useMemo(() => {
    const set = new Set<number>();
    if (focusPerson !== null) {
      set.add(focusPerson);
      for (const l of links) {
        if (l.person_a === focusPerson) set.add(l.person_b);
        if (l.person_b === focusPerson) set.add(l.person_a);
      }
    } else if (focusLink) {
      set.add(focusLink.person_a).add(focusLink.person_b);
    }
    return set;
  }, [focusPerson, focusLink, links]);
  const isLit = (id: number) => active === null || neighbours.has(id);
  const linkLit = (l: (typeof links)[number]) =>
    active === null ||
    (focusPerson !== null
      ? l.person_a === focusPerson || l.person_b === focusPerson
      : focusLink !== null && l.id === focusLink.id);

  // People's discs and names: what group labels and connection pills must not cover.
  const discs: Box[] = [];
  const names: Box[] = [];
  for (const person of people) {
    const p = pos(person.id);
    if (!p) continue;
    discs.push({ x0: p.x - nodeR, y0: p.y - nodeR, x1: p.x + nodeR, y1: p.y + nodeR });
    const w = nameWidth(person.name, d);
    names.push({ x0: p.x - w / 2, y0: p.y + nameY - 9, x1: p.x + w / 2, y1: p.y + nameY + 3 });
  }

  // Halos: a group's blob covers everyone in it and its subgroups, wider per level of nesting.
  const halos = shownGroups.flatMap(({ group, depth }) => {
    const ids = tree.allMembers(group.id);
    const pts = ids.flatMap((id) => {
      const p = pos(id);
      return p ? [p] : [];
    });
    if (pts.length === 0) return [];
    const blob = pts.map((p) => ({ x: p.x, y: p.y + d.haloDy }));
    const level = tree.height(group.id);
    const lit = active === null || ids.some((id) => neighbours.has(id));
    return [
      {
        g: group,
        pts,
        blob,
        path: haloPath(blob),
        r: d.haloR + level * d.nest,
        level,
        size: groupLabelSize(depth),
        depth,
        hex: groupHex(group.color),
        lit,
      },
    ];
  });
  // Outer rings first so inner ones paint on top; labels inner first so they get the best spots.
  const haloLayers = [...halos].sort((a, b) => b.level - a.level);
  const placed: Box[] = [];
  const labels = [...halos]
    .sort((a, b) => a.level - b.level)
    .map((h) => {
      const spot = groupLabelSpot(h.pts, [...discs, ...names, ...placed], groupLabelWidth(h.g.name, h.size), {
        nodeR,
        nameY,
        lift: h.level * d.nest + (h.depth === 0 ? TOP_LABEL_GAP : 0),
        bounds: { x0: 2, y0: 2, x1: width - 2, y1: height - 2 },
      });
      // Keep the next group's name a clear step away, so two labels never read as one.
      const b = spot.box;
      placed.push({ x0: b.x0 - 8, y0: b.y0 - 8, x1: b.x1 + 8, y1: b.y1 + 8 });
      return { ...h, spot };
    });

  // Names of the lit connections as pills — only where one fits without covering a person,
  // a name or another pill (the focus bar below lists them all anyway).
  const pills: { key: string; tone: LinkTone; label: string; x: number; y: number; box: Box }[] = [];
  const addPill = (key: string, tone: LinkTone, label: string, p?: Point, q?: Point) => {
    if (!label || !p || !q) return;
    const w = pillWidth(label);
    const x = Math.min(width - w / 2 - 4, Math.max(w / 2 + 4, (p.x + q.x) / 2));
    const y = (p.y + q.y) / 2;
    const box = { x0: x - w / 2, y0: y - 11, x1: x + w / 2, y1: y + 11 };
    const clash = [...discs, ...names, ...pills.map((o) => o.box)].some((o) => boxGap(box, o) < 2);
    if (!clash) pills.push({ key, tone, label, x, y, box });
  };
  if (active !== null) {
    for (const l of links) {
      if (linkLit(l)) addPill(`l-${l.id}`, l.tone, l.label, pos(l.person_a), pos(l.person_b));
    }
  }

  const focusName = focusPerson !== null ? model.nameOf(focusPerson) : "";
  const focused = focusPerson !== null ? model.person(focusPerson) : undefined;
  const focusTies = [
    ...(focused && focused.vibe !== null ? [`You: ${VIBE_LABELS[focused.vibe].toLowerCase()}`] : []),
    ...(focusPerson !== null ? connectionsOf(focusPerson, links, model.nameOf) : []).map(
      ({ link, other }) => `${model.nameOf(other)}${link.label ? ` (${link.label})` : ""}`,
    ),
  ];

  function tap(id: number) {
    if (focusPerson === id) onOpen(id);
    else setFocus({ kind: "person", id });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Your web</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {filter !== null && `${people.length} of `}
            {model.people.length} {model.people.length === 1 && filter === null ? "person" : "people"} ·{" "}
            {links.length} {links.length === 1 ? "connection" : "connections"}
            {shownGroups.length > 0 &&
              ` · ${shownGroups.length} ${shownGroups.length === 1 ? "group" : "groups"}`}
          </p>
        </div>
        <ToneLegend className="pt-0.5" ring={anyVibe} />
      </div>

      {model.groups.length > 0 && (
        <WebFilter
          tree={tree}
          value={filter}
          onChange={(id) => {
            setFocus(null);
            setFilter(id);
          }}
        />
      )}

      <div
        ref={box}
        className="relative mt-1 bg-[radial-gradient(circle,var(--border)_1px,transparent_1.2px)] bg-size-[20px_20px]"
        style={{ height }}
        onClick={() => setFocus(null)}
      >
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="absolute inset-0 block select-none"
            role="group"
            aria-label="People and their connections"
          >
            <defs>
              <filter id="web-node-shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1c1b1f" floodOpacity="0.12" />
              </filter>
            </defs>

            {/* Group halos: one translucent layer each, so the fill and the wide stroke don't double up. */}
            {haloLayers.map(({ g, blob, path, r, hex, lit }) => (
              <g key={g.id} className="transition-opacity duration-300" style={{ opacity: lit ? 1 : 0.3 }}>
                <g opacity={0.1}>
                  {path ? (
                    <path
                      d={path}
                      fill={hex}
                      stroke={hex}
                      strokeWidth={2 * r}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : (
                    <circle cx={blob[0].x} cy={blob[0].y} r={r} fill={hex} />
                  )}
                </g>
              </g>
            ))}
            {/* Connections */}
            {links.map((l) => {
              const p = pos(l.person_a);
              const q = pos(l.person_b);
              if (!p || !q) return null;
              const lit = linkLit(l);
              const tone = TONES[l.tone];
              return (
                <g key={l.id} className="transition-opacity duration-300" style={{ opacity: lit ? 1 : 0.12 }}>
                  {l.tone !== 0 && (
                    <line
                      x1={p.x}
                      y1={p.y}
                      x2={q.x}
                      y2={q.y}
                      stroke={tone.color}
                      strokeOpacity={0.18}
                      strokeWidth={8}
                      strokeLinecap="round"
                    />
                  )}
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke={tone.color}
                    strokeWidth={l.tone === 0 ? 1.75 : 2.5}
                    strokeDasharray={l.tone === 0 ? "4 5" : undefined}
                    strokeLinecap="round"
                  />
                  {/* Wide invisible hit area: tap a line to see what it is. */}
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={q.x}
                    y2={q.y}
                    stroke="transparent"
                    strokeWidth={18}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFocus({ kind: "link", id: l.id });
                    }}
                  >
                    <title>
                      {model.nameOf(l.person_a)} – {model.nameOf(l.person_b)}: {l.label || tone.label}
                    </title>
                  </line>
                </g>
              );
            })}

            {/* People */}
            {people.map((person) => {
              const p = pos(person.id);
              if (!p) return null;
              const hex = model.colorOf(person.id);
              const selected = focusPerson === person.id;
              const lit = isLit(person.id);
              const vibe = person.vibe;
              const pulse = vibe !== null ? nodeR + 8 : nodeR + 4;
              const vibeR = nodeR + 4.5;
              return (
                <g
                  key={person.id}
                  transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                  role="button"
                  tabIndex={0}
                  aria-label={selected ? `Open ${person.name}` : `Focus ${person.name}`}
                  className="cursor-pointer outline-none [&:focus-visible_.ring]:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    tap(person.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      tap(person.id);
                    } else if (e.key === "Escape") setFocus(null);
                  }}
                >
                  <g className="web-pop">
                    <g
                      className="transition-opacity duration-300"
                      style={{ opacity: lit ? (person.hidden ? 0.6 : 1) : 0.25 }}
                    >
                      <circle
                        className="ring opacity-0 transition-opacity"
                        r={nodeR + 5}
                        fill="none"
                        stroke="#1c1b1f"
                        strokeOpacity={0.35}
                        strokeWidth={1.5}
                      />
                      {selected && (
                        <circle
                          r={nodeR + 6}
                          fill="none"
                          stroke={hex ?? "#1c1b1f"}
                          strokeOpacity={0.45}
                          strokeWidth={2}
                        >
                          <animate
                            attributeName="r"
                            values={`${pulse};${pulse + 4};${pulse}`}
                            dur="2.4s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      {/* Your energy with them: a ring in its colour (energizing glows). */}
                      {vibe !== null && (
                        <>
                          {vibe === 1 && (
                            <circle
                              r={vibeR}
                              fill="none"
                              stroke={TONES[1].color}
                              strokeOpacity={0.2}
                              strokeWidth={7}
                            />
                          )}
                          <circle
                            r={vibeR}
                            fill="none"
                            stroke={TONES[vibe].color}
                            strokeWidth={vibe === 0 ? 1.5 : 2.25}
                            strokeDasharray={vibe === 0 ? "3 3" : undefined}
                          >
                            <title>Your energy: {VIBE_LABELS[vibe]}</title>
                          </circle>
                        </>
                      )}
                      <circle
                        r={nodeR}
                        fill={hex ? tint(hex, 0.13) : "#ffffff"}
                        stroke={hex ? tint(hex, 0.55) : "#d6d4ce"}
                        strokeWidth={selected ? 2 : 1.25}
                        strokeDasharray={person.hidden ? "3 3" : undefined}
                        filter="url(#web-node-shadow)"
                      />
                      <text
                        dy="0.36em"
                        textAnchor="middle"
                        fill={hex ?? "#3a393e"}
                        className="pointer-events-none font-semibold tracking-tight"
                        style={{ fontSize: d.initialsFont }}
                      >
                        {initials(person.name)}
                      </text>
                      <text
                        y={nameY}
                        textAnchor="middle"
                        className="pointer-events-none fill-foreground font-medium"
                        style={{
                          fontSize: d.nameFont,
                          paintOrder: "stroke",
                          stroke: "#ffffff",
                          strokeWidth: 3.5,
                          strokeLinejoin: "round",
                        }}
                      >
                        {shortName(person.name, d.nameMax)}
                      </text>
                    </g>
                  </g>
                </g>
              );
            })}
            {/* Group names last, so no line or disc covers them (placed where it's least crowded). */}
            {labels.map(({ g, spot, hex, lit, size }) => (
              <text
                key={g.id}
                x={spot.x}
                y={spot.y}
                textAnchor={spot.anchor}
                fill={hex}
                style={{ opacity: lit ? 0.9 : 0.3, fontSize: size }}
                className="pointer-events-none font-semibold uppercase tracking-[0.12em] transition-opacity duration-300"
                paintOrder="stroke"
                stroke="#ffffff"
                strokeOpacity={0.85}
                strokeWidth={3}
                strokeLinejoin="round"
              >
                {g.name}
              </text>
            ))}
          </svg>
        )}

        {/* Names of the lit connections */}
        {pills.map(({ key, tone, label, x, y }) => (
          <div
            key={key}
            className="pointer-events-none absolute z-10 flex max-w-40 -translate-x-1/2 -translate-y-1/2 justify-center"
            style={{ left: x, top: y }}
          >
            <TonePill tone={tone} label={label} className="bg-card/95 shadow-sm backdrop-blur-sm" />
          </div>
        ))}
      </div>

      {/* Focus bar */}
      <div className="flex min-h-14 items-center gap-3 border-t border-border/70 bg-muted/30 px-4 py-2.5">
        {focusPerson !== null ? (
          <>
            <PersonAvatar name={focusName} color={model.colorOf(focusPerson)} size={32} vibe={focused?.vibe} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{focusName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {focusTies.length === 0 ? "No connections yet" : focusTies.join(" · ")}
              </span>
            </div>
            <Button size="sm" className="h-8 shrink-0" onClick={() => onOpen(focusPerson)}>
              Open
              <ArrowRight />
            </Button>
          </>
        ) : focusLink ? (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-medium">
                {model.nameOf(focusLink.person_a)} <span className="text-muted-foreground">&</span>{" "}
                {model.nameOf(focusLink.person_b)}
              </span>
              <TonePill tone={focusLink.tone as LinkTone} label={focusLink.label} className="max-w-full self-start" />
            </div>
            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => onOpen(focusLink.person_a)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Clear"
              onClick={() => setFocus(null)}
            >
              <X />
            </Button>
          </>
        ) : (
          <p className={cn("text-xs text-muted-foreground")}>
            {model.links.length === 0 && model.groups.length === 0
              ? "Open someone to connect them with others or put them in a group — your web grows here."
              : "Tap a person to light up their connections · tap again to open them."}
          </p>
        )}
      </div>
    </Card>
  );
}

const FILTER_CHIP =
  "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200 active:scale-[0.97]";

/**
 * "Show": All, or one group with its subgroups. Top-level groups always show; a picked group's
 * subgroups appear right after it (and its parents' while one of theirs is picked), so the row
 * stays short however many groups there are. One scrollable row on phones, wrapping on wider cards.
 */
function WebFilter({
  tree,
  value,
  onChange,
}: {
  tree: GroupTree;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const open = new Set(value === null ? [] : [value, ...tree.ancestors(value)]);
  const chips = tree.ordered.filter(({ group }) => {
    const parent = tree.parentOf(group.id);
    return parent === null || open.has(parent);
  });
  return (
    <div
      role="group"
      aria-label="Show on the web"
      className="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={cn(
          FILTER_CHIP,
          value === null
            ? "border-foreground/30 bg-foreground text-background"
            : "border-border bg-card text-muted-foreground hover:bg-accent",
        )}
      >
        Everyone
      </button>
      {chips.map(({ group, depth }) => {
        const hex = groupHex(group.color);
        const on = value === group.id;
        return (
          <button
            key={group.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : group.id)}
            className={cn(
              FILTER_CHIP,
              on ? "" : "border-border bg-card text-muted-foreground hover:bg-accent",
            )}
            style={
              on
                ? {
                    borderColor: `color-mix(in srgb, ${hex} 45%, transparent)`,
                    background: `color-mix(in srgb, ${hex} 10%, white)`,
                    color: hex,
                  }
                : undefined
            }
          >
            {depth > 0 && <span className="-mr-0.5 opacity-50">{"›".repeat(depth)}</span>}
            <span className="size-2 shrink-0 rounded-full" style={{ background: hex }} />
            {group.name}
            <span className="tabular-nums opacity-60">{tree.allMembers(group.id).length}</span>
          </button>
        );
      })}
    </div>
  );
}
