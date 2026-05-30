import "../styles/popup.css";
import type {
  ContentRequest,
  GifPreset,
  MaskSettings,
  PopupDebugItem,
  PopupScanState,
  PopupScanSummary,
  ResolveGifCollectionResponse,
} from "../extension/protocol";
import {
  DEFAULT_MASK_SETTINGS,
  getStoredMaskSettings,
  setStoredMaskSettings,
} from "../extension/masking";
import type { DetectionAlgorithmName } from "../detection/types";

const MESSAGE_GET_SCAN_STATE = "JUDOL_GET_SCAN_STATE";
const MESSAGE_RESCAN = "JUDOL_RESCAN";
const MESSAGE_SET_MASK = "JUDOL_SET_MASK";
const MESSAGE_RESOLVE_GIF_COLLECTION = "JUDOL_RESOLVE_GIF_COLLECTION";

const ALGORITHMS: DetectionAlgorithmName[] = [
  "kmp",
  "boyer-moore",
  "aho-corasick",
  "rabin-karp",
  "regex",
  "weighted-levenshtein",
  "ocr",
];

const ALGORITHM_LABELS: Record<DetectionAlgorithmName, string> = {
  kmp: "KMP",
  "boyer-moore": "Boyer-Moore",
  "aho-corasick": "Aho-Corasick",
  "rabin-karp": "Rabin-Karp",
  regex: "RegEx",
  "weighted-levenshtein": "Weighted Levenshtein",
  ocr: "OCR",
};

function getRequiredElement<TElement extends HTMLElement>(
  id: string,
  constructor: { new (): TElement },
): TElement {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Element #${id} tidak ditemukan.`);
  }

  return element;
}

const rescanButton = getRequiredElement("rescan-button", HTMLButtonElement);
const maskToggle = getRequiredElement("mask-toggle", HTMLInputElement);
const maskModeSelect = getRequiredElement("mask-mode", HTMLSelectElement);
const gifPresetSelect = getRequiredElement("gif-preset", HTMLSelectElement);
const gifUrlInput = getRequiredElement("gif-url", HTMLInputElement);
const gifHelp = getRequiredElement("gif-help", HTMLElement);
const totalMatchesElement = getRequiredElement("total-matches", HTMLElement);
const uniqueDetectionsElement = getRequiredElement("unique-detections", HTMLElement);
const scanDurationElement = getRequiredElement("scan-duration", HTMLElement);
const algorithmTotalElement = getRequiredElement("algorithm-total", HTMLElement);
const keywordTotalElement = getRequiredElement("keyword-total", HTMLElement);
const algorithmList = getRequiredElement("algorithm-list", HTMLElement);
const keywordList = getRequiredElement("keyword-list", HTMLElement);
const debugTextOverview = getRequiredElement("debug-text-overview", HTMLElement);
const debugImageOverview = getRequiredElement("debug-image-overview", HTMLElement);
const debugTextSummary = getRequiredElement("debug-text-summary", HTMLElement);
const debugImageSummary = getRequiredElement("debug-image-summary", HTMLElement);
const debugTextList = getRequiredElement("debug-text-list", HTMLElement);
const debugImageList = getRequiredElement("debug-image-list", HTMLElement);
const statusText = getRequiredElement("status-text", HTMLElement);

let syncingControls = false;

function formatDuration(durationMs: number): string {
  if (durationMs < 0.01) {
    return "<0.01 ms";
  }

  return `${durationMs.toFixed(2)} ms`;
}

function setStatus(message: string): void {
  statusText.textContent = message;
}

function createBarRow(
  label: string,
  value: string,
  count: number,
  maxCount: number,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "bar-row";

  const header = document.createElement("div");
  header.className = "bar-header";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  const valueElement = document.createElement("strong");
  valueElement.textContent = value;

  header.append(labelElement, valueElement);

  const track = document.createElement("div");
  track.className = "bar-track";

  const fill = document.createElement("div");
  fill.className = "bar-fill";
  fill.style.width = `${maxCount === 0 ? 0 : Math.max(6, (count / maxCount) * 100)}%`;

  track.appendChild(fill);
  row.append(header, track);
  return row;
}

function getMaxAlgorithmCount(summary: PopupScanSummary): number {
  let maxCount = 0;

  for (const algorithm of ALGORITHMS) {
    maxCount = Math.max(maxCount, summary.algorithmMatches[algorithm]);
  }

  return maxCount;
}

function renderAlgorithms(summary: PopupScanSummary): void {
  algorithmList.replaceChildren();
  algorithmTotalElement.textContent = `${summary.totalMatches} match`;
  const maxCount = getMaxAlgorithmCount(summary);

  for (const algorithm of ALGORITHMS) {
    const count = summary.algorithmMatches[algorithm];
    const duration = formatDuration(summary.algorithmDurationsMs[algorithm]);
    algorithmList.appendChild(
      createBarRow(
        ALGORITHM_LABELS[algorithm],
        `${count} match - ${duration}`,
        count,
        maxCount,
      ),
    );
  }
}

