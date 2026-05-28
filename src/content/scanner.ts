import {
  detectJudolContent,
  loadBundledKeywords,
} from "../detection";
import type {
  DetectionAlgorithmName,
  DetectionMatchRecord,
  KeywordEntry,
} from "../detection/types";
import type { PopupScanSummary } from "../extension/protocol";
import { collectTextNodes } from "./domFilters";
import { describeMatch } from "./matchFormatter";

export interface HighlightDescriptor {
  node: Text;
  start: number;
  end: number;
  keyword: string;
  matchedText: string;
  algorithmNames: DetectionAlgorithmName[];
  algorithmLabel: string;
  durationLabel: string;
  durationMs: number;
  occurrenceKey: string;
  occurrences: number;
  priority: number;
}

export interface PageScanResult {
  highlights: HighlightDescriptor[];
  summary: PopupScanSummary;
}

const ALGORITHMS: DetectionAlgorithmName[] = [
  "kmp",
  "boyer-moore",
  "aho-corasick",
  "rabin-karp",
  "regex",
  "weighted-levenshtein",
];

let keywordCache: Promise<KeywordEntry[]> | null = null;

function createAlgorithmTotals(): Record<DetectionAlgorithmName, number> {
  return {
    kmp: 0,
    "boyer-moore": 0,
    "aho-corasick": 0,
    "rabin-karp": 0,
    regex: 0,
    "weighted-levenshtein": 0,
  };
}

function getKeywords(): Promise<KeywordEntry[]> {
  if (keywordCache === null) {
    keywordCache = loadBundledKeywords();
  }

  return keywordCache;
}

function getMatchPriority(match: DetectionMatchRecord): number {
  if (match.kind === "exact") {
    return 3;
  }

  if (match.kind === "regex") {
    return 2;
  }

  return 1;
}

function createOccurrenceKey(keyword: string): string {
  return keyword.trim().toLocaleLowerCase("en-US");
}

function isValidRange(match: DetectionMatchRecord, textLength: number): boolean {
  return match.start >= 0 && match.end > match.start && match.end <= textLength;
}

function rangesOverlap(
  left: Pick<HighlightDescriptor, "start" | "end">,
  right: Pick<HighlightDescriptor, "start" | "end">,
): boolean {
  return left.start < right.end && right.start < left.end;
}

function selectNonOverlappingMatches(
  candidates: HighlightDescriptor[],
): HighlightDescriptor[] {
  const selected: HighlightDescriptor[] = [];
  const sorted = [...candidates].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    const leftLength = left.end - left.start;
    const rightLength = right.end - right.start;
    if (leftLength !== rightLength) {
      return rightLength - leftLength;
    }

    return left.start - right.start;
  });

  for (const candidate of sorted) {
    let overlaps = false;

    for (const existing of selected) {
      if (rangesOverlap(candidate, existing)) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      selected.push(candidate);
    }
  }

  return selected.sort((left, right) => left.start - right.start);
}

function buildDetectionBuckets(
  counts: Map<string, number>,
  labels: Map<string, string>,
): Array<{ label: string; count: number }> {
  return Array.from(counts.entries())
    .map(([key, count]) => ({
      label: labels.get(key) ?? key,
      count,
    }))
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    });
}

export async function scanPage(
  blurEnabled: boolean,
): Promise<PageScanResult> {
  const keywords = await getKeywords();
  const root = document.body;
  const highlights: HighlightDescriptor[] = [];
  const algorithmDurationsMs = createAlgorithmTotals();
  const algorithmMatches = createAlgorithmTotals();
  const occurrenceCounts = new Map<string, number>();
  const occurrenceLabels = new Map<string, string>();

  if (root === null) {
    return {
      highlights,
      summary: {
        scannedAt: Date.now(),
        totalMatches: 0,
        uniqueDetections: 0,
        algorithmMatches,
        algorithmDurationsMs,
        detections: [],
        blurred: blurEnabled,
      },
    };
  }

  const textNodes = collectTextNodes(root);

  for (const node of textNodes) {
    const text = node.data;
    const report = detectJudolContent(text, keywords);

    for (const benchmark of report.benchmarks) {
      algorithmDurationsMs[benchmark.algorithm] += benchmark.durationMs;
    }

    const candidates: HighlightDescriptor[] = [];

    for (const match of report.matches) {
      if (!isValidRange(match, text.length)) {
        continue;
      }

      const presentation = describeMatch(match, report.benchmarks);
      const occurrenceKey = createOccurrenceKey(presentation.keyword);

      candidates.push({
        node,
        start: match.start,
        end: match.end,
        keyword: presentation.keyword,
        matchedText: presentation.matchedText,
        algorithmNames: presentation.algorithms,
        algorithmLabel: presentation.algorithmLabel,
        durationLabel: presentation.durationLabel,
        durationMs: presentation.durationMs,
        occurrenceKey,
        occurrences: 0,
        priority: getMatchPriority(match),
      });

      if (!occurrenceLabels.has(occurrenceKey)) {
        occurrenceLabels.set(occurrenceKey, presentation.keyword);
      }
    }

    const selected = selectNonOverlappingMatches(candidates);
    highlights.push(...selected);
  }

  for (const highlight of highlights) {
    occurrenceCounts.set(
      highlight.occurrenceKey,
      (occurrenceCounts.get(highlight.occurrenceKey) ?? 0) + 1,
    );

    for (const algorithm of highlight.algorithmNames) {
      algorithmMatches[algorithm] += 1;
    }
  }

  for (const highlight of highlights) {
    highlight.occurrences = occurrenceCounts.get(highlight.occurrenceKey) ?? 1;
  }

  for (const algorithm of ALGORITHMS) {
    algorithmMatches[algorithm] = algorithmMatches[algorithm] ?? 0;
    algorithmDurationsMs[algorithm] = algorithmDurationsMs[algorithm] ?? 0;
  }

  return {
    highlights,
    summary: {
      scannedAt: Date.now(),
      totalMatches: highlights.length,
      uniqueDetections: occurrenceCounts.size,
      algorithmMatches,
      algorithmDurationsMs,
      detections: buildDetectionBuckets(occurrenceCounts, occurrenceLabels),
      blurred: blurEnabled,
    },
  };
}
