/** Lowercase + strip diacritics, so "uz" matches "Už" (Czech notes). */
function foldChar(c: string): string {
  return c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function foldText(text: string): string {
  return Array.from(text, foldChar).join("");
}

/** True if `text` contains `query` (case- and accent-insensitive). Empty query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const q = foldText(query.trim());
  return q === "" || foldText(text).includes(q);
}

/**
 * Splits `text` into segments, flagging the parts that match `query` (case- and
 * accent-insensitive), so callers can render the matches highlighted.
 */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = foldText(query.trim());
  if (!q) return [{ text, match: false }];

  // Folded string + map from each folded char back to its source index in `text`.
  let folded = "";
  const srcIndex: number[] = [];
  let i = 0;
  for (const ch of text) {
    const f = foldChar(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) srcIndex.push(i);
    i += ch.length;
  }
  srcIndex.push(text.length);

  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let from = 0;
  for (let at = folded.indexOf(q, from); at !== -1; at = folded.indexOf(q, from)) {
    const start = srcIndex[at];
    const end = srcIndex[at + q.length];
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    if (end > start) parts.push({ text: text.slice(start, end), match: true });
    cursor = Math.max(cursor, end);
    from = at + q.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}
