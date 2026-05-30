import type {
  ContentRequest,
  MaskSettings,
  PopupScanState,
} from "../extension/protocol";
import { DEFAULT_MASK_SETTINGS } from "../extension/masking";
import { injectContentStyles } from "./contentStyles";
import { isDetectorOwnedNode } from "./domFilters";
import {
  applyMaskState,
  clearHighlights,
  renderHighlights,
  renderImageHighlights,
} from "./highlighter";
import {
  getStoredMaskSettings,
  watchStoredMaskSettings,
} from "../extension/masking";
import { scanPage } from "./scanner";
import { initializeTooltip } from "./tooltip";

const MESSAGE_GET_SCAN_STATE = "JUDOL_GET_SCAN_STATE";
const MESSAGE_RESCAN = "JUDOL_RESCAN";
const MESSAGE_SET_MASK = "JUDOL_SET_MASK";
const RESCAN_DEBOUNCE_MS = 700;

let maskSettings: MaskSettings = { ...DEFAULT_MASK_SETTINGS };
let scanState: PopupScanState = {
  status: "idle",
  summary: null,
};
let observer: MutationObserver | null = null;
let rescanTimer: number | null = null;
let scanning = false;
let scanQueued = false;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Scan gagal dijalankan.";
}

function isContentRequest(message: unknown): message is ContentRequest {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown };
  return (
    candidate.type === MESSAGE_GET_SCAN_STATE ||
    candidate.type === MESSAGE_RESCAN ||
    candidate.type === MESSAGE_SET_MASK
  );
}

function startObserver(): void {
  if (document.documentElement === null) {
    return;
  }

  if (observer === null) {
    observer = new MutationObserver(handleMutations);
  }

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function stopObserver(): void {
  observer?.disconnect();
}

function mutationTouchesOnlyDetectorNodes(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (isDetectorOwnedNode(mutation.target)) {
      continue;
    }

    if (mutation.addedNodes.length === 0 && mutation.removedNodes.length === 0) {
      return false;
    }

    for (const node of mutation.addedNodes) {
      if (!isDetectorOwnedNode(node)) {
        return false;
      }
    }

    for (const node of mutation.removedNodes) {
      if (!isDetectorOwnedNode(node)) {
        return false;
      }
    }
  }

  return true;
}

function handleMutations(mutations: MutationRecord[]): void {
  if (mutationTouchesOnlyDetectorNodes(mutations)) {
    return;
  }

  scheduleRescan();
}

function clearPendingRescan(): void {
  if (rescanTimer === null) {
    return;
  }

  window.clearTimeout(rescanTimer);
  rescanTimer = null;
}

function scheduleRescan(): void {
  clearPendingRescan();
  rescanTimer = window.setTimeout(() => {
    rescanTimer = null;
    void scanAndRender();
  }, RESCAN_DEBOUNCE_MS);
}

function updateMaskSettings(nextSettings: MaskSettings): void {
  maskSettings = {
    enabled: nextSettings.enabled,
    mode: nextSettings.mode,
    gifUrl: nextSettings.gifUrl,
    gifPreset: nextSettings.gifPreset,
    gifPool: nextSettings.gifPool,
  };
  applyMaskState(maskSettings);

  if (scanState.status === "ready") {
    scanState = {
      status: "ready",
      summary: {
        ...scanState.summary,
        maskEnabled: maskSettings.enabled,
        maskMode: maskSettings.mode,
        maskGifUrl: maskSettings.gifUrl,
        maskGifPreset: maskSettings.gifPreset,
      },
    };
  }
}

async function scanAndRender(): Promise<PopupScanState> {
  if (scanning) {
    scanQueued = true;
    return scanState;
  }

  scanning = true;
  stopObserver();

  try {
    clearPendingRescan();
    clearHighlights();

    const result = await scanPage(maskSettings);
    renderHighlights(result.textHighlights, maskSettings);
    renderImageHighlights(result.imageHighlights, maskSettings);
    scanState = {
      status: "ready",
      summary: result.summary,
    };
  } catch (error) {
    clearHighlights();
    scanState = {
      status: "error",
      summary: null,
      error: getErrorMessage(error),
    };
  } finally {
    scanning = false;
    startObserver();

    if (scanQueued) {
      scanQueued = false;
      scheduleRescan();
    }
  }

  return scanState;
}

function registerMessageHandlers(): void {
  if (typeof chrome === "undefined" || chrome.runtime?.onMessage === undefined) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isContentRequest(message)) {
      return false;
    }

    if (message.type === MESSAGE_GET_SCAN_STATE) {
      sendResponse(scanState);
      return false;
    }

    if (message.type === MESSAGE_SET_MASK) {
      updateMaskSettings({
        enabled: message.enabled,
        mode: message.mode,
        gifUrl: message.gifUrl,
        gifPreset: message.gifPreset,
        gifPool: message.gifPool,
      });
      sendResponse(scanState);
      return false;
    }

    void scanAndRender().then(sendResponse);
    return true;
  });
}

async function initialize(): Promise<void> {
  injectContentStyles();
  initializeTooltip();
  registerMessageHandlers();
  updateMaskSettings(await getStoredMaskSettings());
  watchStoredMaskSettings(updateMaskSettings);
  await scanAndRender();
}

void initialize();
