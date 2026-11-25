"use client";

import { useMemo, useState } from "react";
import { ArrowUpDown, Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn, errorMessage } from "@/lib/utils";
import { foldText } from "@/lib/search";
import { todayDay } from "@/lib/stats";
import { fmtAgo, groupHex } from "@/lib/people";
import type { PeopleModel } from "@/hooks/use-people";
import { useReorderList } from "@/hooks/use-lists";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NP_OPTIONS } from "@/components/people-picker";
import { PersonAvatar } from "@/components/people/person-avatar";

const MOVE_BTN =
  "flex h-4.5 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25";

/** First non-empty line of a note, for the row preview. */
function firstLine(note: string) {
  return (
    note
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? ""
  );
}

/**
 * Everyone, in saved order (hidden last): note preview, groups, logs and latest NP. Search
 * matches names and notes (diacritics ignored). "Arrange" sets the order New Entry uses.
 */
export function PeopleList({ model, onOpen }: { model: PeopleModel; onOpen: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [arranging, setArranging] = useState(false);
  const reorder = useReorderList("people");
  const today = todayDay();

  const folded = foldText(query.trim());
  const rows = useMemo(() => {
    if (!folded) return model.people;
    return model.people.filter(
      (p) =>
        foldText(p.name).includes(folded) ||
        foldText(p.note).includes(folded) ||
        // Groups they're in directly or through a subgroup ("madeira" finds the Dance Class people).
        model.memberships(p.id).some(({ group }) => foldText(group.name).includes(folded)),
    );
  }, [model, folded]);

  function move(index: number, dir: -1 | 1) {
    const list = model.people;
    const other = index + dir;
    if (other < 0 || other >= list.length || list[other].hidden !== list[index].hidden) return;
    const ids = list.map((p) => p.id);
    [ids[index], ids[other]] = [ids[other], ids[index]];
    reorder.mutate(
      { ids, before: list },
      { onError: (err) => toast.error(errorMessage(err, "Failed to save the new order")) },
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="mt-2 flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-sm font-semibold">Everyone</h2>
          <p className="text-xs text-muted-foreground">
            {arranging
              ? "Use the arrows — this is the order New Entry offers them in."
              : `${model.people.length} people`}
          </p>
        </div>
        <Button
          variant={arranging ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => {
            setArranging((a) => !a);
            setQuery("");
          }}
        >
          {arranging ? <Check /> : <ArrowUpDown />}
          {arranging ? "Done" : "Arrange"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        {model.people.length > 6 && !arranging && (
          <div className="relative border-b border-border/70 p-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, notes, groups"
              aria-label="Search people"
              className="h-9 border-transparent bg-muted/60 pl-9 focus-visible:bg-card"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">No one matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {rows.map((p) => {
              const index = model.people.indexOf(p);
              const stats = model.stats?.get(p.id);
              const last = stats?.recent[stats.recent.length - 1];
              const lastNp = last ? NP_OPTIONS[last] : null;
              const preview = firstLine(p.note);
              const groups = model.groupsOf(p.id);
              const list = model.people;
              return (
                <li key={p.id} className={cn("flex items-center gap-1", p.hidden && "bg-muted/25")}>
                  {arranging && (
                    <div className="flex shrink-0 flex-col pl-2">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index <= 0 || list[index - 1].hidden !== p.hidden}
                        aria-label={`Move ${p.name} up`}
                        className={MOVE_BTN}
                      >
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index >= list.length - 1 || list[index + 1].hidden !== p.hidden}
                        aria-label={`Move ${p.name} down`}
                        className={MOVE_BTN}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-3 py-3 pr-4 text-left transition-colors hover:bg-accent/50",
                      arranging ? "pl-1" : "pl-4",
                    )}
                  >
                    <PersonAvatar name={p.name} color={model.colorOf(p.id)} size={40} hidden={p.hidden} vibe={p.vibe} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={cn("truncate text-sm font-medium", p.hidden && "text-muted-foreground")}>
                          {p.name}
                        </span>
                        {groups.map((g) => (
                          <span
                            key={g.id}
                            title={g.name}
                            className="hidden shrink-0 items-center gap-1 text-[11px] font-medium sm:inline-flex"
                            style={{ color: groupHex(g.color) }}
                          >
                            <span className="size-1.5 rounded-full" style={{ background: groupHex(g.color) }} />
                            {g.name}
                          </span>
                        ))}
                        {groups.length > 0 && (
                          <span
                            className="flex shrink-0 gap-0.5 sm:hidden"
                            aria-label={groups.map((g) => g.name).join(", ")}
                          >
                            {groups.map((g) => (
                              <span
                                key={g.id}
                                className="size-1.5 rounded-full"
                                style={{ background: groupHex(g.color) }}
                              />
                            ))}
                          </span>
                        )}
                        {p.hidden && (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Hidden
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "truncate text-xs",
                          preview ? "text-muted-foreground" : "text-muted-foreground/60",
                        )}
                      >
                        {preview || "No note yet"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {lastNp && (
                        <span
                          className={cn("inline-flex items-center gap-1 font-medium", lastNp.text)}
                          title={`Last NP: ${lastNp.label}`}
                        >
                          <lastNp.Icon className="size-3.5" />
                          {lastNp.label}
                        </span>
                      )}
                      <span>
                        {stats
                          ? `${stats.count} ${stats.count === 1 ? "log" : "logs"} · ${fmtAgo(today - stats.lastDay)}`
                          : model.stats
                            ? "no logs"
                            : "…"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
