import {
  detectJudolContent,
  loadBundledKeywords,
} from "../detection";
import type {
  DetectionAlgorithmName,
  DetectionMatchRecord,
  KeywordEntry,
} from "../detection/types";
import type {
  CaptureVisibleTabMessage,
  MaskSettings,
  CaptureVisibleTabResponse,
  PopupDebugItem,
  PopupScanSummary,
} from "../extension/protocol";
import { nowMs } from "../utils/clock";
import { collectTextNodes } from "./domFilters";
import { collectContainedPatterns } from "../utils/manualSearch";
import {
  describeMatch,
  formatAlgorithmName,
  getMatchAlgorithms,
  getMatchKeyword,
} from "./matchFormatter";
import { scanImageKeywords } from "./ocr";

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

export interface ImageHighlightDescriptor {
  element: HTMLImageElement;
  keyword: string;
  matchedText: string;
  algorithmLabel: string;
  durationLabel: string;
  durationMs: number;
  occurrenceKey: string;
  occurrences: number;
  priority: number;
  shouldBlur: boolean;
  variant: "match" | "ocr-failed";
  noteLabel?: string;
  noteValue?: string;
}

export interface PageScanResult {
  textHighlights: HighlightDescriptor[];
  imageHighlights: ImageHighlightDescriptor[];
  summary: PopupScanSummary;
}

const ALGORITHMS: DetectionAlgorithmName[] = [
  "kmp",
  "boyer-moore",
  "aho-corasick",
  "rabin-karp",
  "regex",
  "weighted-levenshtein",
  "ocr",
];

const PREVIEW_IMAGE_MIN_WIDTH_PX = 280;
const PREVIEW_IMAGE_MIN_HEIGHT_PX = 280;
const PREVIEW_IMAGE_MIN_VIEWPORT_RATIO = 0.08;
const MESSAGE_CAPTURE_VISIBLE_TAB = "JUDOL_CAPTURE_VISIBLE_TAB";

let keywordCache: Promise<KeywordEntry[]> | null = null;

