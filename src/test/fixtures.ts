import type { DecryptedEntry } from "@/types/db";

let nextId = 1;

/** A decrypted log with sensible defaults; override what the test cares about. */
export function entry(overrides: Partial<DecryptedEntry> = {}): DecryptedEntry {
  const id = overrides.id ?? nextId++;
  return {
    id,
    user_id: "u",
    entry_date: "2026-01-01",
    mood: 6,
    energy: 6,
    flow: 6,
    success_step: 0,
    tiredness: null,
    sleep_quality: null,
    comment: "",
    comment_encrypted: null,
    keyword: null,
    metadata: null,
    created_at: `2026-01-01T10:00:00.${String(id).padStart(3, "0")}Z`,
    activities: [],
    people: [],
    markers: [],
    ...overrides,
  };
}
