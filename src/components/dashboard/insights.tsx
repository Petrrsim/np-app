"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles, Tag, User, X } from "lucide-react";
import type { DecryptedEntry, Marker, Person } from "@/types/db";
import { Card } from "@/components/ui/card";
import { LevelBars, type Level } from "@/components/level-tiles";
import { FEELING_OPTIONS } from "@/components/activity-picker";
import { NP_OPTIONS } from "@/components/people-picker";
import { SLEEP_OPTIONS } from "@/components/sleep-picker";
import { activityInfo } from "@/lib/activities";
import { cn } from "@/lib/utils";
import {
  METRICS,
  METRIC_MAX,
  METRIC_MIN,
  WEEKDAYS,
  activityStats,
  dailyMood,
  fmt1,
  fmtSigned,
  markerStats,
  metricsBySuccess,
  peopleStats,
  sleepStats,
  summarize,
  weekdayRhythm,
  type ChartPoint,
  type MetricKey,
  type TagStat,
} from "@/lib/stats";

function InsightCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-4 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function MetricTabs({ value, onChange }: { value: MetricKey; onChange: (k: MetricKey) => void }) {
  return (
    <div role="tablist" aria-label="Metric" className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
      {METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          role="tab"
          aria-selected={value === m.key}
          onClick={() => onChange(m.key)}
          className={cn(
            "rounded-md px-2 py-0.5 text-[11px] font-medium transition-all",
            value === m.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Weekday averages as diverging bars around the range average. */
function WeekdayRhythm({ points }: { points: ChartPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("mood");
  const m = METRICS.find((x) => x.key === metric)!;
  // Cheap (one pass over the range), so not memoized.
  const rows = weekdayRhythm(points, metric);
  const avg = summarize(points, metric).avg;
  const devs = rows.map((r) => r.dev).filter((d): d is number => d !== null);
  const maxAbs = Math.max(0.3, ...devs.map(Math.abs));
  const best = devs.length ? rows.findIndex((r) => r.dev === Math.max(...devs)) : -1;
  const worst = devs.length ? rows.findIndex((r) => r.dev === Math.min(...devs)) : -1;
  const HALF = 44;

  return (
    <InsightCard
      title="Weekly rhythm"
      description={avg !== null ? `${m.label} by weekday vs. your average of ${fmt1(avg)}` : "Not enough data"}
      action={<MetricTabs value={metric} onChange={setMetric} />}
    >
      {avg === null ? (
        <p className="text-sm text-muted-foreground">No {m.label.toLowerCase()} logged in this range.</p>
      ) : (
        <>
          <div className="relative grid grid-cols-7">
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-input"
              style={{ top: 14 + HALF }}
            />
            {rows.map((r, i) => {
              const h = r.dev === null ? 0 : Math.max(2, (Math.abs(r.dev) / maxAbs) * HALF);
              const up = (r.dev ?? 0) >= 0;
              return (
                <div
                  key={i}
                  className="flex flex-col items-center"
                  title={r.dev === null ? "No logs" : `${WEEKDAYS[i]}: ${fmtSigned(r.dev)} (${r.n} logs)`}
                >
                  <div className="relative w-full" style={{ height: HALF * 2 + 28 }}>
                    {r.dev !== null && (
                      <>
                        <div
                          className={cn("absolute left-1/2 w-[18px] -translate-x-1/2", up ? "rounded-t-[4px]" : "rounded-b-[4px]")}
                          style={{
                            background: m.color,
                            height: h,
                            top: up ? 14 + HALF - h : 14 + HALF,
                            opacity: i === best || i === worst ? 1 : 0.55,
                          }}
                        />
                        <span
                          className="absolute inset-x-0 text-center text-[10px] font-medium tabular-nums text-muted-foreground"
                          style={{ top: up ? 14 + HALF - h - 14 : 14 + HALF + h + 2 }}
                        >
                          {fmtSigned(r.dev)}
                        </span>
                      </>
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[11px]",
                      i === best || i === worst ? "font-semibold text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {WEEKDAYS[i]}
                  </span>
                </div>
              );
            })}
          </div>
          {best >= 0 && worst >= 0 && best !== worst && (
            <p className="text-xs text-muted-foreground">
              Best on <span className="font-medium text-foreground">{WEEKDAYS[best]}</span>, toughest on{" "}
              <span className="font-medium text-foreground">{WEEKDAYS[worst]}</span>.
            </p>
          )}
        </>
      )}
    </InsightCard>
  );
}

function Glyph({ win }: { win: boolean }) {
  const Icon = win ? Check : X;
  return (
    <span
      className={cn(
        "flex size-4 items-center justify-center rounded-full text-white ring-2 ring-card",
        win ? "bg-success" : "bg-destructive"
      )}
    >
      <Icon className="size-2.5" strokeWidth={3.5} />
    </span>
  );
}

/** Dumbbell per metric: average on "not success" logs vs. on "success" logs, on the 1–12 scale. */
function SuccessContrast({ points }: { points: ChartPoint[] }) {
  const by = useMemo(() => metricsBySuccess(points), [points]);
  const rows = METRICS.map((m) => ({ ...m, no: by[m.key][-1], yes: by[m.key][1] })).filter(
    (r) => r.no !== null || r.yes !== null
  );
  const pos = (v: number) => `${((v - METRIC_MIN) / (METRIC_MAX - METRIC_MIN)) * 100}%`;

  return (
    <InsightCard
      title="Wins vs. misses"
      description="Average on logs marked Success vs. Not success"
      action={
        <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            Success <Glyph win />
          </span>
          <span className="flex items-center gap-1.5">
            Not success <Glyph win={false} />
          </span>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rated logs in this range.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((r) => {
            const lo = Math.min(r.no ?? r.yes!, r.yes ?? r.no!);
            const hi = Math.max(r.no ?? r.yes!, r.yes ?? r.no!);
            const diff = r.no !== null && r.yes !== null ? r.yes - r.no : null;
            return (
              <div key={r.key} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{r.label}</span>
                <div className="relative h-5 flex-1">
                  <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                  <div
                    className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                    style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, background: r.color, opacity: 0.35 }}
                  />
                  {r.no !== null && (
                    <span
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: pos(r.no) }}
                      title={`Not success: ${fmt1(r.no)}`}
                    >
                      <Glyph win={false} />
                    </span>
                  )}
                  {r.yes !== null && (
                    <span
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: pos(r.yes) }}
                      title={`Success: ${fmt1(r.yes)}`}
                    >
                      <Glyph win />
                    </span>
                  )}
                </div>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                  <span className="text-muted-foreground">
                    {fmt1(r.no)} → {fmt1(r.yes)}
                  </span>
                  {diff !== null && <span className="block font-semibold text-foreground">{fmtSigned(diff)}</span>}
                </span>
              </div>
            );
          })}
          <div className="flex justify-between pl-15 pr-23 text-[10px] tabular-nums text-muted-foreground">
            <span>{METRIC_MIN}</span>
            <span>{(METRIC_MIN + METRIC_MAX) / 2}</span>
            <span>{METRIC_MAX}</span>
          </div>
        </div>
      )}
    </InsightCard>
  );
}

