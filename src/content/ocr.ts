import { createWorker } from "tesseract.js";

export interface OcrImageMatchResult {
  text: string;
  matchedKeywords: string[];
  durationMs: number;
}

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;
const ocrCache = new Map<string, Promise<OcrImageMatchResult>>();

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

function getImageCacheKey(image: HTMLImageElement): string {
  const src = image.currentSrc || image.src;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  return `${src}::${width}x${height}`;
}

function captureImageData(image: HTMLImageElement): Promise<string | null> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) {
    return Promise.resolve(null);
  }

  const source = image.currentSrc || image.src;
  if (!source) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const tempImage = new Image();
    tempImage.crossOrigin = "anonymous";

    tempImage.onload = () => {
      try {
        const width = tempImage.naturalWidth || tempImage.width;
        const height = tempImage.naturalHeight || tempImage.height;

        if (!width || !height) {
          resolve(null);
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(tempImage, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch {
        resolve(null);
      }
    };

    tempImage.onerror = () => resolve(null);
    tempImage.src = source;
  });
}

async function getWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (workerPromise === null) {
    workerPromise = createWorker("eng");
  }

  return workerPromise;
}

export async function scanImageKeywords(
  image: HTMLImageElement,
  keywords: string[],
): Promise<OcrImageMatchResult> {
  const cacheKey = getImageCacheKey(image);
  const cachedResult = ocrCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const scanPromise = (async () => {
    const imageData = await captureImageData(image);
    if (imageData === null) {
      return {
        text: "",
        matchedKeywords: [],
        durationMs: 0,
      };
    }

    const startedAt = performance.now();
    const worker = await getWorker();
    const result = await worker.recognize(imageData);
    const durationMs = performance.now() - startedAt;
    const text = String(result?.data?.text ?? "").toLowerCase();
    const matchedKeywords = matchKeywordsInText(text, keywords);

    return {
      text,
      matchedKeywords,
      durationMs,
    };
  })();

  ocrCache.set(cacheKey, scanPromise);
  return scanPromise;
}

export function matchKeywordsInText(text: string, keywords: string[]): string[] {
  const normalizedText = text.toLowerCase();
  return keywords.filter((keyword) => normalizedText.includes(normalizeKeyword(keyword)));
}
