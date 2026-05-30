import type { RegexMatchRecord, TextSegment } from "../detection/types";
import { containsPattern } from "../utils/manualSearch";

export const JUDOL_REGEX_PATTERN =
  /(?<![\p{L}\p{N}_-])(?<candidate>(?=[\p{L}\p{N}_-]{4,})(?=[\p{L}\p{N}_-]*[\p{L}\p{M}])[\p{L}\p{N}_-]*\d{2,3})(?![\p{L}\p{N}_-])/gu;

const WORD_TOKEN_PATTERN =
  /(?<![\p{L}\p{N}_-])(?<candidate>[\p{L}\p{N}_-]+)(?![\p{L}\p{N}_-])/gu;

const TRAILING_JUDOL_DIGITS_PATTERN =
  /^(?<core>[\p{L}\p{N}_-]*[\p{L}\p{M}][\p{L}\p{N}_-]*?)\d{2,3}$/u;

const WHITESPACE_SEPARATOR_PATTERN = /^\s+$/u;
const LETTER_PATTERN = /\p{L}/u;

const BENIGN_NUMERIC_PREFIXES = new Set([
  "bab",
  "di",
  "hal",
  "ke",
  "no",
  "pasal",
  "rt",
  "rw",
  "ayat",
]);

const SUSPICIOUS_JUDOL_FRAGMENTS = [
  "slot",
  "gacor",
  "maxwin",
  "scatter",
  "jackpot",
  "bonus",
  "deposit",
  "depo",
  "withdraw",
  "wd",
  "rtp",
  "judi",
  "casino",
  "togel",
  "toto",
  "bet",
  "spin",
  "qq",
  "qiu",
  "parlay",
  "poker",
  "domino",
  "bandar",
  "agen",
  "hoki",
  "cuan",
  "mahjong",
  "olympus",
  "zeus",
  "pragmatic",
  "habanero",
  "joker",
  "microgaming",
  "spade",
  "free",
  "claim",
  "draw",
  "live",
];

// Gambling numbers: explicitly match only 88 and 777
const GAMBLING_NUMBER_PATTERN = /(?<![\p{L}\p{N}_-])(?<candidate>(?:88|777))(?![\p{L}\p{N}_-])/gu;

function getFuzzyComparableValue(candidate: string): string {
  const matchedCore = candidate.match(TRAILING_JUDOL_DIGITS_PATTERN)?.groups?.core;

  if (matchedCore !== undefined && matchedCore.length > 0) {
    return matchedCore;
  }

  return candidate;
}

function extractLetterCore(value: string): string {
  let lettersOnly = "";
  const canonical = value.normalize("NFKD").toLocaleLowerCase("en-US");

  for (const character of canonical) {
    if (LETTER_PATTERN.test(character)) {
      lettersOnly += character;
    }
  }

  return lettersOnly;
}

function hasSuspiciousJudolFragment(value: string): boolean {
  for (const fragment of SUSPICIOUS_JUDOL_FRAGMENTS) {
    if (containsPattern(value, fragment)) {
      return true;
    }
  }

  return false;
}

function shouldSkipGenericNumericCandidate(candidate: string): boolean {
  const matchedCore = candidate.match(TRAILING_JUDOL_DIGITS_PATTERN)?.groups?.core;

  if (matchedCore === undefined || matchedCore.length === 0) {
    return false;
  }

  const loweredCore = matchedCore.toLocaleLowerCase("en-US");
  const lettersOnlyCore = extractLetterCore(loweredCore);

  if (lettersOnlyCore.length > 0 && BENIGN_NUMERIC_PREFIXES.has(lettersOnlyCore)) {
    return true;
  }

  if (/[-_]/u.test(loweredCore)) {
    const leadingSegment = loweredCore.split(/[-_]+/u)[0] ?? "";
    const leadingLetters = extractLetterCore(leadingSegment);

    if (
      leadingLetters.length > 0 &&
      leadingLetters.length <= 2 &&
      hasSuspiciousJudolFragment(leadingLetters) === false
    ) {
      return true;
    }
  }

  if (
    lettersOnlyCore.length >= 10 &&
    hasSuspiciousJudolFragment(lettersOnlyCore) === false
  ) {
    return true;
  }

  return false;
}

interface CandidateToken {
  start: number;
  end: number;
}

function createSegment(
  text: string,
  start: number,
  end: number,
  normalize: (value: string) => string,
  source: TextSegment["source"],
): TextSegment {
  const value = text.slice(start, end);

  return {
    value,
    normalizedFuzzy: normalize(getFuzzyComparableValue(value)),
    start,
    end,
    source,
  };
}

function collectCandidateTokens(text: string): CandidateToken[] {
  const tokens: CandidateToken[] = [];
  let match: RegExpExecArray | null = WORD_TOKEN_PATTERN.exec(text);

  while (match !== null) {
    const candidate = match.groups?.candidate ?? match[0];
    const start = match.index;

    tokens.push({
      start,
      end: start + candidate.length,
    });

    match = WORD_TOKEN_PATTERN.exec(text);
  }

  WORD_TOKEN_PATTERN.lastIndex = 0;
  return tokens;
}

function addTokenWindowSegments(
  target: Map<string, TextSegment>,
  text: string,
  tokens: CandidateToken[],
  normalize: (value: string) => string,
  maxPhraseTokens: number,
): void {
  for (let startIndex = 0; startIndex < tokens.length; startIndex += 1) {
    const maxEndIndex = Math.min(tokens.length, startIndex + maxPhraseTokens);

    for (let endIndex = startIndex; endIndex < maxEndIndex; endIndex += 1) {
      if (endIndex > startIndex) {
        const separator = text.slice(tokens[endIndex - 1].end, tokens[endIndex].start);
        if (!WHITESPACE_SEPARATOR_PATTERN.test(separator)) {
          break;
        }
      }

      const start = tokens[startIndex].start;
      const end = tokens[endIndex].end;
      const key = `${start}:${end}`;

      if (!target.has(key)) {
        target.set(key, createSegment(text, start, end, normalize, "token"));
      }
    }
  }
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
    const hasContext = GAMBLING_CONTEXT_WORDS.some((word) =>
      containsPattern(windowText, word),
    );
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

    if (shouldSkipGenericNumericCandidate(matchedText)) {
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
  maxPhraseTokens: number = 1,
): TextSegment[] {
  const segments = new Map<string, TextSegment>();

  const regexMatches = scanWithRegex(text);
  for (const match of regexMatches) {
    const key = `${match.start}:${match.end}`;
    segments.set(
      key,
      createSegment(text, match.start, match.end, normalize, "regex"),
    );
  }

  const tokens = collectCandidateTokens(text);
  addTokenWindowSegments(
    segments,
    text,
    tokens,
    normalize,
    Math.max(1, maxPhraseTokens),
  );

  return Array.from(segments.values()).sort((left, right) => left.start - right.start);
}
