"use client";

import { format, parseISO } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEntries, useMarkers, usePeople } from "@/hooks/use-entries";
import { useActivityLookup } from "@/hooks/use-lists";
import { downloadFile, entriesToCsv, entriesToJson, type ExportNames } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Backup: download the whole history (decrypted notes included) as CSV or JSON. */
export function DataCard() {
  const { data: entries, isLoading } = useEntries();
  const { data: people } = usePeople();
  const { data: markers } = useMarkers();
  const activity = useActivityLookup();

  const oldest = entries?.length ? entries[entries.length - 1].entry_date : null;

  function exportAs(kind: "csv" | "json") {
    if (!entries) return;
    const names: ExportNames = {
      activity: (key) => activity(key).label,
      person: (id) => people?.find((p) => p.id === id)?.name ?? `#${id}`,
      marker: (id) => markers?.find((m) => m.id === id)?.name ?? `#${id}`,
    };
    const stamp = format(new Date(), "yyyy-MM-dd");
    if (kind === "csv") {
      downloadFile(`np-diary-${stamp}.csv`, entriesToCsv(entries, names), "text/csv;charset=utf-8");
    } else {
      downloadFile(`np-diary-${stamp}.json`, entriesToJson(entries, names), "application/json");
    }
    toast.success(`Exported ${entries.length.toLocaleString()} logs`);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Data</CardTitle>
        <CardDescription>
          {isLoading
            ? "Loading your history…"
            : entries
              ? `${entries.length.toLocaleString()} logs${
                  oldest ? ` since ${format(parseISO(oldest), "d MMM yyyy")}` : ""
                }. Download a backup — notes are decrypted in the file, so keep it somewhere private.`
              : "Couldn't load your history."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {(["csv", "json"] as const).map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            disabled={!entries?.length}
            onClick={() => exportAs(kind)}
          >
            {isLoading ? <Loader2 className="animate-spin" /> : <Download />}
            Export {kind.toUpperCase()}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
