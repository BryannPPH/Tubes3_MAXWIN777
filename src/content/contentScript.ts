import type {
  ContentRequest,
  PopupScanState,
} from "../extension/protocol";
import { injectContentStyles } from "./contentStyles";
import { isDetectorOwnedNode } from "./domFilters";
import {
  applyBlurState,
  clearHighlights,
  renderHighlights,
  renderImageHighlights,
} from "./highlighter";
import {
  getStoredBlurEnabled,
  watchStoredBlurEnabled,
} from "./settings";
import { scanPage } from "./scanner";
import { initializeTooltip } from "./tooltip";

const MESSAGE_GET_SCAN_STATE = "JUDOL_GET_SCAN_STATE";
const MESSAGE_RESCAN = "JUDOL_RESCAN";
const MESSAGE_SET_BLUR = "JUDOL_SET_BLUR";
const RESCAN_DEBOUNCE_MS = 700;

let blurEnabled = false;
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
    candidate.type === MESSAGE_SET_BLUR
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

function updateBlurState(enabled: boolean): void {
  blurEnabled = enabled;
  applyBlurState(blurEnabled);

  if (scanState.status === "ready") {
    scanState = {
      status: "ready",
      summary: {
        ...scanState.summary,
        blurred: blurEnabled,
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

    const result = await scanPage(blurEnabled);
    renderHighlights(result.textHighlights, blurEnabled);
    renderImageHighlights(result.imageHighlights, blurEnabled);
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

    if (message.type === MESSAGE_SET_BLUR) {
      updateBlurState(message.enabled);
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
  blurEnabled = await getStoredBlurEnabled();
  watchStoredBlurEnabled(updateBlurState);
  await scanAndRender();
}

void initialize();