function renderKeywords(summary: PopupScanSummary): void {
  keywordList.replaceChildren();
  keywordTotalElement.textContent = `${summary.detections.length} unik`;

  if (summary.detections.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Belum ada keyword terdeteksi.";
    keywordList.appendChild(empty);
    return;
  }

  const maxCount = summary.detections[0]?.count ?? 0;
  for (const detection of summary.detections) {
    keywordList.appendChild(
      createBarRow(detection.label, `${detection.count}x`, detection.count, maxCount),
    );
  }
}

function createDebugRow(item: PopupDebugItem): HTMLElement {
  const row = document.createElement("article");
  row.className = "debug-row";

  const header = document.createElement("div");
  header.className = "debug-row-header";

  const title = document.createElement("strong");
  title.className = "debug-row-title";
  title.textContent = item.title;

  const status = document.createElement("span");
  status.className = "debug-row-status";
  status.textContent = item.status;

  header.append(title, status);

  const detail = document.createElement("p");
  detail.className = "debug-row-detail";
  detail.textContent = item.detail;

  row.append(header, detail);

  if (item.meta !== undefined && item.meta.length > 0) {
    const meta = document.createElement("div");
    meta.className = "debug-row-meta";

    for (const metaItem of item.meta) {
      const metaLine = document.createElement("p");
      metaLine.className = "debug-row-meta-item";
      metaLine.textContent = metaItem;
      meta.appendChild(metaLine);
    }

    row.appendChild(meta);
  }

  if (item.note !== undefined && item.note.length > 0) {
    const note = document.createElement("p");
    note.className = "debug-row-note";
    note.textContent = item.note;
    row.appendChild(note);
  }

  return row;
}

function renderDebugList(
  target: HTMLElement,
  items: PopupDebugItem[],
  emptyMessage: string,
): void {
  target.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    target.appendChild(empty);
    return;
  }

  for (const item of items) {
    target.appendChild(createDebugRow(item));
  }
}

function renderDebug(summary: PopupScanSummary): void {
  const textItems = summary.debug.items.filter((item) => item.kind === "text");
  const imageItems = summary.debug.items.filter((item) => item.kind === "image");

  debugTextOverview.textContent =
    `${summary.debug.matchedTextNodes} / ${summary.debug.scannedTextNodes}`;
  debugImageOverview.textContent =
    `${summary.debug.matchedImages} / ${summary.debug.scannedImages}`;
  debugTextSummary.textContent = `${textItems.length} item`;
  debugImageSummary.textContent = `${imageItems.length} item`;

  renderDebugList(
    debugTextList,
    textItems,
    "Belum ada node teks yang terekam untuk scan ini.",
  );
  renderDebugList(
    debugImageList,
    imageItems,
    "Belum ada image scan yang terekam untuk scan ini.",
  );
}

function syncMaskControls(settings: MaskSettings): void {
  syncingControls = true;
  maskToggle.checked = settings.enabled;
  maskModeSelect.value = settings.mode;
  gifPresetSelect.value = settings.gifPreset;
  gifUrlInput.value = settings.gifUrl;
  const gifModeActive = settings.mode === "gif";
  const customPreset = settings.gifPreset === "custom";
  gifPresetSelect.disabled = !gifModeActive;
  gifUrlInput.disabled = !gifModeActive || !customPreset;
  gifHelp.textContent = !gifModeActive
    ? "GIF preset dan URL hanya dipakai saat mode sensor = GIF Cover."
    : customPreset
      ? "Kosongkan untuk pakai cover animasi bawaan."
      : `Random dari preset ${settings.gifPreset === "drake" ? "Drake" : "IShowSpeed"}.`;
  syncingControls = false;
}

function readMaskSettingsFromControls(): MaskSettings {
  const gifPreset = normalizeGifPreset(gifPresetSelect.value);
  const gifUrl = gifUrlInput.value.trim();

  return {
    enabled: maskToggle.checked,
    mode: maskModeSelect.value === "gif" ? "gif" : "blur",
    gifUrl,
    gifPreset,
    gifPool: gifPreset === "custom" && gifUrl.length > 0 ? [gifUrl] : [],
  };
}

function normalizeGifPreset(value: string): GifPreset {
  if (value === "drake" || value === "ishowspeed") {
    return value;
  }

  return "custom";
}

