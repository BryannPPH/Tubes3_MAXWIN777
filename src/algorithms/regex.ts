import type { RegexMatchRecord, TextSegment } from "../detection/types";

export const JUDOL_REGEX_PATTERN =
  /(?<![\p{L}\p{N}_-])(?<candidate>(?=[\p{L}\p{N}_-]{4,})(?=[\p{L}\p{N}_-]*[\p{L}\p{M}])[\p{L}\p{N}_-]*\d{2,3})(?![\p{L}\p{N}_-])/gu;

const GENERIC_TOKEN_PATTERN =
  /(?<![\p{L}\p{N}_-])(?<candidate>[\p{L}\p{N}_-]{4,})(?![\p{L}\p{N}_-])/gu;

const TRAILING_JUDOL_DIGITS_PATTERN =
  /^(?<core>[\p{L}\p{N}_-]*[\p{L}\p{M}][\p{L}\p{N}_-]*?)\d{2,3}$/u;

// Gambling numbers: explicitly match only 88 and 777
const GAMBLING_NUMBER_PATTERN = /(?<![\p{L}\p{N}_-])(?<candidate>(?:88|777))(?![\p{L}\p{N}_-])/gu;

function getFuzzyComparableValue(candidate: string): string {
  const matchedCore = candidate.match(TRAILING_JUDOL_DIGITS_PATTERN)?.groups?.core;

  if (matchedCore !== undefined && matchedCore.length > 0) {
    return matchedCore;
  }

  return candidate;
}

export function scanWithRegex(text: string): RegexMatchRecord[] {
  const matches: RegexMatchRecord[] = [];
  // Capture gambling-digit tokens like "88" or "777", skipping monetary contexts
  // Only emit if a gambling-related keyword appears within a nearby context window.
  const GAMBLING_CONTEXT_WORDS = [
    "slot",
    "gacor",
    "jackpot",
    "hoki",
    "maxwin",
    "win",
    "bet",
    "spin",
    "deposit",
    "promo",
    "bonus",
  ];

  let match: RegExpExecArray | null = GAMBLING_NUMBER_PATTERN.exec(text);
  while (match !== null) {
    const matchedText = match.groups?.candidate ?? match[0];
    const start = match.index;
    const end = start + matchedText.length;

    // Look behind up to 4 chars for currency markers like 'Rp' or 'IDR'
    const beforeWindow = text.slice(Math.max(0, start - 4), start).toLowerCase();
    const beforeToken = beforeWindow.replace(/[^a-z0-9]/g, "");
    if (/^(rp|idr)$/.test(beforeToken)) {
      match = GAMBLING_NUMBER_PATTERN.exec(text);
      continue;
    }

    // If the match is immediately followed by a digit or thousand separator, treat as amount
    const nextChar = text[end] ?? "";
    if (/[0-9.,]/.test(nextChar)) {
      match = GAMBLING_NUMBER_PATTERN.exec(text);
      continue;
    }

    // Require a gambling context within ±20 characters
    const windowStart = Math.max(0, start - 20);
    const windowEnd = Math.min(text.length, end + 20);
    const windowText = text.slice(windowStart, windowEnd).toLowerCase();
    const hasContext = GAMBLING_CONTEXT_WORDS.some((w) => windowText.includes(w));
    if (!hasContext) {
      match = GAMBLING_NUMBER_PATTERN.exec(text);
      continue;
    }

    matches.push({
      kind: "regex",
      matchedText,
      start,
      end,
      pattern: GAMBLING_NUMBER_PATTERN.source,
    });

    match = GAMBLING_NUMBER_PATTERN.exec(text);
  }

  // Then match the standard judol-style tokens
  match = JUDOL_REGEX_PATTERN.exec(text);

  while (match !== null) {
    const matchedText = match.groups?.candidate ?? match[0];
    const start = match.index;
    // Skip tokens that are currency amounts
    const lowered = matchedText.toLowerCase();
    if (/^(rp|idr)\d+/i.test(lowered)) {
      match = JUDOL_REGEX_PATTERN.exec(text);
      continue;
    }

    matches.push({
      kind: "regex",
      matchedText,
      start,
      end: start + matchedText.length,
      pattern: JUDOL_REGEX_PATTERN.source,
    });

    match = JUDOL_REGEX_PATTERN.exec(text);
  }

  JUDOL_REGEX_PATTERN.lastIndex = 0;
  GAMBLING_NUMBER_PATTERN.lastIndex = 0;

  return matches;
}

export function extractCandidateSegments(
  text: string,
  normalize: (value: string) => string,
): TextSegment[] {
  const segments = new Map<string, TextSegment>();

  const regexMatches = scanWithRegex(text);
  for (const match of regexMatches) {
    const key = `${match.start}:${match.end}`;
    segments.set(key, {
      value: match.matchedText,
      normalizedFuzzy: normalize(getFuzzyComparableValue(match.matchedText)),
      start: match.start,
      end: match.end,
      source: "regex",
    });
  }

  let match: RegExpExecArray | null = GENERIC_TOKEN_PATTERN.exec(text);

  while (match !== null) {
    const candidate = match.groups?.candidate ?? match[0];
    const start = match.index;
    const end = start + candidate.length;
    const key = `${start}:${end}`;

    if (!segments.has(key)) {
      segments.set(key, {
        value: candidate,
        normalizedFuzzy: normalize(getFuzzyComparableValue(candidate)),
        start,
        end,
        source: "token",
      });
    }

    match = GENERIC_TOKEN_PATTERN.exec(text);
  }

  GENERIC_TOKEN_PATTERN.lastIndex = 0;

  return Array.from(segments.values()).sort((left, right) => left.start - right.start);
}
