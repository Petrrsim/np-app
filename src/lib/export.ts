import type { DecryptedEntry } from "@/types/db";

/** Names for the ids/keys stored on entries, so exports are readable on their own. */
export interface ExportNames {
  activity: (key: string) => string;
  person: (id: number) => string;
  marker: (id: number) => string;
}

const SUCCESS = { "-1": "no", "0": "neutral", "1": "yes" } as const;
const SLEEP = { 1: "poor", 2: "fine", 3: "good" } as const;
const FEELING = { 1: "rough", 2: "ok", 3: "great" } as const;
const NP = { 1: "low", 2: "ok", 3: "great" } as const;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toRecord(e: DecryptedEntry, names: ExportNames) {
  return {
    date: e.entry_date,
    created_at: e.created_at,
    mood: num(e.mood),
    energy: num(e.energy),
    flow: num(e.flow),
    success: e.success_step === null ? null : SUCCESS[String(e.success_step) as keyof typeof SUCCESS],
    sleep: e.sleep_quality ? SLEEP[e.sleep_quality] : null,
    activities: e.activities.map((a) => ({ activity: names.activity(a.activity), feeling: FEELING[a.feeling] })),
    people: e.people.map((p) => ({ person: names.person(p.person_id), np: NP[p.np] })),
    markers: e.markers.map(names.marker),
    note: e.comment,
  };
}

/** Oldest first, so the file reads like a diary. */
function chronological(entries: DecryptedEntry[]) {
  return [...entries].sort((a, b) =>
    a.entry_date === b.entry_date
      ? a.created_at.localeCompare(b.created_at)
      : a.entry_date.localeCompare(b.entry_date),
  );
}

export function entriesToJson(entries: DecryptedEntry[], names: ExportNames): string {
  return JSON.stringify(chronological(entries).map((e) => toRecord(e, names)), null, 2);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: DecryptedEntry[], names: ExportNames): string {
  const header = ["date", "created_at", "mood", "energy", "flow", "success", "sleep", "activities", "people", "markers", "note"];
  const rows = chronological(entries).map((e) => {
    const r = toRecord(e, names);
    return [
      r.date,
      r.created_at,
      r.mood,
      r.energy,
      r.flow,
      r.success,
      r.sleep,
      r.activities.map((a) => `${a.activity}: ${a.feeling}`).join("; "),
      r.people.map((p) => `${p.person}: ${p.np}`).join("; "),
      r.markers.join("; "),
      r.note,
    ]
      .map(csvCell)
      .join(",");
  });
  // BOM so Excel opens UTF-8 (Czech diacritics) correctly.
  return "﻿" + [header.join(","), ...rows].join("\r\n");
}

export function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
