import { GIF_COLLECTIONS } from "../extension/gifCollections";
import type {
  BackgroundRequest,
  CaptureVisibleTabMessage,
  CaptureVisibleTabResponse,
  ResolveGifCollectionMessage,
  ResolveGifCollectionResponse,
} from "../extension/protocol";

const MESSAGE_CAPTURE_VISIBLE_TAB = "JUDOL_CAPTURE_VISIBLE_TAB";
const MESSAGE_RESOLVE_GIF_COLLECTION = "JUDOL_RESOLVE_GIF_COLLECTION";
const GIF_URL_PATTERN = /https?:\/\/[^"'\\\s<>]+?\.gif(?:\?[^"'\\\s<>]*)?/giu;
const META_TAG_PATTERN = /<meta\s+[^>]*>/giu;
const ATTRIBUTE_PATTERN = /([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/gu;

const collectionCache = new Map<string, Promise<ResolveGifCollectionResponse>>();

function isCaptureVisibleTabMessage(
  message: BackgroundRequest | unknown,
): message is CaptureVisibleTabMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown };
  return candidate.type === MESSAGE_CAPTURE_VISIBLE_TAB;
}

function isResolveGifCollectionMessage(
  message: BackgroundRequest | unknown,
): message is ResolveGifCollectionMessage {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as { type?: unknown };
  return candidate.type === MESSAGE_RESOLVE_GIF_COLLECTION;
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&#x2F;/giu, "/")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'");
}

function extractGifCandidates(html: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(GIF_URL_PATTERN)) {
    const candidate = decodeHtmlEntities(match[0]);
    if (seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    urls.push(candidate);
  }

  if (urls.length > 0) {
    return urls;
  }

  for (const metaTag of html.matchAll(META_TAG_PATTERN)) {
    const attributes = new Map<string, string>();

    for (const attribute of metaTag[0].matchAll(ATTRIBUTE_PATTERN)) {
      attributes.set(attribute[1].toLowerCase(), decodeHtmlEntities(attribute[2]));
    }

    const property = attributes.get("property") ?? attributes.get("name");
    const content = attributes.get("content");

    if (content === undefined || property === undefined) {
      continue;
    }

    if (
      (property === "og:image" || property === "twitter:image") &&
      !seen.has(content)
    ) {
      seen.add(content);
      urls.push(content);
    }
  }

  return urls;
}

async function resolveTenorGifUrl(pageUrl: string): Promise<string | null> {
  const response = await fetch(pageUrl, {
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Fetch gagal (${response.status})`);
  }

  const html = await response.text();
  const candidates = extractGifCandidates(html);

  for (const candidate of candidates) {
    if (/\.gif(?:\?|$)/iu.test(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? null;
}

async function resolveGifCollection(
  message: ResolveGifCollectionMessage,
): Promise<ResolveGifCollectionResponse> {
  const pages = GIF_COLLECTIONS[message.preset];

  try {
    const results = await Promise.all(
      pages.map(async (pageUrl) => {
        try {
          return await resolveTenorGifUrl(pageUrl);
        } catch {
          return null;
        }
      }),
    );

    const gifUrls = results.filter((url): url is string => url !== null);
    const uniqueGifUrls = Array.from(new Set(gifUrls));

    if (uniqueGifUrls.length === 0) {
      return {
        ok: false,
        error: "Tidak ada GIF valid yang berhasil di-resolve dari koleksi ini.",
      };
    }

    return {
      ok: true,
      gifUrls: uniqueGifUrls,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Resolve GIF collection gagal.",
    };
  }
}

function resolveGifCollectionCached(
  message: ResolveGifCollectionMessage,
): Promise<ResolveGifCollectionResponse> {
  const cacheKey = message.preset;
  const cached = collectionCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pending = resolveGifCollection(message);
  collectionCache.set(cacheKey, pending);
  return pending;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isCaptureVisibleTabMessage(message)) {
    captureVisibleTab(sendResponse as (response: CaptureVisibleTabResponse) => void);
    return true;
  }

  if (isResolveGifCollectionMessage(message)) {
    void resolveGifCollectionCached(message).then(
      sendResponse as (response: ResolveGifCollectionResponse) => void,
    );
    return true;
  }

  return false;
});
