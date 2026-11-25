"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import type { LinkTone } from "@/types/db";
import type { PeopleModel } from "@/hooks/use-people";
import { cn } from "@/lib/utils";
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
  type Point,
} from "@/lib/people";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/people/person-avatar";
import { ToneLegend, TonePill } from "@/components/people/tone";

const NODE_R = 20;
/** Group halos: a blob of this radius around each member, centred a bit low so names sit inside. */
const HALO_R = 40;
const HALO_DY = 6;
/** Each level of subgroups inside a group widens its halo by this much (nested rings). */
const NEST = 13;
/** Name label baseline, below a person's centre. */
const NAME_Y = NODE_R + 14;
const GAP = { x: 80, y: 64 };
const TWEEN_MS = 520;
/** Your energy with someone: a ring this far out from their disc. */
const VIBE_R = NODE_R + 4.5;

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

function shortName(name: string) {
  return name.length > 14 ? `${name.slice(0, 13).trimEnd()}…` : name;
}

/** Rough text widths (px) for collision checks — Geist at these sizes. */
const nameWidth = (name: string) => shortName(name).length * 6.2 + 4;
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
  const { people, groups, links } = model;
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

  const { tree } = model;
  // Deepest nesting: outer halos need room at the edges.
  const nest = Math.max(0, ...tree.ordered.map(({ group }) => tree.height(group.id)));
  const height = webHeight(people.length, width >= 560) + nest * NEST;
  const target = useMemo(
    () =>
      width
        ? layoutWeb({
            ids: people.map((p) => p.id),
            links: links.map((l) => ({ a: l.person_a, b: l.person_b, w: TONE_PULL[l.tone] })),
            // Depth-first, each with everyone in its subgroups: nested groups cluster inside their parent.
            groups: tree.ordered.map(({ group }) => tree.allMembers(group.id)),
            width,
            height,
            pad: {
              x: 48 + nest * NEST + TOP_LABEL_GAP,
              top: 52 + nest * NEST + TOP_LABEL_GAP,
              bottom: 54 + nest * NEST + TOP_LABEL_GAP,
            },
            gap: GAP,
          })
        : new Map<number, Point>(),
    [people, links, tree, nest, width, height],
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
    discs.push({ x0: p.x - NODE_R, y0: p.y - NODE_R, x1: p.x + NODE_R, y1: p.y + NODE_R });
    const w = nameWidth(person.name);
    names.push({ x0: p.x - w / 2, y0: p.y + NAME_Y - 9, x1: p.x + w / 2, y1: p.y + NAME_Y + 3 });
  }

  // Halos: a group's blob covers everyone in it and its subgroups, wider per level of nesting.
  const halos = tree.ordered.flatMap(({ group, depth }) => {
    const ids = tree.allMembers(group.id);
    const pts = ids.flatMap((id) => {
      const p = pos(id);
      return p ? [p] : [];
    });
    if (pts.length === 0) return [];
    const blob = pts.map((p) => ({ x: p.x, y: p.y + HALO_DY }));
    const level = tree.height(group.id);
    const lit = active === null || ids.some((id) => neighbours.has(id));
    return [
      {
        g: group,
        pts,
        blob,
        path: haloPath(blob),
        r: HALO_R + level * NEST,
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
        nodeR: NODE_R,
        nameY: NAME_Y,
        lift: h.level * NEST + (h.depth === 0 ? TOP_LABEL_GAP : 0),
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
            {people.length} {people.length === 1 ? "person" : "people"} · {links.length}{" "}
            {links.length === 1 ? "connection" : "connections"}
            {groups.length > 0 && ` · ${groups.length} ${groups.length === 1 ? "group" : "groups"}`}
          </p>
        </div>
        <ToneLegend className="pt-0.5" ring={anyVibe} />
      </div>

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
              const pulse = vibe !== null ? NODE_R + 8 : NODE_R + 4;
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
                        r={NODE_R + 5}
                        fill="none"
                        stroke="#1c1b1f"
                        strokeOpacity={0.35}
                        strokeWidth={1.5}
                      />
                      {selected && (
                        <circle
                          r={NODE_R + 6}
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
                              r={VIBE_R}
                              fill="none"
                              stroke={TONES[1].color}
                              strokeOpacity={0.2}
                              strokeWidth={7}
                            />
                          )}
                          <circle
                            r={VIBE_R}
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
                        r={NODE_R}
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
                        className="pointer-events-none text-[12px] font-semibold tracking-tight"
                      >
                        {initials(person.name)}
                      </text>
                      <text
                        y={NAME_Y}
                        textAnchor="middle"
                        className="pointer-events-none fill-foreground text-[11px] font-medium"
                        style={{ paintOrder: "stroke", stroke: "#ffffff", strokeWidth: 3.5, strokeLinejoin: "round" }}
                      >
                        {shortName(person.name)}
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
            {links.length === 0 && groups.length === 0
              ? "Open someone to connect them with others or put them in a group — your web grows here."
              : "Tap a person to light up their connections · tap again to open them."}
          </p>
        )}
      </div>
    </Card>
  );
}
