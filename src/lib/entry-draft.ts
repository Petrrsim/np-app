import type { EntryFieldsValue } from "@/components/entry-fields";

/**
 * The unsaved New Entry form, kept in localStorage so a reload (or iOS discarding the tab)
 * doesn't lose a half-written note. It holds the note in plain text on this device until the
 * log is saved, discarded or the user signs out (`clearEntryDraft` in auth-context).
 */
const KEY = "np.entry-draft";

export interface EntryDraft {
  /** ISO time of the last change. */
  savedAt: string;
  fields: EntryFieldsValue;
}

/** Worth keeping: anything typed or picked beyond the slider values carried over from the last log. */
export function isDraftWorthKeeping(f: EntryFieldsValue, initial: EntryFieldsValue): boolean {
  return (
    f.note.trim() !== "" ||
    f.success !== 0 ||
    f.sleep !== null ||
    f.activities.length > 0 ||
    f.people.length > 0 ||
    f.markers.length > 0 ||
    f.mood !== initial.mood ||
    f.energy !== initial.energy ||
    f.flow !== initial.flow
  );
}

const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Shape check so a corrupted or outdated stored draft is ignored instead of breaking the form. */
function isFields(v: unknown): v is EntryFieldsValue {
  if (!v || typeof v !== "object") return false;
  const f = v as Record<string, unknown>;
  return (
    isNum(f.mood) &&
    isNum(f.energy) &&
    isNum(f.flow) &&
    [-1, 0, 1].includes(f.success as number) &&
    (f.sleep === null || [1, 2, 3].includes(f.sleep as number)) &&
    Array.isArray(f.activities) &&
    Array.isArray(f.people) &&
    Array.isArray(f.markers) &&
    typeof f.note === "string"
  );
}

export function loadEntryDraft(): EntryDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<EntryDraft>;
    return typeof d.savedAt === "string" && isFields(d.fields) ? { savedAt: d.savedAt, fields: d.fields } : null;
  } catch {
    return null;
  }
}

export function saveEntryDraft(fields: EntryFieldsValue) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: new Date().toISOString(), fields }));
  } catch {
    // storage unavailable — the draft just isn't kept
  }
}

export function clearEntryDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
