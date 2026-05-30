import type {
  BackgroundRequest,
  CaptureVisibleTabMessage,
  CaptureVisibleTabResponse,
} from "../extension/protocol";

const MESSAGE_CAPTURE_VISIBLE_TAB = "JUDOL_CAPTURE_VISIBLE_TAB";

function isCaptureVisibleTabMessage(
  message: BackgroundRequest | unknown,
): message is CaptureVisibleTabMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown };
  return candidate.type === MESSAGE_CAPTURE_VISIBLE_TAB;
}

function captureVisibleTab(
  sendResponse: (response: CaptureVisibleTabResponse) => void,
): void {
  chrome.tabs.captureVisibleTab(undefined, { format: "png" }, (dataUrl) => {
    const error = chrome.runtime.lastError;

    if (error !== undefined) {
      sendResponse({
        ok: false,
        error: error.message ?? "Gagal mengambil screenshot tab.",
      });
      return;
    }

    if (typeof dataUrl !== "string" || dataUrl.length === 0) {
      sendResponse({
        ok: false,
        error: "Screenshot tab kosong.",
      });
      return;
    }

    sendResponse({
      ok: true,
      dataUrl,
    });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isCaptureVisibleTabMessage(message)) {
    return false;
  }

  captureVisibleTab(sendResponse as (response: CaptureVisibleTabResponse) => void);
  return true;
});