function renderState(state: PopupScanState): void {
  if (state.status === "error") {
    totalMatchesElement.textContent = "0";
    uniqueDetectionsElement.textContent = "0";
    scanDurationElement.textContent = "0.00 ms";
    algorithmTotalElement.textContent = "0";
    keywordTotalElement.textContent = "0";
    algorithmList.replaceChildren();
    keywordList.replaceChildren();
    debugTextList.replaceChildren();
    debugImageList.replaceChildren();
    debugTextOverview.textContent = "0 / 0";
    debugImageOverview.textContent = "0 / 0";
    debugTextSummary.textContent = "0 item";
    debugImageSummary.textContent = "0 item";
    setStatus(state.error);
    return;
  }

  if (state.status === "idle" || state.summary === null) {
    totalMatchesElement.textContent = "0";
    uniqueDetectionsElement.textContent = "0";
    scanDurationElement.textContent = "0.00 ms";
    algorithmTotalElement.textContent = "0";
    keywordTotalElement.textContent = "0";
    algorithmList.replaceChildren();
    keywordList.replaceChildren();
    debugTextList.replaceChildren();
    debugImageList.replaceChildren();
    debugTextOverview.textContent = "0 / 0";
    debugImageOverview.textContent = "0 / 0";
    debugTextSummary.textContent = "0 item";
    debugImageSummary.textContent = "0 item";
    syncMaskControls(DEFAULT_MASK_SETTINGS);
    setStatus("Content script belum mengirim hasil scan.");
    return;
  }

  totalMatchesElement.textContent = String(state.summary.totalMatches);
  uniqueDetectionsElement.textContent = String(state.summary.uniqueDetections);
  scanDurationElement.textContent = formatDuration(state.summary.totalDurationMs);
  syncMaskControls({
    enabled: state.summary.maskEnabled,
    mode: state.summary.maskMode,
    gifUrl: state.summary.maskGifUrl,
    gifPreset: state.summary.maskGifPreset,
    gifPool: [],
  });
  renderAlgorithms(state.summary);
  renderKeywords(state.summary);
  renderDebug(state.summary);
  setStatus(`Terakhir scan: ${new Date(state.summary.scannedAt).toLocaleTimeString()}`);
}

function getActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.id ?? null);
    });
  });
}

async function sendToActiveTab(message: ContentRequest): Promise<PopupScanState> {
  const tabId = await getActiveTabId();
  if (tabId === null) {
    throw new Error("Tab aktif tidak ditemukan.");
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;
      if (error !== undefined) {
        reject(new Error(error.message ?? "Content script tidak tersedia di tab ini."));
        return;
      }

      resolve(response as PopupScanState);
    });
  });
}

function sendToBackground(
  message:
    | {
        type: "JUDOL_RESOLVE_GIF_COLLECTION";
        preset: Exclude<GifPreset, "custom">;
      },
): Promise<ResolveGifCollectionResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;
      if (error !== undefined) {
        reject(new Error(error.message ?? "Background worker tidak tersedia."));
        return;
      }

      resolve(response as ResolveGifCollectionResponse);
    });
  });
}

async function refreshState(): Promise<void> {
  try {
    const state = await sendToActiveTab({ type: MESSAGE_GET_SCAN_STATE });
    renderState(state);
  } catch (error) {
    renderState({
      status: "error",
      summary: null,
      error: error instanceof Error ? error.message : "Gagal mengambil hasil scan.",
    });
  }
}

async function persistMaskSettings(): Promise<void> {
  const settings = readMaskSettingsFromControls();

  if (settings.mode === "gif" && settings.gifPreset !== "custom") {
    const resolved = await sendToBackground({
      type: MESSAGE_RESOLVE_GIF_COLLECTION,
      preset: settings.gifPreset,
    });

    if (!resolved.ok) {
      throw new Error(resolved.error);
    }

    settings.gifPool = resolved.gifUrls;
  }

  await setStoredMaskSettings(settings);
  const state = await sendToActiveTab({
    type: MESSAGE_SET_MASK,
    enabled: settings.enabled,
    mode: settings.mode,
    gifUrl: settings.gifUrl,
    gifPreset: settings.gifPreset,
    gifPool: settings.gifPool,
  });
  renderState(state);
}

rescanButton.addEventListener("click", () => {
  rescanButton.disabled = true;
  setStatus("Scanning ulang halaman...");

  void sendToActiveTab({ type: MESSAGE_RESCAN })
    .then(renderState)
    .catch((error: unknown) => {
      renderState({
        status: "error",
        summary: null,
        error: error instanceof Error ? error.message : "Rescan gagal.",
      });
    })
    .finally(() => {
      rescanButton.disabled = false;
    });
});

function handleMaskControlChange(): void {
  if (syncingControls) {
    return;
  }

  syncMaskControls(readMaskSettingsFromControls());
  setStatus("Menyimpan pengaturan masking...");
  void persistMaskSettings().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "Pengaturan masking gagal disimpan.");
  });
}

maskToggle.addEventListener("change", handleMaskControlChange);
maskModeSelect.addEventListener("change", handleMaskControlChange);
gifPresetSelect.addEventListener("change", handleMaskControlChange);
gifUrlInput.addEventListener("change", handleMaskControlChange);

void getStoredMaskSettings()
  .then((settings) => {
    syncMaskControls(settings);
  })
  .then(refreshState);