function MoodDelta({ value, name }: { value: number | null; name: string }) {
  if (value === null) return <span className="w-14 text-right text-xs text-muted-foreground">–</span>;
  const flat = Math.abs(value) < 0.05;
  return (
    <span
      title={`Average mood on days with ${name} vs. days without`}
      className={cn(
        "w-14 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums",
        flat ? "bg-muted text-muted-foreground" : value > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
      )}
    >
      {flat ? "±0.0" : fmtSigned(value)}
    </span>
  );
}

function TagRows({
  rows,
  render,
}: {
  rows: TagStat[];
  render: (r: TagStat) => { name: string; icon: React.ReactNode; level?: React.ReactNode };
}) {
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="flex-1">Logged</span>
        <span className="w-14 text-right">Mood</span>
      </div>
      <ul className="flex flex-col divide-y divide-border/70">
        {rows.slice(0, 6).map((r) => {
          const { name, icon, level } = render(r);
          return (
            <li key={r.key} className="flex items-center gap-3 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {icon}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-center gap-2 text-sm">
                  <span className="truncate font-medium">{name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{r.count}×</span>
                  {level && <span className="ml-auto">{level}</span>}
                </span>
                <span className="h-1 rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-foreground/70"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </span>
              </div>
              <MoodDelta value={r.moodDelta} name={name} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LevelMeter({ avg, options }: { avg: number; options: Record<Level, { label: string; bar: string }> }) {
  const level = Math.min(3, Math.max(1, Math.round(avg))) as Level;
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title={`Average ${avg.toFixed(1)} / 3`}>
      {options[level].label}
      <LevelBars level={level} bar={options[level].bar} lit />
    </span>
  );
}

function SleepImpact({ entries, points }: { entries: DecryptedEntry[]; points: ChartPoint[] }) {
  const rows = useMemo(() => sleepStats(entries, points), [entries, points]);
  if (rows.every((r) => r.days === 0)) return null;
  return (
    <InsightCard title="Sleep" description="Your averages on days after each kind of night">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-1.5 text-left font-medium">Night</th>
            {METRICS.map((m) => (
              <th key={m.key} className="pb-1.5 text-right font-medium">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((r) => {
            const o = SLEEP_OPTIONS[r.level];
            return (
              <tr key={r.level}>
                <td className="py-2">
                  <span className="flex items-center gap-2">
                    <o.Icon className={cn("size-4", o.text)} />
                    <span className="font-medium">{o.label}</span>
                    <span className="text-xs text-muted-foreground">{r.days}d</span>
                  </span>
                </td>
                {METRICS.map((m) => (
                  <td key={m.key} className="py-2 text-right tabular-nums">
                    {fmt1(r.avg[m.key])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </InsightCard>
  );
}

export function Insights({
  entries,
  points,
  people,
  markers,
}: {
  /** Range-scoped logs, chronological. */
  entries: DecryptedEntry[];
  /** Range-scoped chart points. */
  points: ChartPoint[];
  people: Person[] | undefined;
  markers: Marker[] | undefined;
}) {
  const daily = useMemo(() => dailyMood(points), [points]);
  const activities = useMemo(() => activityStats(entries, daily), [entries, daily]);
  const peopleRows = useMemo(() => peopleStats(entries, daily), [entries, daily]);
  const markerRows = useMemo(() => markerStats(entries, daily), [entries, daily]);
  const personName = (id: number) => people?.find((p) => p.id === id)?.name ?? "Someone";
  const markerName = (id: number) => markers?.find((m) => m.id === id)?.name ?? "Marker";
  const hasSleep = entries.some((e) => e.sleep_quality);
  const nothingTagged = !hasSleep && activities.length === 0 && peopleRows.length === 0 && markerRows.length === 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <WeekdayRhythm points={points} />
      <SuccessContrast points={points} />
      {activities.length > 0 && (
        <InsightCard title="Activities" description="How often, how it felt, and your mood on those days vs. other days">
          <TagRows
            rows={activities}
            render={(r) => {
              const { label, Icon } = activityInfo(String(r.key));
              return {
                name: label,
                icon: <Icon className="size-4" />,
                level: r.avgLevel !== null && <LevelMeter avg={r.avgLevel} options={FEELING_OPTIONS} />,
              };
            }}
          />
        </InsightCard>
      )}
      {peopleRows.length > 0 && (
        <InsightCard title="People" description="Who you logged, their NP, and your mood on those days">
          <TagRows
            rows={peopleRows}
            render={(r) => ({
              name: personName(Number(r.key)),
              icon: <User className="size-4" />,
              level: r.avgLevel !== null && <LevelMeter avg={r.avgLevel} options={NP_OPTIONS} />,
            })}
          />
        </InsightCard>
      )}
      <SleepImpact entries={entries} points={points} />
      {markerRows.length > 0 && (
        <InsightCard title="Markers" description="Most used, and your mood on those days">
          <TagRows
            rows={markerRows}
            render={(r) => ({ name: markerName(Number(r.key)), icon: <Tag className="size-4" /> })}
          />
        </InsightCard>
      )}
      {nothingTagged && (
        <Card className="flex items-start gap-3 border-dashed bg-card/60 p-4 shadow-none sm:col-span-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Sparkles className="size-4" />
          </span>
          <p className="text-sm text-muted-foreground">
            Log <span className="font-medium text-foreground">sleep, activities, people and markers</span> with
            your entries and this space will show how each of them relates to your mood.
          </p>
        </Card>
      )}
    </div>
  );
}
