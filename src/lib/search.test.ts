import { describe, expect, it } from "vitest";
import { foldText, matchedTerms, splitMatches, splitTerms, termsRegex } from "@/lib/search";

const marked = (parts: { text: string; match: boolean }[]) => parts.filter((p) => p.match).map((p) => p.text);

describe("foldText", () => {
  it("lowercases and strips Czech diacritics", () => {
    expect(foldText("Už Žluťoučký KŮŇ")).toBe("uz zlutoucky kun");
  });

  it("keeps the length for one-char folds", () => {
    expect(foldText("Říjen").length).toBe("Říjen".length);
  });
});

describe("splitMatches", () => {
  it("finds every match, accent-insensitive, and keeps the original text", () => {
    const parts = splitMatches("Už jsem už doma", "uz");
    expect(marked(parts)).toEqual(["Už", "už"]);
    expect(parts.map((p) => p.text).join("")).toBe("Už jsem už doma");
  });

  it("returns the whole text unmarked for an empty query", () => {
    expect(splitMatches("abc", "  ")).toEqual([{ text: "abc", match: false }]);
  });
});

describe("termsRegex / matchedTerms", () => {
  it("matches long terms as word starts only", () => {
    const re = termsRegex(["ztracen"]);
    expect(matchedTerms("byl ztraceny", re)).toEqual(["ztracen"]);
    expect(matchedTerms("neztraceny", re)).toEqual([]);
  });

  it("matches short terms as whole words only", () => {
    const re = termsRegex(["sad"]);
    expect(matchedTerms("so sad today", re)).toEqual(["sad"]);
    expect(matchedTerms("nova sada", re)).toEqual([]);
  });

  it("escapes regex characters and ignores blank terms", () => {
    expect(termsRegex(["", "  "])).toBeNull();
    expect(matchedTerms("c++ rocks", termsRegex(["c++"]))).toEqual(["c++"]);
  });

  it("prefers the longer overlapping term", () => {
    expect(matchedTerms("depression", termsRegex(["dep", "depress"]))).toEqual(["depress"]);
  });
});

describe("splitTerms", () => {
  it("highlights the whole word that a term starts", () => {
    expect(marked(splitTerms("Cítila se ztracená.", ["ztracen"]))).toEqual(["ztracená"]);
  });
});