function createAlgorithmTotals(): Record<DetectionAlgorithmName, number> {
  return {
    kmp: 0,
    "boyer-moore": 0,
    "aho-corasick": 0,
    "rabin-karp": 0,
    regex: 0,
    "weighted-levenshtein": 0,
    ocr: 0,
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

function createRangeKey(start: number, end: number): string {
  return `${start}:${end}`;
}

function mergeEquivalentCandidates(
  candidates: HighlightDescriptor[],
): HighlightDescriptor[] {
  const merged = new Map<string, HighlightDescriptor>();

  for (const candidate of candidates) {
    const key = createRangeKey(candidate.start, candidate.end);
    const existing = merged.get(key);

    if (existing === undefined) {
      merged.set(key, {
        ...candidate,
        algorithmNames: [...candidate.algorithmNames],
      });
      continue;
    }

    let addedAlgorithm = false;
    for (const algorithm of candidate.algorithmNames) {
      let alreadyRegistered = false;

      for (const registeredAlgorithm of existing.algorithmNames) {
        if (registeredAlgorithm === algorithm) {
          alreadyRegistered = true;
          break;
        }
      }

      if (!alreadyRegistered) {
        existing.algorithmNames.push(algorithm);
        addedAlgorithm = true;
      }
    }

    if (addedAlgorithm) {
      existing.durationMs += candidate.durationMs;
      existing.durationLabel = formatDuration(existing.durationMs);
      existing.algorithmLabel = existing.algorithmNames
        .map(formatAlgorithmName)
        .join(", ");
    }

    if (candidate.priority > existing.priority) {
      existing.keyword = candidate.keyword;
      existing.matchedText = candidate.matchedText;
      existing.occurrenceKey = candidate.occurrenceKey;
      existing.priority = candidate.priority;
    }
  }

  return Array.from(merged.values());
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

function incrementOccurrenceCount(
  counts: Map<string, number>,
  labels: Map<string, string>,
  key: string,
  label: string,
): void {
  if (!labels.has(key)) {
    labels.set(key, label);
  }

  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function isVisibleImage(image: HTMLImageElement): boolean {
  if (image instanceof HTMLImageElement === false) {
    return false;
  }

  if (image.getClientRects().length === 0) {
    return false;
  }

  const style = window.getComputedStyle(image);
  return style.display !== "none" && style.visibility !== "hidden";
}

function getImageDisplayArea(image: HTMLImageElement): number {
  const rect = image.getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function isLargePreviewImage(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect();
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const displayArea = getImageDisplayArea(image);

  return (
    rect.width >= PREVIEW_IMAGE_MIN_WIDTH_PX &&
    rect.height >= PREVIEW_IMAGE_MIN_HEIGHT_PX &&
    displayArea / viewportArea >= PREVIEW_IMAGE_MIN_VIEWPORT_RATIO
  );
}

function collectScannableImages(root: HTMLElement): HTMLImageElement[] {
  const visibleImages = Array.from(root.querySelectorAll("img")).filter(isVisibleImage);
  const previewImages = visibleImages.filter(isLargePreviewImage);
  const ordered = [...previewImages, ...visibleImages];
  const unique = new Set<HTMLImageElement>();
  const result: HTMLImageElement[] = [];

  for (const image of ordered) {
    if (unique.has(image)) {
      continue;
    }

    unique.add(image);
    result.push(image);
  }

  return result.sort((left, right) => getImageDisplayArea(right) - getImageDisplayArea(left));
}

function getImageMetadataText(image: HTMLImageElement): string {
  const source = image.currentSrc || image.src;
  const alt = image.alt || "";
  const title = image.title || "";
  return [source, alt, title]
    .map((value) => value.toLowerCase())
    .join(" ");
}

function getImageSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function getTextSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function getUniqueMatchKeywords(matches: DetectionMatchRecord[]): string[] {
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const keyword = getMatchKeyword(match);
    const key = createOccurrenceKey(keyword);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    keywords.push(keyword);
  }

  return keywords;
}

function formatDebugKeywords(keywords: string[]): string {
  if (keywords.length === 0) {
    return "-";
  }

  if (keywords.length <= 3) {
    return keywords.join(", ");
  }

  return `${keywords.slice(0, 3).join(", ")} +${keywords.length - 3}`;
}

function getImageTitleLabel(image: HTMLImageElement, isPreviewImage: boolean): string {
  const source = image.currentSrc || image.src;

  try {
    const url = new URL(source);
    return `${isPreviewImage ? "Preview" : "Image"} - ${url.host}`;
  } catch {
    return `${isPreviewImage ? "Preview" : "Image"} - ${source.slice(0, 48)}`;
  }
}

function formatCaptureMethodLabel(
  finalMethod: "metadata" | "ocr" | "none",
  captureMethod: "direct" | "visible-tab" | "none",
): string {
  if (finalMethod === "metadata") {
    return "tidak dicoba";
  }

  if (captureMethod === "visible-tab") {
    return "visible-tab";
  }

  if (captureMethod === "direct") {
    return "direct";
  }

  return "none";
}

function formatDuration(durationMs: number): string {
  if (durationMs < 0.01) {
    return "<0.01 ms";
  }

  return `${durationMs.toFixed(2)} ms`;
}

function requestVisibleTabCapture(): Promise<CaptureVisibleTabResponse> {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || chrome.runtime?.sendMessage === undefined) {
      resolve({
        ok: false,
        error: "Chrome runtime messaging unavailable",
      });
      return;
    }

    const message: CaptureVisibleTabMessage = {
      type: MESSAGE_CAPTURE_VISIBLE_TAB,
    };

    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error !== undefined) {
        resolve({
          ok: false,
          error: error.message ?? "Gagal meminta screenshot tab.",
        });
        return;
      }

      if (
        typeof response === "object" &&
        response !== null &&
        "ok" in response &&
        typeof (response as { ok?: unknown }).ok === "boolean"
      ) {
        resolve(response as CaptureVisibleTabResponse);
        return;
      }

      resolve({
        ok: false,
        error: "Respons screenshot tab tidak valid.",
      });
    });
  });
}

function getOcrMatchedKeywords(matches: DetectionMatchRecord[]): string[] {
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const keyword = getMatchKeyword(match);
    const key = createOccurrenceKey(keyword);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    keywords.push(keyword);
  }

  return keywords;
}

function createOcrAlgorithmLabel(matches: DetectionMatchRecord[], captureMethod: string): string {
  const algorithms: DetectionAlgorithmName[] = [];

  for (const match of matches) {
    for (const algorithm of getMatchAlgorithms(match)) {
      let exists = false;

      for (const registeredAlgorithm of algorithms) {
        if (registeredAlgorithm === algorithm) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        algorithms.push(algorithm);
      }
    }
  }

  const ocrLabel = captureMethod === "visible-tab" ? "OCR (Visible Tab)" : "OCR";
  if (algorithms.length === 0) {
    return ocrLabel;
  }

  return `${ocrLabel} + ${algorithms.map(formatAlgorithmName).join(", ")}`;
}

