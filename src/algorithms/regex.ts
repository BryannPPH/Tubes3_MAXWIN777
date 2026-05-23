import type { RegexMatchRecord, TextSegment } from "../detection/types";

export const JUDOL_REGEX_PATTERN =
  /(?<![\p{L}\p{N}_-])(?<candidate>(?=[\p{L}\p{N}_-]{4,})(?=[\p{L}\p{N}_-]*[\p{L}\p{M}])[\p{L}\p{N}_-]*\d{2,3})(?![\p{L}\p{N}_-])/gu;

const GENERIC_TOKEN_PATTERN =
  /(?<![\p{L}\p{N}_-])(?<candidate>[\p{L}\p{N}_-]{4,})(?![\p{L}\p{N}_-])/gu;

const TRAILING_JUDOL_DIGITS_PATTERN =
  /^(?<core>[\p{L}\p{N}_-]*[\p{L}\p{M}][\p{L}\p{N}_-]*?)\d{2,3}$/u;

function getFuzzyComparableValue(candidate: string): string {
  const matchedCore = candidate.match(TRAILING_JUDOL_DIGITS_PATTERN)?.groups?.core;

  if (matchedCore !== undefined && matchedCore.length > 0) {
    return matchedCore;
  }

  return candidate;
}

export function scanWithRegex(text: string): RegexMatchRecord[] {
  const matches: RegexMatchRecord[] = [];
  let match: RegExpExecArray | null = JUDOL_REGEX_PATTERN.exec(text);

  while (match !== null) {
    const matchedText = match.groups?.candidate ?? match[0];
    const start = match.index;

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
