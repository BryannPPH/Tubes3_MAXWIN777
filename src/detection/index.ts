export { searchWithKmp, buildFailureFunction } from "../algorithms/kmp";
export { searchWithBoyerMoore, buildLastOccurrenceTable } from "../algorithms/boyerMoore";
export { searchWithAhoCorasick, buildTrie, buildFailureLinks } from "../algorithms/ahoCorasick";
export { searchWithRabinKarp, searchMultipleWithRabinKarp } from "../algorithms/rabinKarp";
export {
  JUDOL_REGEX_PATTERN,
  scanWithRegex,
  extractCandidateSegments,
} from "../algorithms/regex";
export { calculateWeightedLevenshtein } from "../algorithms/weightedLevenshtein";
export { detectJudolContent } from "./detectionEngine";
export { loadBundledKeywords, parseKeywords } from "./keywordRepository";
export {
  normalizeForExact,
  normalizeForFuzzy,
  foldVisualSimilarity,
  getVisualSubstitutionCost,
} from "./normalization";
export type {
  AlgorithmBenchmark,
  DetectionAlgorithmName,
  DetectionEngineOptions,
  DetectionMatchRecord,
  DetectionReport,
  ExactAlgorithmName,
  ExactMatchRecord,
  FuzzyDetectionOptions,
  FuzzyMatchRecord,
  KeywordBenchmark,
  KeywordEntry,
  RegexMatchRecord,
  TextSegment,
} from "./types";
