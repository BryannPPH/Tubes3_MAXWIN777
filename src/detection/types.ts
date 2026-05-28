export type ExactAlgorithmName = "kmp" | "boyer-moore" | "aho-corasick" | "rabin-karp";

export type DetectionAlgorithmName =
  | ExactAlgorithmName
  | "regex"
  | "weighted-levenshtein";

export interface KeywordEntry {
  id: string;
  raw: string;
  normalizedExact: string;
  normalizedFuzzy: string;
}

export interface TextSegment {
  value: string;
  normalizedFuzzy: string;
  start: number;
  end: number;
  source: "regex" | "token";
}

export interface AlgorithmBenchmark {
  algorithm: DetectionAlgorithmName;
  durationMs: number;
  comparisons: number;
  matches: number;
  processedKeywords: number;
  processedCandidates: number;
}

export interface KeywordBenchmark {
  keyword: string;
  algorithm: DetectionAlgorithmName;
  durationMs: number;
  comparisons: number;
  matches: number;
}

export interface ExactMatchRecord {
  kind: "exact";
  keyword: string;
  matchedText: string;
  start: number;
  end: number;
  occurrences: number;
  algorithms: ExactAlgorithmName[];
}

export interface RegexMatchRecord {
  kind: "regex";
  matchedText: string;
  start: number;
  end: number;
  pattern: string;
}

export interface FuzzyMatchRecord {
  kind: "fuzzy";
  keyword: string;
  matchedText: string;
  start: number;
  end: number;
  similarity: number;
  distance: number;
  source: TextSegment["source"];
}

export type DetectionMatchRecord =
  | ExactMatchRecord
  | RegexMatchRecord
  | FuzzyMatchRecord;

export interface DetectionReport {
  text: string;
  keywords: KeywordEntry[];
  matches: DetectionMatchRecord[];
  benchmarks: AlgorithmBenchmark[];
  keywordBenchmarks: KeywordBenchmark[];
  unmatchedKeywords: string[];
}

export interface FuzzyDetectionOptions {
  similarityThreshold: number;
  maxLengthDelta: number;
}

export interface DetectionEngineOptions {
  fuzzy?: Partial<FuzzyDetectionOptions>;
}
