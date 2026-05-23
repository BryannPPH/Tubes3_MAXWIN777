const BLUR_STORAGE_KEY = "judolDetectorBlurEnabled";

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && chrome.storage?.local !== undefined;
}

export function getStoredBlurEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) {
      resolve(false);
      return;
    }

    chrome.storage.local.get({ [BLUR_STORAGE_KEY]: false }, (items) => {
      resolve(items[BLUR_STORAGE_KEY] === true);
    });
  });
}

export function watchStoredBlurEnabled(
  callback: (enabled: boolean) => void,
): void {
  if (!hasChromeStorage()) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    const blurChange = changes[BLUR_STORAGE_KEY];
    if (blurChange === undefined) {
      return;
    }

    callback(blurChange.newValue === true);
  });
}

export { BLUR_STORAGE_KEY };