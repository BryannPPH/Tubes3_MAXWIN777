import "../styles/popup.css";
import type {
  ContentRequest,
  PopupScanState,
  PopupScanSummary,
} from "../extension/protocol";
import type { DetectionAlgorithmName } from "../detection/types";

const MESSAGE_GET_SCAN_STATE = "JUDOL_GET_SCAN_STATE";
const MESSAGE_RESCAN = "JUDOL_RESCAN";
const MESSAGE_SET_BLUR = "JUDOL_SET_BLUR";
const BLUR_STORAGE_KEY = "judolDetectorBlurEnabled";

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
const blurToggle = getRequiredElement("blur-toggle", HTMLInputElement);
const totalMatchesElement = getRequiredElement("total-matches", HTMLElement);
const uniqueDetectionsElement = getRequiredElement("unique-detections", HTMLElement);
const scanDurationElement = getRequiredElement("scan-duration", HTMLElement);
const algorithmList = getRequiredElement("algorithm-list", HTMLElement);
const keywordList = getRequiredElement("keyword-list", HTMLElement);
const statusText = getRequiredElement("status-text", HTMLElement);

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

function renderState(state: PopupScanState): void {
  if (state.status === "error") {
    totalMatchesElement.textContent = "0";
    uniqueDetectionsElement.textContent = "0";
    scanDurationElement.textContent = "0.00 ms";
    algorithmList.replaceChildren();
    keywordList.replaceChildren();
    setStatus(state.error);
    return;
  }

  if (state.status === "idle" || state.summary === null) {
    totalMatchesElement.textContent = "0";
    uniqueDetectionsElement.textContent = "0";
    scanDurationElement.textContent = "0.00 ms";
    setStatus("Content script belum mengirim hasil scan.");
    return;
  }

  totalMatchesElement.textContent = String(state.summary.totalMatches);
  uniqueDetectionsElement.textContent = String(state.summary.uniqueDetections);
  scanDurationElement.textContent = formatDuration(state.summary.totalDurationMs);
  blurToggle.checked = state.summary.blurred;
  renderAlgorithms(state.summary);
  renderKeywords(state.summary);
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

function getStoredBlurEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [BLUR_STORAGE_KEY]: false }, (items) => {
      resolve(items[BLUR_STORAGE_KEY] === true);
    });
  });
}

function setStoredBlurEnabled(enabled: boolean): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [BLUR_STORAGE_KEY]: enabled }, resolve);
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

blurToggle.addEventListener("change", () => {
  const enabled = blurToggle.checked;
  void setStoredBlurEnabled(enabled)
    .then(() => sendToActiveTab({ type: MESSAGE_SET_BLUR, enabled }))
    .then(renderState)
    .catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Toggle blur gagal.");
    });
});

void getStoredBlurEnabled()
  .then((enabled) => {
    blurToggle.checked = enabled;
  })
  .then(refreshState);
