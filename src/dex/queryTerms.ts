import type { MemeSignalAnalysisRecord } from "../types.js";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "could",
  "from",
  "have",
  "into",
  "over",
  "that",
  "the",
  "their",
  "this",
  "with",
  "would"
]);

function normalizeTerm(value: string): string {
  return value
    .replaceAll("$", "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function addTerm(terms: string[], seen: Set<string>, value: string, maxTerms: number): void {
  if (terms.length >= maxTerms) {
    return;
  }

  const normalized = normalizeTerm(value);
  if (!normalized || normalized.length < 2 || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  terms.push(normalized);
}

export function buildDexDiscoveryQueryTerms(signal: MemeSignalAnalysisRecord, maxTerms: number): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const term of signal.searchTerms) {
    addTerm(terms, seen, term, maxTerms);
  }

  for (const possibleName of signal.possibleNames) {
    addTerm(terms, seen, possibleName.ticker, maxTerms);
    addTerm(terms, seen, possibleName.name, maxTerms);
  }

  for (const entity of signal.entities) {
    addTerm(terms, seen, entity, maxTerms);
  }

  const narrativeWords = normalizeTerm(signal.narrative)
    .split(" ")
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
  for (const word of narrativeWords) {
    addTerm(terms, seen, word, maxTerms);
  }

  return terms;
}
