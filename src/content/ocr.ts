import { createWorker } from "tesseract.js";
import { detectJudolContent } from "../detection";
import type { DetectionReport, KeywordEntry } from "../detection/types";

export interface OcrScanOptions {
  preferScreenshotCapture?: boolean;
  screenshotDataUrl?: string | null;
  screenshotFailureReason?: string | null;
}

export interface OcrImageMatchResult {
  text: string;
  report: DetectionReport | null;
  durationMs: number;
  failureReason: string | null;
  captureMethod: "direct" | "visible-tab" | "none";
}

interface ImageCaptureResult {
  imageData: string | null;
  failureReason: string | null;
  captureMethod: OcrImageMatchResult["captureMethod"];
}

type OcrVariantKind = "original" | "contrast" | "threshold";

interface OcrVariant {
  kind: OcrVariantKind;
  imageData: string;
}

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;
const ocrCache = new Map<string, Promise<OcrImageMatchResult>>();

function getImageCacheKey(
  image: HTMLImageElement,
  options?: OcrScanOptions,
): string {
  const src = image.currentSrc || image.src;
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const strategy = options?.preferScreenshotCapture === true ? "visible-tab" : "direct";
  return `${strategy}::${src}::${width}x${height}`;
}

function resolveCaptureFailureReason(error: unknown): string {
  if (error instanceof DOMException && error.name === "SecurityError") {
    return "CORS/capture failed";
  }

  if (error instanceof Error && /taint|cross-origin|security/i.test(error.message)) {
    return "CORS/capture failed";
  }

  return "Capture failed";
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image load failed"));
    image.src = dataUrl;
  });
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function computeScaleFactor(width: number, height: number): number {
  const longestSide = Math.max(width, height);

  if (longestSide < 500) {
    return 3;
  }

  if (longestSide < 900) {
    return 2;
  }

  return 1.5;
}

function getContrastFactor(amount: number): number {
  return (259 * (amount + 255)) / (255 * (259 - amount));
}

function drawScaledVariant(
  image: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement {
  const scaleFactor = computeScaleFactor(width, height);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvas context unavailable");
  }

  canvas.width = Math.max(1, Math.round(width * scaleFactor));
  canvas.height = Math.max(1, Math.round(height * scaleFactor));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function applyContrastGrayscale(
  source: HTMLCanvasElement,
  contrastAmount: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvas context unavailable");
  }

  canvas.width = source.width;
  canvas.height = source.height;
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const factor = getContrastFactor(contrastAmount);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    const contrasted = clampByte(factor * (luminance - 128) + 128);

    imageData.data[index] = contrasted;
    imageData.data[index + 1] = contrasted;
    imageData.data[index + 2] = contrasted;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function applyThreshold(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (context === null) {
    throw new Error("Canvas context unavailable");
  }

  canvas.width = source.width;
  canvas.height = source.height;
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let luminanceTotal = 0;
  let pixelCount = 0;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    luminanceTotal += luminance;
    pixelCount += 1;
  }

  const averageLuminance = pixelCount === 0 ? 160 : luminanceTotal / pixelCount;
  const threshold = Math.max(110, Math.min(210, Math.round(averageLuminance)));

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
    const value = luminance >= threshold ? 255 : 0;

    imageData.data[index] = value;
    imageData.data[index + 1] = value;
    imageData.data[index + 2] = value;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function buildOcrVariants(imageData: string): Promise<OcrVariant[]> {
  const image = await loadImageFromDataUrl(imageData);
  const scaledBase = drawScaledVariant(
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
  );
  const contrastVariant = applyContrastGrayscale(scaledBase, 85);
  const thresholdVariant = applyThreshold(contrastVariant);

  return [
    {
      kind: "original",
      imageData: scaledBase.toDataURL("image/png"),
    },
    {
      kind: "contrast",
      imageData: contrastVariant.toDataURL("image/png"),
    },
    {
      kind: "threshold",
      imageData: thresholdVariant.toDataURL("image/png"),
    },
  ];
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r/gu, "\n")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/\n+/gu, "\n")
    .trim()
    .toLowerCase();
}

function buildCombinedFailureReason(
  screenshotFailureReason: string | null,
  directFailureReason: string | null,
): string {
  if (screenshotFailureReason !== null && directFailureReason !== null) {
    return `Visible tab capture failed: ${screenshotFailureReason}; direct capture failed: ${directFailureReason}`;
  }

  if (screenshotFailureReason !== null) {
    return screenshotFailureReason;
  }

  if (directFailureReason !== null) {
    return directFailureReason;
  }

  return "Capture failed";
}

