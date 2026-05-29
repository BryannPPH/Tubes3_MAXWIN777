import type {
  AlgorithmBenchmark,
  DetectionAlgorithmName,
  DetectionMatchRecord,
} from "../detection/types";

export interface MatchPresentation {
  keyword: string;
  matchedText: string;
  algorithms: DetectionAlgorithmName[];
  algorithmLabel: string;
  durationLabel: string;
  durationMs: number;
}

const ALGORITHM_LABELS: Record<DetectionAlgorithmName, string> = {
  kmp: "KMP",
  "boyer-moore": "Boyer-Moore",
  "aho-corasick": "Aho-Corasick",
  "rabin-karp": "Rabin-Karp",
  regex: "RegEx",
  "weighted-levenshtein": "Weighted Levenshtein",
  ocr: "OCR",
};

export function formatAlgorithmName(algorithm: DetectionAlgorithmName): string {
  return ALGORITHM_LABELS[algorithm];
}

export function getMatchAlgorithms(
  match: DetectionMatchRecord,
): DetectionAlgorithmName[] {
  if (match.kind === "exact") {
    return [...match.algorithms];
  }

  if (match.kind === "regex") {
    return ["regex"];
  }

  return ["weighted-levenshtein"];
}

export function getMatchKeyword(match: DetectionMatchRecord): string {
  if (match.kind === "regex") {
    return match.matchedText;
  }

  return match.keyword;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 0.01) {
    return "<0.01 ms";
  }

  return `${durationMs.toFixed(2)} ms`;
}

function findBenchmarkDuration(
  benchmarks: AlgorithmBenchmark[],
  algorithm: DetectionAlgorithmName,
): number {
  for (const benchmark of benchmarks) {
    if (benchmark.algorithm === algorithm) {
      return benchmark.durationMs;
    }
  }

  return 0;
}

export function describeMatch(
  match: DetectionMatchRecord,
  benchmarks: AlgorithmBenchmark[],
): MatchPresentation {
  const algorithms = getMatchAlgorithms(match);
  let durationMs = 0;

  for (const algorithm of algorithms) {
    durationMs += findBenchmarkDuration(benchmarks, algorithm);
  }

  return {
    keyword: getMatchKeyword(match),
    matchedText: match.matchedText,
    algorithms,
    algorithmLabel: algorithms.map(formatAlgorithmName).join(", "),
    durationLabel: formatDuration(durationMs),
    durationMs,
  };
}