import rawKeywords from "../../keywords/keywords.txt?raw";
import { normalizeForExact, normalizeForFuzzy } from "./normalization";
import type { KeywordEntry } from "./types";

function buildKeywordId(keyword: string, index: number): string {
  return `${index}-${normalizeForFuzzy(keyword)}`;
}

export function parseKeywords(keywordFileContent: string): KeywordEntry[] {
  const uniqueKeywords = new Map<string, KeywordEntry>();
  const lines = keywordFileContent.replace(/\r/gu, "").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();

    if (raw.length === 0) {
      continue;
    }

    const normalizedExact = normalizeForExact(raw);
    if (uniqueKeywords.has(normalizedExact)) {
      continue;
    }

    uniqueKeywords.set(normalizedExact, {
      id: buildKeywordId(raw, index),
      raw,
      normalizedExact,
      normalizedFuzzy: normalizeForFuzzy(raw),
    });
  }

  return Array.from(uniqueKeywords.values());
}

export async function loadBundledKeywords(): Promise<KeywordEntry[]> {
  return parseKeywords(rawKeywords);
}
