"use client";

import { useMemo } from "react";
import { BatteryLow, User } from "lucide-react";
import type { DecryptedEntry, Person } from "@/types/db";
import { InsightCard } from "@/components/dashboard/insights";
import { toDay } from "@/lib/stats";
import { fmtLag } from "@/lib/detective";

/** Tagged people in the look-back window: how often, how often with low NP, last seen. */
export function PeopleCard({
  entries,
  from,
  anchor,
  people,
}: {
  entries: DecryptedEntry[];
  from: number;
  anchor: number;
  people: Person[];
}) {
  const rows = useMemo(() => {
    const acc = new Map<number, { count: number; low: number; last: number }>();
    for (const e of entries) {
      const day = toDay(e.entry_date);
      if (day < from || day >= anchor) continue;
      for (const p of e.people ?? []) {
        const s = acc.get(p.person_id) ?? { count: 0, low: 0, last: -Infinity };
        s.count++;
        if (p.np === 1) s.low++;
        s.last = Math.max(s.last, day);
        acc.set(p.person_id, s);
      }
    }
    return [...acc]
      .map(([id, s]) => ({ id, name: people.find((p) => p.id === id)?.name, ...s }))
      .filter((r): r is typeof r & { name: string } => Boolean(r.name))
      .sort((a, b) => b.low - a.low || b.count - a.count);
  }, [entries, from, anchor, people]);

  if (rows.length === 0) return null;

  return (
    <InsightCard title="People in this stretch" description="Tagged people before the feeling started">
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              {r.low > 0 ? <BatteryLow className="size-4 text-feel-rough" /> : <User className="size-4 text-muted-foreground" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{r.name}</span>
              <span className="text-xs text-muted-foreground">
                {r.count} {r.count === 1 ? "log" : "logs"}
                {r.low > 0 && <span className="text-feel-rough"> · {r.low} with low NP</span>}
              </span>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">last {fmtLag(anchor - r.last)}</span>
          </li>
        ))}
      </ul>
    </InsightCard>
  );
}
