"use client";

import { Slider } from "@/components/ui/slider";

export function MetricSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {value}
          <span className="opacity-50">/12</span>
        </span>
      </div>
      <Slider min={1} max={12} step={1} value={[value]} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
