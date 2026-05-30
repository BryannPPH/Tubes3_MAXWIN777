import type { MaskMode, MaskSettings } from "./protocol";

export const MASK_ENABLED_STORAGE_KEY = "judolDetectorBlurEnabled";
export const MASK_MODE_STORAGE_KEY = "judolDetectorMaskMode";
export const MASK_GIF_URL_STORAGE_KEY = "judolDetectorMaskGifUrl";

export const DEFAULT_MASK_SETTINGS: MaskSettings = {
  enabled: false,
  mode: "blur",
  gifUrl: "",
};

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && chrome.storage?.local !== undefined;
}

function normalizeMaskMode(value: unknown): MaskMode {
  return value === "gif" ? "gif" : "blur";
}

function normalizeGifUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getStoredMaskSettings(): Promise<MaskSettings> {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) {
      resolve({ ...DEFAULT_MASK_SETTINGS });
      return;
    }

    chrome.storage.local.get(
      {
        [MASK_ENABLED_STORAGE_KEY]: DEFAULT_MASK_SETTINGS.enabled,
        [MASK_MODE_STORAGE_KEY]: DEFAULT_MASK_SETTINGS.mode,
        [MASK_GIF_URL_STORAGE_KEY]: DEFAULT_MASK_SETTINGS.gifUrl,
      },
      (items) => {
        resolve({
          enabled: items[MASK_ENABLED_STORAGE_KEY] === true,
          mode: normalizeMaskMode(items[MASK_MODE_STORAGE_KEY]),
          gifUrl: normalizeGifUrl(items[MASK_GIF_URL_STORAGE_KEY]),
        });
      },
    );
  });
}

export function setStoredMaskSettings(settings: MaskSettings): Promise<void> {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) {
      resolve();
      return;
    }

    chrome.storage.local.set(
      {
        [MASK_ENABLED_STORAGE_KEY]: settings.enabled,
        [MASK_MODE_STORAGE_KEY]: normalizeMaskMode(settings.mode),
        [MASK_GIF_URL_STORAGE_KEY]: normalizeGifUrl(settings.gifUrl),
      },
      resolve,
    );
  });
}

export function watchStoredMaskSettings(
  callback: (settings: MaskSettings) => void,
): void {
  if (!hasChromeStorage()) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (
      changes[MASK_ENABLED_STORAGE_KEY] === undefined &&
      changes[MASK_MODE_STORAGE_KEY] === undefined &&
      changes[MASK_GIF_URL_STORAGE_KEY] === undefined
    ) {
      return;
    }

    void getStoredMaskSettings().then(callback);
  });
}