export async function scanPage(
  maskSettings: MaskSettings,
): Promise<PageScanResult> {
  const startedAt = nowMs();
  const keywords = await getKeywords();
  const root = document.body;
  const textHighlights: HighlightDescriptor[] = [];
  const imageHighlights: ImageHighlightDescriptor[] = [];
  const algorithmDurationsMs = createAlgorithmTotals();
  const algorithmMatches = createAlgorithmTotals();
  const occurrenceCounts = new Map<string, number>();
  const occurrenceLabels = new Map<string, string>();
  const debugItems: PopupDebugItem[] = [];
  let totalMatches = 0;
  let visibleTabCapturePromise: Promise<CaptureVisibleTabResponse> | null = null;
  let matchedTextNodeCount = 0;
  let matchedImageCount = 0;

  if (root === null) {
    return {
      textHighlights,
      imageHighlights,
      summary: {
        scannedAt: Date.now(),
        totalDurationMs: nowMs() - startedAt,
        totalMatches: 0,
        uniqueDetections: 0,
        algorithmMatches,
        algorithmDurationsMs,
        detections: [],
        maskEnabled: maskSettings.enabled,
        maskMode: maskSettings.mode,
        maskGifUrl: maskSettings.gifUrl,
        debug: {
          scannedTextNodes: 0,
          matchedTextNodes: 0,
          scannedImages: 0,
          matchedImages: 0,
          items: [],
        },
      },
    };
  }

  const textNodes = collectTextNodes(root);

  for (const node of textNodes) {
    const text = node.data;
    const report = detectJudolContent(text, keywords);

    for (const benchmark of report.benchmarks) {
      algorithmDurationsMs[benchmark.algorithm] += benchmark.durationMs;
      algorithmMatches[benchmark.algorithm] += benchmark.matches;
    }

    if (report.matches.length > 0) {
      matchedTextNodeCount += 1;
      const keywordsLabel = formatDebugKeywords(getUniqueMatchKeywords(report.matches));

      debugItems.push({
        kind: "text",
        title: getTextSnippet(text),
        status: `${report.matches.length} match`,
        detail: `Keyword: ${keywordsLabel}`,
      });
    }

    const candidates: HighlightDescriptor[] = [];
    const seenDetectionKeys = new Set<string>();

    for (const match of report.matches) {
      if (!isValidRange(match, text.length)) {
        continue;
      }

      const presentation = describeMatch(match, report.benchmarks);
      const occurrenceKey = createOccurrenceKey(presentation.keyword);
      const detectionKey = `${occurrenceKey}:${createRangeKey(match.start, match.end)}`;

      if (!seenDetectionKeys.has(detectionKey)) {
        seenDetectionKeys.add(detectionKey);
        incrementOccurrenceCount(
          occurrenceCounts,
          occurrenceLabels,
          occurrenceKey,
          presentation.keyword,
        );
        totalMatches += 1;
      }

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

    }

    const selected = selectNonOverlappingMatches(
      mergeEquivalentCandidates(candidates),
    );
    textHighlights.push(...selected);
  }

  const imageElements = collectScannableImages(root);

  for (const image of imageElements) {
    const isPreviewImage = isLargePreviewImage(image);
    const metadataText = getImageMetadataText(image);
    let matchedKeywords = collectContainedPatterns(
      metadataText,
      keywords.map((keyword) => keyword.raw.toLowerCase()),
    );
    let matchedText = getImageSnippet(metadataText);
    let detectionMethod: "metadata" | "ocr" = "metadata";
    let durationMs = 0;
    let ocrFailureReason: string | null = null;
    let captureMethod: "direct" | "visible-tab" | "none" = "none";
    let ocrMatches: DetectionMatchRecord[] = [];
    let finalMethod: "metadata" | "ocr" | "none" =
      matchedKeywords.length > 0 ? "metadata" : "none";

    if (matchedKeywords.length === 0) {
      let screenshotDataUrl: string | null = null;
      let screenshotFailureReason: string | null = null;

      if (isPreviewImage) {
        if (visibleTabCapturePromise === null) {
          visibleTabCapturePromise = requestVisibleTabCapture();
        }

        const captureResponse = await visibleTabCapturePromise;
        if (captureResponse.ok) {
          screenshotDataUrl = captureResponse.dataUrl;
        } else {
          screenshotFailureReason = captureResponse.error;
        }
      }

      const ocrResult = await scanImageKeywords(image, keywords, {
        preferScreenshotCapture: isPreviewImage,
        screenshotDataUrl,
        screenshotFailureReason,
      });
      algorithmDurationsMs.ocr += ocrResult.durationMs;
      captureMethod = ocrResult.captureMethod;
      ocrMatches = ocrResult.report?.matches ?? [];
      matchedKeywords =
        ocrMatches.length === 0 ? [] : getOcrMatchedKeywords(ocrMatches);
      matchedText = getImageSnippet(ocrResult.text);
      detectionMethod = "ocr";
      durationMs = ocrResult.durationMs;
      ocrFailureReason = ocrResult.failureReason;
      finalMethod = matchedKeywords.length > 0 ? "ocr" : "none";

      if (ocrResult.report !== null && matchedKeywords.length > 0) {
        for (const benchmark of ocrResult.report.benchmarks) {
          if (benchmark.algorithm === "ocr") {
            continue;
          }

          algorithmDurationsMs[benchmark.algorithm] += benchmark.durationMs;
          algorithmMatches[benchmark.algorithm] += benchmark.matches;
        }
      }
    }

    if (
      matchedKeywords.length === 0 &&
      ocrFailureReason !== null &&
      isPreviewImage
    ) {
      imageHighlights.push({
        element: image,
        keyword: "Preview image besar",
        matchedText:
          matchedText.length > 0 ? matchedText : "OCR tidak menghasilkan teks.",
        algorithmLabel: "OCR gagal",
        durationLabel: formatDuration(durationMs),
        durationMs,
        occurrenceKey: `ocr-failed:${image.currentSrc || image.src || "preview"}`,
        occurrences: 0,
        priority: 0,
        shouldBlur: false,
        variant: "ocr-failed",
        noteLabel: "Alasan",
        noteValue: ocrFailureReason,
      });
    }

    debugItems.push({
      kind: "image",
      title: getImageTitleLabel(image, isPreviewImage),
      status:
        finalMethod === "metadata"
          ? "Metadata"
          : finalMethod === "ocr"
            ? captureMethod === "visible-tab"
              ? "OCR Visible Tab"
              : "OCR"
            : ocrFailureReason !== null
              ? "OCR gagal"
              : "No match",
      detail:
        finalMethod === "metadata"
          ? `Keyword: ${formatDebugKeywords(matchedKeywords)}`
          : finalMethod === "ocr"
            ? `Keyword: ${formatDebugKeywords(matchedKeywords)}`
            : `OCR text: ${matchedText.length > 0 ? matchedText : "-"}`,
      note: ocrFailureReason ?? undefined,
      meta: [
        `Preview besar: ${isPreviewImage ? "ya" : "tidak"}`,
        `Capture OCR: ${formatCaptureMethodLabel(finalMethod, captureMethod)}`,
      ],
    });

    if (matchedKeywords.length === 0) {
      continue;
    }

    matchedImageCount += 1;

    const primaryKeyword = matchedKeywords[0];
    const occurrenceKey = createOccurrenceKey(primaryKeyword);
    const label = matchedKeywords.join(", ");

    imageHighlights.push({
      element: image,
      keyword: label,
      matchedText,
      algorithmLabel:
        detectionMethod === "ocr"
          ? createOcrAlgorithmLabel(ocrMatches, captureMethod)
          : "Metadata",
      durationLabel: formatDuration(durationMs),
      durationMs,
      occurrenceKey,
      occurrences: 0,
      priority: 1,
      shouldBlur: true,
      variant: "match",
    });

    for (const keyword of matchedKeywords) {
      incrementOccurrenceCount(
        occurrenceCounts,
        occurrenceLabels,
        createOccurrenceKey(keyword),
        keyword,
      );
      totalMatches += 1;
    }

    if (detectionMethod === "ocr") {
      algorithmMatches.ocr += matchedKeywords.length;
    }
  }

  for (const highlight of textHighlights) {
    highlight.occurrences = occurrenceCounts.get(highlight.occurrenceKey) ?? 1;
  }

  for (const highlight of imageHighlights) {
    highlight.occurrences = occurrenceCounts.get(highlight.occurrenceKey) ?? 1;
  }

  for (const algorithm of ALGORITHMS) {
    algorithmMatches[algorithm] = algorithmMatches[algorithm] ?? 0;
    algorithmDurationsMs[algorithm] = algorithmDurationsMs[algorithm] ?? 0;
  }

  return {
    textHighlights,
    imageHighlights,
    summary: {
      scannedAt: Date.now(),
      totalDurationMs: nowMs() - startedAt,
      totalMatches,
      uniqueDetections: occurrenceCounts.size,
      algorithmMatches,
      algorithmDurationsMs,
      detections: buildDetectionBuckets(occurrenceCounts, occurrenceLabels),
      maskEnabled: maskSettings.enabled,
      maskMode: maskSettings.mode,
      maskGifUrl: maskSettings.gifUrl,
      debug: {
        scannedTextNodes: textNodes.length,
        matchedTextNodes: matchedTextNodeCount,
        scannedImages: imageElements.length,
        matchedImages: matchedImageCount,
        items: debugItems,
      },
    },
  };
}
