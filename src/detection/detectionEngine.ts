import { searchWithBoyerMoore } from "../algorithms/boyerMoore";
import { searchWithKmp } from "../algorithms/kmp";
import { extractCandidateSegments, scanWithRegex } from "../algorithms/regex";
import { calculateWeightedLevenshtein } from "../algorithms/weightedLevenshtein";
import { normalizeForExact, normalizeForFuzzy } from "./normalization";
import type {
  AlgorithmBenchmark,
  DetectionEngineOptions,
  DetectionMatchRecord,
  DetectionReport,
  ExactAlgorithmName,
  ExactMatchRecord,
  FuzzyDetectionOptions,
  FuzzyMatchRecord,
  KeywordBenchmark,
  KeywordEntry,
  TextSegment,
} from "./types";
import { nowMs } from "../utils/clock";

const DEFAULT_FUZZY_OPTIONS: FuzzyDetectionOptions = {
  similarityThreshold: 0.8,
  maxLengthDelta: 3,
};

function mergeFuzzyOptions(
  options?: DetectionEngineOptions,
): FuzzyDetectionOptions {
  return {
    similarityThreshold:
      options?.fuzzy?.similarityThreshold ?? DEFAULT_FUZZY_OPTIONS.similarityThreshold,
    maxLengthDelta: options?.fuzzy?.maxLengthDelta ?? DEFAULT_FUZZY_OPTIONS.maxLengthDelta,
  };
}

function createExactMatchKey(keyword: string, start: number, end: number): string {
  return `${keyword}:${start}:${end}`;
}

function addExactMatches(
  target: Map<string, ExactMatchRecord>,
  keyword: KeywordEntry,
  text: string,
  positions: number[],
  algorithm: ExactAlgorithmName,
): void {
  for (const start of positions) {
    const end = start + keyword.raw.length;
    const key = createExactMatchKey(keyword.raw, start, end);
    const existing = target.get(key);

    if (existing !== undefined) {
      let alreadyRegistered = false;

      for (const registeredAlgorithm of existing.algorithms) {
        if (registeredAlgorithm === algorithm) {
          alreadyRegistered = true;
          break;
        }
      }

      if (!alreadyRegistered) {
        existing.algorithms.push(algorithm);
      }
      continue;
    }

    target.set(key, {
      kind: "exact",
      keyword: keyword.raw,
      matchedText: text.slice(start, end),
      start,
      end,
      occurrences: 1,
      algorithms: [algorithm],
    });
  }
}

function collectExactMatches(
  text: string,
  keywords: KeywordEntry[],
): {
  exactMatches: ExactMatchRecord[];
  exactKeywords: Set<string>;
  benchmarks: AlgorithmBenchmark[];
  keywordBenchmarks: KeywordBenchmark[];
} {
  const normalizedText = normalizeForExact(text);
  const mergedMatches = new Map<string, ExactMatchRecord>();
  const exactKeywords = new Set<string>();
  const keywordBenchmarks: KeywordBenchmark[] = [];

  let kmpComparisons = 0;
  let kmpMatches = 0;
  const kmpStart = nowMs();

  for (const keyword of keywords) {
    const keywordStart = nowMs();
    const result = searchWithKmp(normalizedText, keyword.normalizedExact);
    const durationMs = nowMs() - keywordStart;

    kmpComparisons += result.comparisons;
    kmpMatches += result.positions.length;

    if (result.positions.length > 0) {
      exactKeywords.add(keyword.raw);
      addExactMatches(mergedMatches, keyword, text, result.positions, "kmp");
    }

    keywordBenchmarks.push({
      keyword: keyword.raw,
      algorithm: "kmp",
      durationMs,
      comparisons: result.comparisons,
      matches: result.positions.length,
    });
  }

  const kmpDurationMs = nowMs() - kmpStart;

  let boyerMooreComparisons = 0;
  let boyerMooreMatches = 0;
  const boyerMooreStart = nowMs();

  for (const keyword of keywords) {
    const keywordStart = nowMs();
    const result = searchWithBoyerMoore(normalizedText, keyword.normalizedExact);
    const durationMs = nowMs() - keywordStart;

    boyerMooreComparisons += result.comparisons;
    boyerMooreMatches += result.positions.length;

    if (result.positions.length > 0) {
      exactKeywords.add(keyword.raw);
      addExactMatches(mergedMatches, keyword, text, result.positions, "boyer-moore");
    }

    keywordBenchmarks.push({
      keyword: keyword.raw,
      algorithm: "boyer-moore",
      durationMs,
      comparisons: result.comparisons,
      matches: result.positions.length,
    });
  }

  const boyerMooreDurationMs = nowMs() - boyerMooreStart;

  const benchmarks: AlgorithmBenchmark[] = [
    {
      algorithm: "kmp",
      durationMs: kmpDurationMs,
      comparisons: kmpComparisons,
      matches: kmpMatches,
      processedKeywords: keywords.length,
      processedCandidates: 0,
    },
    {
      algorithm: "boyer-moore",
      durationMs: boyerMooreDurationMs,
      comparisons: boyerMooreComparisons,
      matches: boyerMooreMatches,
      processedKeywords: keywords.length,
      processedCandidates: 0,
    },
  ];

  return {
    exactMatches: Array.from(mergedMatches.values()).sort(
      (left, right) => left.start - right.start,
    ),
    exactKeywords,
    benchmarks,
    keywordBenchmarks,
  };
}

