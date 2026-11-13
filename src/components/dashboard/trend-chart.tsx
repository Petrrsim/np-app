"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Check, ChevronsRight, X } from "lucide-react";
import {
  METRICS,
  METRIC_MAX,
  METRIC_MIN,
  dayToDate,
  fmt1,
  type ChartPoint,
  type MetricKey,
} from "@/lib/stats";
import { loggedTime } from "@/components/entry-card";
import { cn } from "@/lib/utils";

// Geometry (px). The plot, the success lane and the x-axis are one fixed-height block.
const AXIS_W = 30;
const TOP = 14;
const PLOT_H = 220;
const PLOT_BOTTOM = TOP + PLOT_H;
const LANE_Y = PLOT_BOTTOM + 18;
const AXIS_TOP = PLOT_BOTTOM + 32;
const HEIGHT = AXIS_TOP + 34;
const RIGHT_PAD = 14;
/** Columns rendered beyond each edge of the viewport, so lines enter/leave smoothly. */
const OVERSCAN = 40;
/** Lines break (and a gap marker shows) when consecutive logs are further apart than this. */
const GAP_DAYS = 10;
const Y_TICKS = [2, 4, 6, 8, 10, 12];

const y = (v: number) => TOP + ((METRIC_MAX - v) / (METRIC_MAX - METRIC_MIN)) * PLOT_H;

export interface TrendChartProps {
  points: ChartPoint[];
  /** Moving averages aligned with `points` (computed over the full history). */
  trends: Record<MetricKey, (number | null)[]>;
  visible: Record<MetricKey, boolean>;
  trend: Record<MetricKey, boolean>;
  trendDays: number;
  showSuccess: boolean;
  /** Minimum px per log; widened automatically when the logs don't fill the view. */
  zoom: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Changing this scrolls back to the newest log (e.g. on a range change). */
  resetKey: string;
}

