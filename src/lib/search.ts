/** Lowercase + strip diacritics, so "uz" matches "Už" (Czech notes). */
function foldChar(c: string): string {
  // ASCII fast path: no diacritics to strip (most of any note).
  if (c < "\u0080") return c.toLowerCase();
  return c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function foldText(text: string): string {
  return Array.from(text, foldChar).join("");
}

/** Folded `text` plus a map from each folded char back to its index in `text`. */
function foldWithMap(text: string): { folded: string; srcIndex: number[] } {
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
  return { folded, srcIndex };
}

/** Cuts `text` into plain / matched segments from folded [start, end) ranges (sorted, disjoint). */
function segments(text: string, srcIndex: number[], ranges: [number, number][]) {
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const [a, b] of ranges) {
    const start = srcIndex[a];
    const end = srcIndex[b];
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    if (end > start) parts.push({ text: text.slice(Math.max(start, cursor), end), match: true });
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

/**
 * Splits `text` into segments, flagging the parts that match `query` (case- and
 * accent-insensitive), so callers can render the matches highlighted.
 */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = foldText(query.trim());
  if (!q) return [{ text, match: false }];
  const { folded, srcIndex } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (let at = folded.indexOf(q); at !== -1; at = folded.indexOf(q, at + q.length)) {
    ranges.push([at, at + q.length]);
  }
  return segments(text, srcIndex, ranges);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One regex for a list of signal terms, matched against *folded* text at word starts:
 * longer terms match as word prefixes ("ztracen" finds "ztracená", "complain" finds
 * "complaining"); terms of up to 3 letters only match whole words ("sad" ≠ "sada").
 * A match's text is exactly the folded term, so `m[0]` tells which term hit.
 */
export function termsRegex(terms: string[]): RegExp | null {
  const clean = [...new Set(terms.map((t) => foldText(t.trim())).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (clean.length === 0) return null;
  const alts = clean.map((t) => (t.length <= 3 ? `${escapeRe(t)}(?![\\p{L}\\p{N}])` : escapeRe(t)));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})`, "gu");
}

/** Distinct terms of `re` found in already-folded text. */
export function matchedTerms(folded: string, re: RegExp | null): string[] {
  if (!re) return [];
  const found = new Set<string>();
  for (const m of folded.matchAll(re)) found.add(m[0]);
  return [...found];
}

/** Like `splitMatches`, for a list of word-start terms; highlights the whole matched word. */
export function splitTerms(text: string, terms: string[]): { text: string; match: boolean }[] {
  const re = termsRegex(terms);
  if (!re) return [{ text, match: false }];
  const { folded, srcIndex } = foldWithMap(text);
  const ranges: [number, number][] = [];
  const wordChar = /[\p{L}\p{N}]/u;
  for (const m of folded.matchAll(re)) {
    const start = m.index;
    let end = start + m[0].length;
    while (end < folded.length && wordChar.test(folded[end])) end++;
    ranges.push([start, end]);
  }
  return segments(text, srcIndex, ranges);
}