function collectRegexMatches(text: string): {
  matches: DetectionMatchRecord[];
  benchmark: AlgorithmBenchmark;
} {
  const start = nowMs();
  const matches = scanWithRegex(text);
  const durationMs = nowMs() - start;

  return {
    matches,
    benchmark: {
      algorithm: "regex",
      durationMs,
      comparisons: matches.length,
      matches: matches.length,
      processedKeywords: 0,
      processedCandidates: matches.length,
    },
  };
}

function isCandidateLengthRelevant(
  keyword: KeywordEntry,
  candidate: TextSegment,
  maxLengthDelta: number,
): boolean {
  return Math.abs(keyword.normalizedFuzzy.length - candidate.normalizedFuzzy.length) <= maxLengthDelta;
}

function collectFuzzyMatches(
  text: string,
  keywords: KeywordEntry[],
  exactKeywords: Set<string>,
  options: FuzzyDetectionOptions,
): {
  matches: FuzzyMatchRecord[];
  benchmark: AlgorithmBenchmark;
  keywordBenchmarks: KeywordBenchmark[];
  unmatchedKeywords: string[];
} {
  const start = nowMs();
  const candidates = extractCandidateSegments(text, normalizeForFuzzy);
  const matches: FuzzyMatchRecord[] = [];
  const keywordBenchmarks: KeywordBenchmark[] = [];
  const unmatchedKeywords: string[] = [];
  let comparisons = 0;

  for (const keyword of keywords) {
    if (exactKeywords.has(keyword.raw)) {
      continue;
    }

    const keywordStart = nowMs();
    let keywordComparisons = 0;
    let bestMatch: FuzzyMatchRecord | null = null;

    for (const candidate of candidates) {
      if (!isCandidateLengthRelevant(keyword, candidate, options.maxLengthDelta)) {
        continue;
      }

      const result = calculateWeightedLevenshtein(
        keyword.normalizedFuzzy,
        candidate.normalizedFuzzy,
      );

      comparisons += result.comparisons;
      keywordComparisons += result.comparisons;

      if (result.similarity < options.similarityThreshold) {
        continue;
      }

      if (
        bestMatch === null ||
        result.similarity > bestMatch.similarity ||
        (result.similarity === bestMatch.similarity && result.distance < bestMatch.distance)
      ) {
        bestMatch = {
          kind: "fuzzy",
          keyword: keyword.raw,
          matchedText: text.slice(candidate.start, candidate.end),
          start: candidate.start,
          end: candidate.end,
          similarity: result.similarity,
          distance: result.distance,
          source: candidate.source,
        };
      }
    }

    const durationMs = nowMs() - keywordStart;

    keywordBenchmarks.push({
      keyword: keyword.raw,
      algorithm: "weighted-levenshtein",
      durationMs,
      comparisons: keywordComparisons,
      matches: bestMatch === null ? 0 : 1,
    });

    if (bestMatch === null) {
      unmatchedKeywords.push(keyword.raw);
      continue;
    }

    matches.push(bestMatch);
  }

  return {
    matches: matches.sort((left, right) => left.start - right.start),
    benchmark: {
      algorithm: "weighted-levenshtein",
      durationMs: nowMs() - start,
      comparisons,
      matches: matches.length,
      processedKeywords: keywords.length - exactKeywords.size,
      processedCandidates: candidates.length,
    },
    keywordBenchmarks,
    unmatchedKeywords,
  };
}

export function detectJudolContent(
  text: string,
  keywords: KeywordEntry[],
  options?: DetectionEngineOptions,
): DetectionReport {
  const fuzzyOptions = mergeFuzzyOptions(options);
  const exactReport = collectExactMatches(text, keywords);
  const regexReport = collectRegexMatches(text);
  const fuzzyReport = collectFuzzyMatches(
    text,
    keywords,
    exactReport.exactKeywords,
    fuzzyOptions,
  );

  const matches: DetectionMatchRecord[] = [
    ...exactReport.exactMatches,
    ...regexReport.matches,
    ...fuzzyReport.matches,
  ].sort((left, right) => left.start - right.start);

  return {
    text,
    keywords,
    matches,
    benchmarks: [...exactReport.benchmarks, regexReport.benchmark, fuzzyReport.benchmark],
    keywordBenchmarks: [
      ...exactReport.keywordBenchmarks,
      ...fuzzyReport.keywordBenchmarks,
    ],
    unmatchedKeywords: fuzzyReport.unmatchedKeywords,
  };
}
