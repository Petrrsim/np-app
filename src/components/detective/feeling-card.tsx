"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { DecryptedEntry, Marker } from "@/types/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkerFilter } from "@/components/marker-picker";
import { cn } from "@/lib/utils";
import { foldText } from "@/lib/search";
import { DEFAULT_WORDS } from "@/lib/detective";

/**
 * The user's own words for the feeling (searched in old notes, weighted highest) plus the
 * editable signal lists: heavy words and the markers that count as a signal.
 */
export function FeelingCard({
  feeling,
  onFeelingChange,
  terms,
  words,
  onWordsChange,
  markers,
  markerIds,
  onMarkerIdsChange,
  windowEntries,
}: {
  feeling: string;
  onFeelingChange: (v: string) => void;
  terms: string[];
  words: string[];
  onWordsChange: (v: string[]) => void;
  markers: Marker[];
  markerIds: number[];
  onMarkerIdsChange: (v: number[] | null) => void;
  windowEntries: DecryptedEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const panelId = useId();

  const markerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const e of windowEntries) for (const id of e.markers ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [windowEntries]);

  const addWord = () => {
    const w = foldText(draft.trim());
    if (w && !words.includes(w)) onWordsChange([...words, w]);
    setDraft("");
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor="detective-feeling" className="text-sm font-semibold">
          How does it feel?
        </label>
        <p className="text-xs text-muted-foreground">
          A few words, in the language you write your notes in (e.g. “lost, no direction, empty”). Old notes that use
          them rank highest.
        </p>
      </div>
      <Textarea
        id="detective-feeling"
        value={feeling}
        onChange={(e) => onFeelingChange(e.target.value)}
        placeholder="ztracený, bez směru, prázdno…"
        rows={2}
        className="min-h-0 resize-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {terms.length > 0 && <span className="text-xs text-muted-foreground">Looking for</span>}
        {terms.map((t) => (
          <span
            key={t}
            className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background"
          >
            {t}
            {t.length > 3 && "…"}
          </span>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:bg-accent",
            open && "border-foreground text-foreground"
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          Signals
          <span className="tabular-nums text-muted-foreground/80">{words.length + markerIds.length}</span>
          <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Heavy words</h3>
              <span className="text-[11px] text-muted-foreground">word starts · ≤ 3 letters = whole word</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {words.map((w) => (
                <span
                  key={w}
                  className="inline-flex items-center gap-0.5 rounded-full border border-feel-ok/30 bg-feel-ok/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-feel-ok"
                >
                  {w}
                  <button
                    type="button"
                    aria-label={`Remove ${w}`}
                    onClick={() => onWordsChange(words.filter((x) => x !== w))}
                    className="rounded-full p-0.5 hover:bg-feel-ok/15"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addWord();
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a word…"
                aria-label="Add a heavy word"
                className="h-9"
              />
              <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!draft.trim()}>
                <Plus className="size-4" /> Add
              </Button>
            </form>
          </div>

          {markers.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signal markers</h3>
                <span className="text-[11px] text-muted-foreground">counts in the window</span>
              </div>
              <MarkerFilter markers={markers} counts={markerCounts} value={markerIds} onChange={onMarkerIdsChange} />
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onWordsChange(DEFAULT_WORDS);
                onMarkerIdsChange(null);
              }}
            >
              <RotateCcw className="size-4" /> Reset signals
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