async function captureFromVisibleTab(
  image: HTMLImageElement,
  screenshotDataUrl: string,
): Promise<ImageCaptureResult> {
  try {
    const screenshot = await loadImageFromDataUrl(screenshotDataUrl);
    const rect = image.getBoundingClientRect();
    const viewportLeft = Math.max(0, rect.left);
    const viewportTop = Math.max(0, rect.top);
    const viewportRight = Math.min(window.innerWidth, rect.right);
    const viewportBottom = Math.min(window.innerHeight, rect.bottom);
    const visibleWidth = viewportRight - viewportLeft;
    const visibleHeight = viewportBottom - viewportTop;

    if (visibleWidth < 2 || visibleHeight < 2) {
      return {
        imageData: null,
        failureReason: "Preview image is outside viewport",
        captureMethod: "none",
      };
    }

    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (context === null) {
      return {
        imageData: null,
        failureReason: "Canvas context unavailable",
        captureMethod: "none",
      };
    }

    canvas.width = Math.max(1, Math.round(visibleWidth * dpr));
    canvas.height = Math.max(1, Math.round(visibleHeight * dpr));
    context.drawImage(
      screenshot,
      viewportLeft * dpr,
      viewportTop * dpr,
      visibleWidth * dpr,
      visibleHeight * dpr,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return {
      imageData: canvas.toDataURL("image/png"),
      failureReason: null,
      captureMethod: "visible-tab",
    };
  } catch (error) {
    return {
      imageData: null,
      failureReason: resolveCaptureFailureReason(error),
      captureMethod: "none",
    };
  }
}

function captureFromImageSource(image: HTMLImageElement): Promise<ImageCaptureResult> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (context === null) {
    return Promise.resolve({
      imageData: null,
      failureReason: "Canvas context unavailable",
      captureMethod: "none",
    });
  }

  const source = image.currentSrc || image.src;
  if (!source) {
    return Promise.resolve({
      imageData: null,
      failureReason: "Image source unavailable",
      captureMethod: "none",
    });
  }

  return new Promise((resolve) => {
    const tempImage = new Image();
    tempImage.crossOrigin = "anonymous";

    tempImage.onload = () => {
      try {
        const width = tempImage.naturalWidth || tempImage.width;
        const height = tempImage.naturalHeight || tempImage.height;

        if (!width || !height) {
          resolve({
            imageData: null,
            failureReason: "Image has no dimensions",
            captureMethod: "none",
          });
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.drawImage(tempImage, 0, 0);
        resolve({
          imageData: canvas.toDataURL("image/png"),
          failureReason: null,
          captureMethod: "direct",
        });
      } catch (error) {
        resolve({
          imageData: null,
          failureReason: resolveCaptureFailureReason(error),
          captureMethod: "none",
        });
      }
    };

    tempImage.onerror = () =>
      resolve({
        imageData: null,
        failureReason: "Image load failed",
        captureMethod: "none",
      });
    tempImage.src = source;
  });
}

async function captureImageData(
  image: HTMLImageElement,
  options?: OcrScanOptions,
): Promise<ImageCaptureResult> {
  const prefersScreenshot = options?.preferScreenshotCapture === true;
  let screenshotFailureReason = options?.screenshotFailureReason ?? null;

  if (prefersScreenshot && options?.screenshotDataUrl !== null && options?.screenshotDataUrl !== undefined) {
    const screenshotCapture = await captureFromVisibleTab(image, options.screenshotDataUrl);
    if (screenshotCapture.imageData !== null) {
      return screenshotCapture;
    }

    screenshotFailureReason = screenshotCapture.failureReason;
  }

  const directCapture = await captureFromImageSource(image);
  if (directCapture.imageData !== null) {
    return directCapture;
  }

  if (prefersScreenshot) {
    return {
      imageData: null,
      failureReason: buildCombinedFailureReason(
        screenshotFailureReason,
        directCapture.failureReason,
      ),
      captureMethod: "none",
    };
  }

  return directCapture;
}

async function getWorker(): Promise<Awaited<ReturnType<typeof createWorker>>> {
  if (workerPromise === null) {
    workerPromise = createWorker("eng");
  }

  return workerPromise;
}

export async function scanImageKeywords(
  image: HTMLImageElement,
  keywords: KeywordEntry[],
  options?: OcrScanOptions,
): Promise<OcrImageMatchResult> {
  const cacheKey = getImageCacheKey(image, options);
  const cachedResult = ocrCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const scanPromise: Promise<OcrImageMatchResult> = (async (): Promise<OcrImageMatchResult> => {
    const startedAt = performance.now();
    const captureResult = await captureImageData(image, options);

    if (captureResult.imageData === null) {
      return {
        text: "",
        report: null,
        durationMs: performance.now() - startedAt,
        failureReason: captureResult.failureReason ?? "Capture failed",
        captureMethod: "none",
      };
    }

    const worker = await getWorker();
    let lastRecognitionFailure: string | null = null;
    const uniqueTexts = new Set<string>();

    try {
      const variants = await buildOcrVariants(captureResult.imageData);

      for (const variant of variants) {
        try {
          const result = await worker.recognize(variant.imageData);
          const text = normalizeOcrText(String(result?.data?.text ?? ""));

          if (text.length > 0) {
            uniqueTexts.add(text);
          }
        } catch (error) {
          lastRecognitionFailure =
            error instanceof Error ? error.message : `OCR ${variant.kind} failed`;
        }
      }
    } catch (error) {
      lastRecognitionFailure =
        error instanceof Error ? error.message : "OCR preprocessing failed";
    }

    const combinedText = Array.from(uniqueTexts.values()).join("\n");
    const durationMs = performance.now() - startedAt;

    if (combinedText.length === 0) {
      return {
        text: "",
        report: null,
        durationMs,
        failureReason: lastRecognitionFailure ?? "OCR produced no text",
        captureMethod: captureResult.captureMethod,
      };
    }

    const report = detectJudolContent(combinedText, keywords);
    return {
      text: combinedText,
      report,
      durationMs,
      failureReason: report.matches.length > 0 ? null : lastRecognitionFailure,
      captureMethod: captureResult.captureMethod,
    };
  })();

  ocrCache.set(cacheKey, scanPromise);
  return scanPromise;
}
