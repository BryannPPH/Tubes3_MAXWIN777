interface ChromeRuntimeLastError {
  message?: string;
}

interface ChromeMessageSender {
  tab?: {
    id?: number;
  };
}

interface ChromeEvent<TCallback extends (...args: never[]) => unknown> {
  addListener(callback: TCallback): void;
  removeListener(callback: TCallback): void;
}

interface ChromeRuntimeApi {
  lastError?: ChromeRuntimeLastError;
  onMessage: ChromeEvent<
    (
      message: unknown,
      sender: ChromeMessageSender,
      sendResponse: (response?: unknown) => void,
    ) => boolean | void
  >;
  sendMessage(message: unknown, callback?: (response: unknown) => void): void;
}

interface ChromeStorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

interface ChromeStorageArea {
  get(
    keys: string | string[] | Record<string, unknown> | null,
    callback: (items: Record<string, unknown>) => void,
  ): void;
  set(items: Record<string, unknown>, callback?: () => void): void;
}

interface ChromeStorageApi {
  local: ChromeStorageArea;
  onChanged: ChromeEvent<
    (changes: Record<string, ChromeStorageChange>, areaName: string) => void
  >;
}

interface ChromeTab {
  id?: number;
}

interface ChromeTabsApi {
  query(queryInfo: Record<string, unknown>, callback: (tabs: ChromeTab[]) => void): void;
  captureVisibleTab(
    windowId: number | undefined,
    options: Record<string, unknown>,
    callback: (dataUrl?: string) => void,
  ): void;
  sendMessage(
    tabId: number,
    message: unknown,
    callback?: (response: unknown) => void,
  ): void;
}

interface ChromeExtensionApi {
  runtime: ChromeRuntimeApi;
  storage: ChromeStorageApi;
  tabs: ChromeTabsApi;
}

declare const chrome: ChromeExtensionApi;
