"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmt1, fmtSigned } from "@/lib/stats";

/** Signed change pill; up is good for every metric on this page. */
export function Delta({
  value,
  suffix = "",
  label,
  labelClassName,
}: {
  value: number | null;
  suffix?: string;
  label?: string;
  labelClassName?: string;
}) {
  if (value === null) return null;
  const flat = Math.abs(value) < 0.05;
  const Icon = flat ? Minus : value > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
          flat ? "bg-muted text-muted-foreground" : value > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        )}
      >
        <Icon className="size-3" strokeWidth={2.5} />
        {flat ? "0.0" : fmtSigned(value)}
        {suffix}
      </span>
      {label && <span className={labelClassName}>{label}</span>}
    </span>
  );
}

function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values
    .map((v, i) => (v === null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);
  if (pts.length < 2) return <div className="h-8" />;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const pad = Math.max(0.5, (max - min) * 0.15);
  const lo = min - pad;
  const hi = max + pad;
  const X = (i: number) => (i / (values.length - 1)) * 100;
  const Y = (v: number) => 30 - ((v - lo) / (hi - lo)) * 28;
  const line = pts.map((p, k) => `${k ? "L" : "M"}${X(p.i).toFixed(2)},${Y(p.v).toFixed(2)}`).join("");
  const area = `${line}L${X(pts[pts.length - 1].i)},32L${X(pts[0].i)},32Z`;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={area} fill={color} opacity={0.1} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MetricTile({
  label,
  color,
  avg,
  delta,
  deltaLabel,
  spark,
}: {
  label: string;
  color: string;
  avg: number | null;
  delta: number | null;
  deltaLabel: string;
  spark: (number | null)[];
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{fmt1(avg)}</span>
        {avg !== null && <span className="text-xs text-muted-foreground">avg</span>}
      </span>
      <span className="min-h-5">
        {avg === null ? (
          <span className="text-xs text-muted-foreground">No data</span>
        ) : (
          <Delta value={delta} label={deltaLabel} labelClassName="hidden sm:inline" />
        )}
      </span>
      <div className="mt-1">
        <Sparkline values={spark} color={color} />
      </div>
    </Card>
  );
}
