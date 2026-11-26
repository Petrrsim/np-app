"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Minus, Plus, Scan, X } from "lucide-react";
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
  groupLabelSpot,
  initials,
  layoutWeb,
  tint,
  webCanvas,
  webViewHeight,
  webZoom,
  type Box,
  type Circle,
  type GroupTree,
  type Point,
} from "@/lib/people";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/people/person-avatar";
import { TONE_UI, ToneLegend, TonePill } from "@/components/people/tone";
import { usePanZoom } from "@/components/people/use-pan-zoom";

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
  gap: { x: 90, y: 72 },
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
  gap: { x: 83, y: 60 },
  pad: { x: 40, top: 38, bottom: 40 },
  nameFont: 10,
  initialsFont: 10,
  nameMax: 13,
  charW: 5.6,
};
const WIDE_MIN = 560;
const TWEEN_MS = 520;
/** Height kept free under a big web for the zoom bar (32px + its 8px inset). */
const CONTROLS_STRIP = 40;
/** A connection passes at least this far (px) outside the disc of anyone it doesn't connect. */
const LINE_CLEAR = 14;

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
    hull.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
    (hull.length > 2 ? " Z" : "")
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
    if (filter === null)
      return {
        people: model.people,
        links: model.links,
        shownGroups: tree.ordered,
      };
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
  const [viewW, setViewW] = useState(0);
  const [focus, setFocus] = useState<Focus>(null);
  const anyVibe = people.some((p) => p.vibe !== null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const wide = viewW >= WIDE_MIN;
  const d = wide ? WIDE : COMPACT;
  const { nodeR, nameY } = d;
  // Deepest nesting: outer halos need room at the edges.
  const nest = Math.max(0, ...shownGroups.map(({ group }) => tree.height(group.id)));
  const extra = nest * d.nest + TOP_LABEL_GAP;
  const pad = useMemo(
    () => ({
      x: d.pad.x + extra,
      top: d.pad.top + extra,
      bottom: d.pad.bottom + extra,
    }),
    [d, extra],
  );
  // The window keeps a modest size; the web is drawn on a bigger canvas (sized for everyone at
  // a readable spacing) that the window pans and zooms over like a map.
  const viewH = webViewHeight(model.people.length, wide) + nest * d.nest;
  // Only a web that doesn't fit at full size is a map (zoom controls). Then the web is fitted
  // above a strip kept for the controls, so they never cover anyone.
  const full = webCanvas(people.length, { view: { width: viewW, height: viewH }, pad, gap: d.gap });
  const isMap = full.width > viewW || full.height > viewH;
  const strip = isMap ? CONTROLS_STRIP : 0;
  const view = useMemo(() => ({ width: viewW, height: viewH - strip }), [viewW, viewH, strip]);
  const { width, height } = webCanvas(people.length, { view, pad, gap: d.gap });
  const canvas = useMemo(() => ({ width, height }), [width, height]);
  const limits = useMemo(() => webZoom(view, canvas), [view, canvas]);
  const {
    scroller,
    zoom: z,
    offset,
    dragging,
    handlers,
    zoomIn,
    zoomOut,
    showAll,
    reveal,
    canZoomIn,
    canZoomOut,
  } = usePanZoom(view, canvas, limits, `${viewW}|${width}|${height}|${filter}`);
  // A web that fits needs no controls — until it's pinched / Ctrl-wheeled in (then: a way back).
  const showControls = isMap || z > limits.fit + 1e-3;
  const target = useMemo(
    () =>
      viewW
        ? layoutWeb({
            ids: people.map((p) => p.id),
            links: links.map((l) => ({
              a: l.person_a,
              b: l.person_b,
              w: TONE_PULL[l.tone],
            })),
            // Depth-first, each with everyone in its subgroups: nested groups cluster inside their parent.
            groups: shownGroups.map(({ group }) => tree.allMembers(group.id)),
            width,
            height,
            pad,
            gap: d.gap,
            // Disc + energy ring (with its glow) + a line's glow + a little air.
            clearance: d.nodeR + LINE_CLEAR,
          })
        : new Map<number, Point>(),
    [people, links, shownGroups, tree, viewW, width, height, pad, d.gap, d.nodeR],
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

  // People's discs and names: what group labels must not cover.
  const discs: Box[] = [];
  const names: Box[] = [];
  for (const person of people) {
    const p = pos(person.id);
    if (!p) continue;
    discs.push({
      x0: p.x - nodeR,
      y0: p.y - nodeR,
      x1: p.x + nodeR,
      y1: p.y + nodeR,
    });
    const w = nameWidth(person.name, d);
    names.push({
      x0: p.x - w / 2,
      y0: p.y + nameY - 9,
      x1: p.x + w / 2,
      y1: p.y + nameY + 3,
    });
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
  // A group's name shouldn't sit in an unrelated group's halo, where it reads as that group's.
  const related = (a: number, b: number) => tree.ancestors(a).includes(b) || tree.ancestors(b).includes(a);
  const labels = [...halos]
    .sort((a, b) => a.level - b.level)
    .map((h) => {
      const avoid: Circle[] = halos.flatMap((o) =>
        o.g.id === h.g.id || related(h.g.id, o.g.id) ? [] : o.blob.map((p) => ({ x: p.x, y: p.y, r: o.r })),
      );
      const spot = groupLabelSpot(h.pts, [...discs, ...names, ...placed], groupLabelWidth(h.g.name, h.size), {
        nodeR,
        nameY,
        lift: h.level * d.nest + (h.depth === 0 ? TOP_LABEL_GAP : 0),
        bounds: { x0: 2, y0: 2, x1: width - 2, y1: height - 2 },
        avoid,
      });
      // Keep the next group's name a clear step away, so two labels never read as one.
      const b = spot.box;
      placed.push({ x0: b.x0 - 8, y0: b.y0 - 8, x1: b.x1 + 8, y1: b.y1 + 8 });
      return { ...h, spot };
    });

  const focusName = focusPerson !== null ? model.nameOf(focusPerson) : "";
  const focused = focusPerson !== null ? model.person(focusPerson) : undefined;
  const focusTies = focusPerson !== null ? connectionsOf(focusPerson, links, model.nameOf) : [];
  const focusGroups = focusPerson !== null ? model.groupsOf(focusPerson).map((g) => g.name) : [];

  function tap(id: number) {
    if (focusPerson === id) onOpen(id);
    else setFocus({ kind: "person", id });
  }

  /** Focus someone from the bar below and bring them into view — walking the web tie by tie. */
  function jump(id: number) {
    setFocus({ kind: "person", id });
    const p = target.get(id);
    if (p) reveal(p.x, p.y);
    // Keyboard focus follows (the chip just used is replaced by the new person's chips).
    requestAnimationFrame(() =>
      scroller.current?.querySelector<SVGGElement>(`[data-person="${id}"]`)?.focus({ preventScroll: true }),
    );
  }

  return (
    <Card
      className="overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === "Escape" && active !== null) setFocus(null);
      }}
    >
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

      <div ref={box} className="relative mt-1 border-t border-border/50" style={{ height: viewH }}>
        <div
          ref={scroller}
          className={cn(
            "absolute inset-0 overflow-auto overscroll-x-contain [scrollbar-width:thin]",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
          {...handlers}
          onClick={() => setFocus(null)}
        >
          <div
            className="relative bg-[radial-gradient(circle,var(--border)_1px,transparent_1.2px)]"
            style={{
              width: Math.max(viewW, width * z),
              // Zoomed in, the bottom edge can still scroll up past the controls' strip.
              height: Math.max(viewH, height * z + strip),
              backgroundSize: `${20 * z}px ${20 * z}px`,
            }}
          >
            {viewW > 0 && (
              <svg
                width={width * z}
                height={height * z}
                viewBox={`0 0 ${width} ${height}`}
                className="absolute block select-none"
                style={{ left: offset.x, top: offset.y }}
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
                  <g
                    key={g.id}
                    className="transition-opacity duration-300"
                    style={{ opacity: lit ? 1 : 0.3 }}
                  >
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
                    <g
                      key={l.id}
                      className="transition-opacity duration-300"
                      style={{ opacity: lit ? 1 : 0.12 }}
                    >
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
                  const vibeR = nodeR + 4.5;
                  // Selected: one ink ring just outside everything else (the energy ring included).
                  const selR = (vibe !== null ? vibeR : nodeR) + 3.5;
                  return (
                    <g
                      key={person.id}
                      transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
                      data-person={person.id}
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
                        }
                      }}
                    >
                      <g className="web-pop">
                        <g
                          className="transition-opacity duration-300"
                          style={{
                            opacity: lit ? (person.hidden ? 0.6 : 1) : 0.25,
                          }}
                        >
                          <circle
                            className="ring opacity-0 transition-opacity"
                            r={selR + 3}
                            fill="none"
                            stroke="#1c1b1f"
                            strokeOpacity={0.35}
                            strokeWidth={1.5}
                          />
                          {selected && (
                            <circle
                              r={selR}
                              fill="none"
                              stroke="var(--foreground, #1c1b1f)"
                              strokeWidth={1.75}
                              className="web-pop"
                            />
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
                            strokeWidth={1.25}
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
                            className={cn(
                              "pointer-events-none fill-foreground",
                              selected ? "font-semibold" : "font-medium",
                            )}
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
          </div>
        </div>

        {showControls && (
          <MapControls onIn={zoomIn} onOut={zoomOut} onAll={showAll} canIn={canZoomIn} canOut={canZoomOut} />
        )}
      </div>

      {/* Focus bar */}
      <div className="flex min-h-14 flex-col justify-center gap-2 border-t border-border/70 bg-muted/30 px-4 py-2.5">
        {focusPerson !== null ? (
          <>
            <div className="flex items-center gap-3">
              <PersonAvatar
                name={focusName}
                color={model.colorOf(focusPerson)}
                size={32}
                vibe={focused?.vibe}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{focusName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {focused && focused.vibe !== null && (
                    <span className={TONE_UI[focused.vibe].text}>
                      {VIBE_LABELS[focused.vibe]} for you ·{" "}
                    </span>
                  )}
                  {focusGroups.length > 0 && `${focusGroups.join(", ")} · `}
                  {focusTies.length === 0
                    ? "no connections yet"
                    : `${focusTies.length} ${focusTies.length === 1 ? "connection" : "connections"}`}
                </span>
              </div>
              <Button size="sm" className="h-8 shrink-0" onClick={() => onOpen(focusPerson)}>
                Open
                <ArrowRight />
              </Button>
              <ClearButton onClick={() => setFocus(null)} />
            </div>
            {focusTies.length > 0 && (
              <TieRow key={focusPerson} label={`${focusName}'s connections`} contentKey={focusPerson}>
                {focusTies.map(({ link, other }) => (
                  <TieChip
                    key={link.id}
                    tone={link.tone}
                    name={model.nameOf(other)}
                    label={link.label}
                    onClick={() => jump(other)}
                  />
                ))}
              </TieRow>
            )}
          </>
        ) : focusLink ? (
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
              <span className="flex max-w-full items-center gap-1 text-sm font-medium">
                <NameButton onClick={() => jump(focusLink.person_a)}>{model.nameOf(focusLink.person_a)}</NameButton>
                <span className="shrink-0 text-muted-foreground">&</span>
                <NameButton onClick={() => jump(focusLink.person_b)}>{model.nameOf(focusLink.person_b)}</NameButton>
              </span>
              <TonePill tone={focusLink.tone as LinkTone} label={focusLink.label} className="max-w-full" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => onOpen(focusLink.person_a)}
            >
              Edit
            </Button>
            <ClearButton onClick={() => setFocus(null)} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {model.links.length === 0 && model.groups.length === 0
              ? "Open someone to connect them with others or put them in a group — your web grows here."
              : `Tap a person to light up their connections, again to open them${
                  isMap ? ". Drag to move around, pinch or +/− to zoom." : "."
                }`}
          </p>
        )}
      </div>
    </Card>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="-mr-2 size-8 shrink-0 text-muted-foreground"
      aria-label="Clear selection"
      title="Clear (Esc)"
      onClick={onClick}
    >
      <X />
    </Button>
  );
}

/** A person's name in the focus bar that jumps to them on the web. */
function NameButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-w-0 truncate rounded-sm underline decoration-border decoration-1 underline-offset-[3px] transition-colors hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

/** One of the focused person's connections: tone icon, name, its own name. Tap = go to them. */
function TieChip({
  tone,
  name,
  label,
  onClick,
}: {
  tone: LinkTone;
  name: string;
  label: string;
  onClick: () => void;
}) {
  const ui = TONE_UI[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Go to ${name}`}
      className="flex max-w-60 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium shadow-xs transition-colors duration-200 hover:bg-accent active:scale-[0.97]"
    >
      <ui.Icon
        className={cn("size-3 shrink-0", tone === 0 ? "text-muted-foreground" : ui.text)}
        strokeWidth={2.25}
        aria-label={TONES[tone].label}
      />
      <span className="shrink-0">{name}</span>
      {label && <span className="truncate font-normal text-muted-foreground">{label}</span>}
    </button>
  );
}

/**
 * For a sideways-scrolling row: fades the edge(s) with more behind them, so it's clear the row
 * goes on. `contentKey` = whatever changes the row's content.
 */
function useEdgeFade(contentKey: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, [contentKey]);
  const mask =
    more.left || more.right
      ? `linear-gradient(to right, ${more.left ? "transparent, #000 28px" : "#000"}, ${
          more.right ? "#000 calc(100% - 28px), transparent" : "#000"
        })`
      : undefined;
  return { ref, style: { maskImage: mask, WebkitMaskImage: mask } };
}

/** The focused person's connections as a sideways-scrolling row of chips. */
function TieRow({ label, children, contentKey }: { label: string; children: React.ReactNode; contentKey: unknown }) {
  const { ref, style } = useEdgeFade(contentKey);
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={style}
    >
      {children}
    </div>
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
  const { ref, style } = useEdgeFade(chips.length);
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Show on the web"
      className="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
      style={style}
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

const MAP_BUTTON =
  "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-4";

/** Zoom in / out and "show everyone", map-style in the corner of the web. */
function MapControls({
  onIn,
  onOut,
  onAll,
  canIn,
  canOut,
}: {
  onIn: () => void;
  onOut: () => void;
  onAll: () => void;
  canIn: boolean;
  canOut: boolean;
}) {
  return (
    <div className="absolute right-2 bottom-2 z-20 flex divide-x divide-border overflow-hidden rounded-lg border border-border bg-card/95 shadow-sm backdrop-blur-sm">
      <button
        type="button"
        className={MAP_BUTTON}
        onClick={onOut}
        disabled={!canOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus />
      </button>
      <button
        type="button"
        className={MAP_BUTTON}
        onClick={onIn}
        disabled={!canIn}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus />
      </button>
      <button
        type="button"
        className={MAP_BUTTON}
        onClick={onAll}
        aria-label="Show everyone"
        title="Show everyone"
      >
        <Scan />
      </button>
    </div>
  );
}