export function TrendChart({
  points,
  trends,
  visible,
  trend,
  trendDays,
  showSuccess,
  zoom,
  selectedId,
  onSelect,
  resetKey,
}: TrendChartProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const raf = useRef(0);

  const n = points.length;
  const step = viewW && n ? Math.max(zoom, (viewW - RIGHT_PAD) / n) : zoom;
  const contentW = n * step + RIGHT_PAD;
  const xOf = (i: number) => i * step + step / 2;

  const hasData = n > 0;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, [hasData]);

  // Start at (and return to, on reset) the newest log.
  const ready = viewW > 0;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !ready) return;
    el.scrollLeft = el.scrollWidth;
    setScrollX(el.scrollLeft);
  }, [resetKey, ready]);

  // Zooming keeps the log at the centre of the view in place.
  const prevStep = useRef(step);
  useLayoutEffect(() => {
    const el = scroller.current;
    const old = prevStep.current;
    prevStep.current = step;
    if (!el || old === step || !viewW) return;
    const centre = (el.scrollLeft + viewW / 2) / old;
    el.scrollLeft = centre * step - viewW / 2;
    setScrollX(el.scrollLeft);
  }, [step, viewW]);

  const indexById = useMemo(() => new Map(points.map((p, i) => [p.entry.id, i])), [points]);
  const selIdx = selectedId !== null ? (indexById.get(selectedId) ?? null) : null;

  // Bring a selection made elsewhere (keyboard, prev/next buttons) into view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || selIdx === null) return;
    const x = selIdx * step + step / 2;
    if (x < el.scrollLeft + 24 || x > el.scrollLeft + el.clientWidth - 24) {
      el.scrollTo({ left: x - el.clientWidth / 2, behavior: "smooth" });
    }
    // Only when the selection moves, not on every zoom/scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIdx]);

  function handleScroll() {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      if (scroller.current) setScrollX(scroller.current.scrollLeft);
    });
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function indexAt(clientX: number): number | null {
    const rect = content.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    const i = Math.floor((clientX - rect.left) / step);
    return i >= 0 && i < n ? i : null;
  }

  function handleKey(e: React.KeyboardEvent) {
    if (n === 0) return;
    let next: number | null = null;
    const from = selIdx ?? hover ?? n;
    if (e.key === "ArrowLeft") next = Math.max(0, from - 1);
    else if (e.key === "ArrowRight") next = Math.min(n - 1, from === n ? n - 1 : from + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    onSelect(points[next].entry.id);
  }

  // Axis labels are laid out once over the whole history (greedy, left → right) so they
  // don't jump around while scrolling; only the visible ones are rendered.
  const labels = useMemo(() => {
    const days: { i: number; text: string }[] = [];
    const months: { i: number; text: string }[] = [];
    let lastDayX = -Infinity;
    let lastMonthX = -Infinity;
    let prevDay: number | null = null;
    let prevMonth: number | null = null;
    points.forEach((p, i) => {
      if (p.day === prevDay) return;
      prevDay = p.day;
      const date = dayToDate(p.day);
      const x = i * step;
      const month = date.getFullYear() * 12 + date.getMonth();
      if (month !== prevMonth) {
        prevMonth = month;
        if (x - lastMonthX >= 78) {
          months.push({ i, text: format(date, "MMM yyyy") });
          lastMonthX = x;
        }
      }
      if (x - lastDayX >= (step >= 30 ? 44 : 26)) {
        days.push({ i, text: format(date, step >= 30 ? "EEE d" : "d") });
        lastDayX = x;
      }
    });
    return { days, months };
  }, [points, step]);

  // ---- visible window ----------------------------------------------------------------
  const i0 = Math.max(0, Math.floor(scrollX / step) - OVERSCAN);
  const i1 = Math.min(n - 1, Math.ceil((scrollX + viewW) / step) + OVERSCAN);
  const winLeft = i0 * step;
  const winW = Math.max(0, (i1 - i0 + 1) * step + RIGHT_PAD);

  function path(values: (number | null)[]): string {
    let d = "";
    let prev = -1;
    for (let i = i0; i <= i1; i++) {
      const v = values[i];
      if (v === null || v === undefined) continue;
      const brk = prev < 0 || points[i].day - points[prev].day > GAP_DAYS;
      d += `${brk ? "M" : "L"}${xOf(i).toFixed(1)},${y(v).toFixed(1)}`;
      prev = i;
    }
    return d;
  }

  const raw = useMemo(() => {
    const out = {} as Record<MetricKey, (number | null)[]>;
    for (const { key } of METRICS) out[key] = points.map((p) => p[key]);
    return out;
  }, [points]);

  const showDots = step >= 9;
  const dotR = step >= 26 ? 4.5 : step >= 16 ? 3.75 : 3;
  const range: number[] = [];
  for (let i = i0; i <= i1; i++) range.push(i);

  // The month of the leftmost visible log stays pinned at the left edge of the axis; real
  // month labels that slide under it are hidden.
  const firstVisible = Math.min(n - 1, Math.max(0, Math.floor(scrollX / step)));
  const stickyMonth = n ? format(dayToDate(points[firstVisible].day), "MMM yyyy") : "";
  const STICKY_W = 72;
  const gaps = range.filter((i) => i > 0 && points[i].day - points[i - 1].day > GAP_DAYS);
  const atEnd = scrollX + viewW >= contentW - 4;
  const atStart = scrollX <= 4;

  // Tooltip follows the pointer (mouse only); taps select instead.
  const tip = hover !== null ? points[hover] : null;
  const tipLeft = hover !== null ? AXIS_W + xOf(hover) - scrollX : 0;
  const tipFlip = tipLeft > (viewW + AXIS_W) / 2;

  if (n === 0) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-input text-sm text-muted-foreground">
        No logs with mood, energy or flow in this range.
      </div>
    );
  }

  return (
    <div className="relative select-none">
      <div className="flex">
        {/* Fixed y-axis */}
        <svg width={AXIS_W} height={HEIGHT} className="shrink-0 overflow-visible" aria-hidden>
          {Y_TICKS.map((t) => (
            <text
              key={t}
              x={AXIS_W - 8}
              y={y(t)}
              dy="0.32em"
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {t}
            </text>
          ))}
        </svg>

        <div
          ref={scroller}
          onScroll={handleScroll}
          onKeyDown={handleKey}
          tabIndex={0}
          role="group"
          aria-label="Mood, energy and flow over time. Use the left and right arrow keys to step through logs."
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg outline-none [scrollbar-width:thin] focus-visible:ring-2 focus-visible:ring-ring/20"
        >
          <div
            ref={content}
            className="relative cursor-crosshair"
            style={{ width: contentW, height: HEIGHT }}
            onPointerMove={(e) => e.pointerType === "mouse" && setHover(indexAt(e.clientX))}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const i = indexAt(e.clientX);
              if (i !== null) onSelect(points[i].entry.id);
            }}
          >
            <svg
              width={winW}
              height={HEIGHT}
              className="absolute top-0"
              style={{ left: winLeft }}
              aria-hidden
            >
              <g transform={`translate(${-winLeft},0)`}>
                {/* Grid */}
                {Y_TICKS.map((t) => (
                  <line
                    key={t}
                    x1={winLeft}
                    x2={winLeft + winW}
                    y1={y(t)}
                    y2={y(t)}
                    stroke="var(--border)"
                    strokeWidth={1}
                    shapeRendering="crispEdges"
                  />
                ))}
                <line
                  x1={winLeft}
                  x2={winLeft + winW}
                  y1={PLOT_BOTTOM + 0.5}
                  y2={PLOT_BOTTOM + 0.5}
                  stroke="var(--input)"
                  shapeRendering="crispEdges"
                />

                {/* Success wash behind the lines */}
                {showSuccess &&
                  range.map((i) =>
                    points[i].success === 1 || points[i].success === -1 ? (
                      <rect
                        key={`b${i}`}
                        x={i * step}
                        y={TOP}
                        width={step}
                        height={PLOT_H}
                        fill={points[i].success === 1 ? "var(--success)" : "var(--destructive)"}
                        opacity={points[i].success === 1 ? 0.07 : 0.065}
                      />
                    ) : null
                  )}

                {/* Month boundaries */}
                {labels.months
                  .filter((m) => m.i >= i0 && m.i <= i1)
                  .map((m) => (
                    <line
                      key={`m${m.i}`}
                      x1={m.i * step}
                      x2={m.i * step}
                      y1={TOP}
                      y2={HEIGHT - 4}
                      stroke="var(--input)"
                      shapeRendering="crispEdges"
                    />
                  ))}

                {/* Breaks in logging */}
                {gaps.map((i) => {
                  const days = points[i].day - points[i - 1].day;
                  const gx = i * step;
                  const label = days >= 60 ? `${Math.round(days / 30)} mo` : `${days} d`;
                  return (
                    <g key={`g${i}`}>
                      <rect x={gx - 1.5} y={TOP} width={3} height={PLOT_H} rx={1.5} fill="var(--muted)" />
                      <rect
                        x={gx - 19}
                        y={TOP + 2}
                        width={38}
                        height={16}
                        rx={8}
                        fill="var(--card)"
                        stroke="var(--border)"
                      />
                      <text
                        x={gx}
                        y={TOP + 10}
                        dy="0.34em"
                        textAnchor="middle"
                        className="fill-muted-foreground text-[9.5px] font-medium"
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}


                {/* Raw lines (faded when their trend line is on) */}
                {METRICS.filter((m) => visible[m.key]).map(({ key, color }) => (
                  <path
                    key={`raw-${key}`}
                    d={path(raw[key])}
                    fill="none"
                    stroke={color}
                    strokeWidth={step >= 12 ? 1.75 : 1.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity={trend[key] ? 0.3 : 0.95}
                  />
                ))}

                {/* Moving averages */}
                {METRICS.filter((m) => trend[m.key]).map(({ key, color }) => (
                  <g key={`ma-${key}`}>
                    <path
                      d={path(trends[key])}
                      fill="none"
                      stroke="var(--card)"
                      strokeWidth={5.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                    <path
                      d={path(trends[key])}
                      fill="none"
                      stroke={color}
                      strokeWidth={2.75}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </g>
                ))}

                {/* Points */}
                {showDots &&
                  METRICS.filter((m) => visible[m.key]).map(({ key, color }) =>
                    range.map((i) => {
                      const v = points[i][key];
                      if (v === null) return null;
                      return (
                        <circle
                          key={`${key}${i}`}
                          cx={xOf(i)}
                          cy={y(v)}
                          r={dotR}
                          fill={color}
                          stroke="var(--card)"
                          strokeWidth={1.5}
                          opacity={trend[key] ? 0.35 : 1}
                        />
                      );
                    })
                  )}

                {/* Success lane: ✓ / ✗ glyphs, shape-coded so they don't rely on colour */}
                {showSuccess &&
                  range.map((i) => {
                    const s = points[i].success;
                    if (s !== 1 && s !== -1) return null;
                    const cx = xOf(i);
                    const fill = s === 1 ? "var(--success)" : "var(--destructive)";
                    if (step >= 16) {
                      return (
                        <g key={`s${i}`} transform={`translate(${cx},${LANE_Y})`}>
                          <circle r={7} fill={fill} />
                          <path
                            d={s === 1 ? "M-3,0.2L-0.9,2.3L3.1,-2" : "M-2.3,-2.3L2.3,2.3M2.3,-2.3L-2.3,2.3"}
                            fill="none"
                            stroke="white"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      );
                    }
                    const sz = Math.max(2.6, Math.min(4.5, step * 0.42));
                    return (
                      <path
                        key={`s${i}`}
                        transform={`translate(${cx},${LANE_Y})`}
                        d={
                          s === 1
                            ? `M0,${-sz}L${sz},${sz * 0.8}L${-sz},${sz * 0.8}Z`
                            : `M0,${sz}L${sz},${-sz * 0.8}L${-sz},${-sz * 0.8}Z`
                        }
                        fill={fill}
                      />
                    );
                  })}

                {/* Hover crosshair */}
                {hover !== null && hover !== selIdx && hover >= i0 && hover <= i1 && (
                  <g pointerEvents="none">
                    <line
                      x1={xOf(hover)}
                      x2={xOf(hover)}
                      y1={TOP}
                      y2={LANE_Y + 10}
                      stroke="var(--foreground)"
                      strokeOpacity={0.22}
                      shapeRendering="crispEdges"
                    />
                    {markers(hover, 4.5)}
                  </g>
                )}

                {/* Selection */}
                {selIdx !== null && selIdx >= i0 && selIdx <= i1 && (
                  <g pointerEvents="none">
                    <rect
                      x={xOf(selIdx) - Math.max(6, step / 2)}
                      y={TOP}
                      width={Math.max(12, step)}
                      height={LANE_Y + 10 - TOP}
                      rx={6}
                      fill="var(--foreground)"
                      opacity={0.05}
                    />
                    <line
                      x1={xOf(selIdx)}
                      x2={xOf(selIdx)}
                      y1={TOP}
                      y2={LANE_Y + 10}
                      stroke="var(--foreground)"
                      strokeOpacity={0.6}
                      shapeRendering="crispEdges"
                    />
                    {markers(selIdx, 5.5)}
                  </g>
                )}

                {/* X axis */}
                {labels.days
                  .filter((d) => d.i >= i0 && d.i <= i1)
                  .map((d) => (
                    <text
                      key={`d${d.i}`}
                      x={xOf(d.i)}
                      y={AXIS_TOP + 6}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[10px] tabular-nums"
                    >
                      {d.text}
                    </text>
                  ))}
                {labels.months
                  .filter((m) => m.i >= i0 && m.i <= i1 && m.i * step >= scrollX + STICKY_W)
                  .map((m) => (
                    <text
                      key={`ml${m.i}`}
                      x={m.i * step + 5}
                      y={AXIS_TOP + 23}
                      className="fill-foreground text-[11px] font-semibold"
                    >
                      {m.text}
                    </text>
                  ))}
              </g>
            </svg>
          </div>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute z-[1] bg-card pr-2 text-[11px] font-semibold leading-none text-foreground"
        style={{ left: AXIS_W, top: AXIS_TOP + 14 }}
      >
        {stickyMonth}
      </div>

      {/* Edge fades hint that there's more to scroll */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 w-8 bg-linear-to-r from-card to-transparent transition-opacity",
          atStart ? "opacity-0" : "opacity-100"
        )}
        style={{ left: AXIS_W }}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent transition-opacity",
          atEnd ? "opacity-0" : "opacity-100"
        )}
      />

      {!atEnd && (
        <button
          type="button"
          onClick={() => scroller.current?.scrollTo({ left: contentW, behavior: "smooth" })}
          className="absolute right-2 top-1 flex items-center gap-1 rounded-full border border-border bg-card/95 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        >
          Latest <ChevronsRight className="size-3.5" />
        </button>
      )}

      {tip && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-48 rounded-xl border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur"
          style={{
            left: tipLeft,
            transform: tipFlip ? "translateX(calc(-100% - 14px))" : "translateX(14px)",
          }}
        >
          <div className="mb-2 font-medium text-foreground">
            {format(dayToDate(tip.day), "EEE, d MMM yyyy")}
            {loggedTime(tip.entry) && (
              <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">
                {loggedTime(tip.entry)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {METRICS.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} />
                <span className="text-muted-foreground">{label}</span>
                <span className="ml-auto font-semibold tabular-nums text-foreground">
                  {fmt1(tip[key])}
                </span>
                {trend[key] && hover !== null && (
                  <span className="w-9 text-right tabular-nums text-muted-foreground">
                    {fmt1(trends[key][hover])}
                  </span>
                )}
              </div>
            ))}
            {METRICS.some((m) => trend[m.key]) && (
              <div className="text-right text-[10px] text-muted-foreground">
                right column: {trendDays}-day avg
              </div>
            )}
          </div>
          {(tip.success === 1 || tip.success === -1) && (
            <div
              className={cn(
                "mt-2 flex items-center gap-1 border-t border-border pt-2 font-medium",
                tip.success === 1 ? "text-success" : "text-destructive"
              )}
            >
              {tip.success === 1 ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" strokeWidth={2.5} />}
              {tip.success === 1 ? "Success" : "Not success"}
            </div>
          )}
          <div className="mt-2 text-[10px] text-muted-foreground">Click for details</div>
        </div>
      )}
    </div>
  );

  function markers(i: number, r: number) {
    return (
      <>
        {METRICS.filter((m) => visible[m.key] || trend[m.key]).map(({ key, color }) => {
          const v = visible[key] ? points[i][key] : trends[key][i];
          if (v === null || v === undefined) return null;
          return (
            <circle
              key={key}
              cx={xOf(i)}
              cy={y(v)}
              r={r}
              fill={color}
              stroke="var(--card)"
              strokeWidth={2}
            />
          );
        })}
      </>
    );
  }
}
