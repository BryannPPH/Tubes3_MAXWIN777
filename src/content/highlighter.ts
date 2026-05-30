import type { MaskSettings } from "../extension/protocol";
import type {
  HighlightDescriptor,
  ImageHighlightDescriptor,
} from "./scanner";
import {
  registerTooltipTarget,
  resetTooltipTargets,
} from "./tooltip";

const HIGHLIGHT_CLASS = "judol-detector-highlight";
const IMAGE_FRAME_CLASS = "judol-detector-image-frame";
const IMAGE_CLASS = "judol-detector-image";
const IMAGE_COVER_CLASS = "judol-detector-image-cover";
const IMAGE_OCR_FAILED_CLASS = "judol-detector-image-ocr-failed";
const MASKED_CLASS = "judol-detector-masked";
const MASK_BLUR_CLASS = "judol-detector-mask-blur";
const MASK_GIF_CLASS = "judol-detector-mask-gif";
const COVER_IMAGE_VARIABLE = "--judol-detector-cover-image";

interface ActiveImageHighlight {
  wrapper: HTMLSpanElement;
  image: HTMLImageElement;
  shouldMask: boolean;
  coverImageUrl: string;
}

interface ActiveTextHighlight {
  element: HTMLElement;
  coverImageUrl: string;
}

let activeHighlights: ActiveTextHighlight[] = [];
let activeImageHighlights: ActiveImageHighlight[] = [];

function groupHighlightsByNode(
  highlights: HighlightDescriptor[],
): Map<Text, HighlightDescriptor[]> {
  const groups = new Map<Text, HighlightDescriptor[]>();

  for (const highlight of highlights) {
    const existing = groups.get(highlight.node);
    if (existing === undefined) {
      groups.set(highlight.node, [highlight]);
      continue;
    }

    existing.push(highlight);
  }

  return groups;
}

function escapeCssUrl(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function applyCoverImage(
  element: HTMLElement,
  coverImageUrl: string,
): void {
  if (coverImageUrl.trim().length > 0) {
    element.style.setProperty(
      COVER_IMAGE_VARIABLE,
      `url("${escapeCssUrl(coverImageUrl.trim())}")`,
    );
    return;
  }

  element.style.removeProperty(COVER_IMAGE_VARIABLE);
}

function pickRandomCoverImage(maskSettings: MaskSettings): string {
  const pool =
    maskSettings.gifPool.length > 0
      ? maskSettings.gifPool
      : maskSettings.gifUrl.trim().length > 0
        ? [maskSettings.gifUrl.trim()]
        : [];

  if (pool.length === 0) {
    return "";
  }

  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? "";
}

function applyTextMaskState(
  highlight: ActiveTextHighlight,
  maskSettings: MaskSettings,
): void {
  const shouldMask = maskSettings.enabled;
  highlight.element.classList.toggle(MASKED_CLASS, shouldMask);
  highlight.element.classList.toggle(
    MASK_BLUR_CLASS,
    shouldMask && maskSettings.mode === "blur",
  );
  highlight.element.classList.toggle(
    MASK_GIF_CLASS,
    shouldMask && maskSettings.mode === "gif",
  );
  if (maskSettings.mode === "gif") {
    highlight.coverImageUrl = pickRandomCoverImage(maskSettings);
  }
  applyCoverImage(highlight.element, highlight.coverImageUrl);
}

function applyImageMaskState(
  imageHighlight: ActiveImageHighlight,
  maskSettings: MaskSettings,
): void {
  const shouldMask = maskSettings.enabled && imageHighlight.shouldMask;
  imageHighlight.wrapper.classList.toggle(MASKED_CLASS, shouldMask);
  imageHighlight.wrapper.classList.toggle(
    MASK_BLUR_CLASS,
    shouldMask && maskSettings.mode === "blur",
  );
  imageHighlight.wrapper.classList.toggle(
    MASK_GIF_CLASS,
    shouldMask && maskSettings.mode === "gif",
  );
  if (maskSettings.mode === "gif") {
    imageHighlight.coverImageUrl = pickRandomCoverImage(maskSettings);
  }
  applyCoverImage(imageHighlight.wrapper, imageHighlight.coverImageUrl);
}

function createHighlightElement(
  text: string,
  highlight: HighlightDescriptor,
  maskSettings: MaskSettings,
): ActiveTextHighlight {
  const element = document.createElement("mark");
  element.className = HIGHLIGHT_CLASS;
  element.dataset.judolDetector = "highlight";
  element.textContent = text;

  const activeHighlight: ActiveTextHighlight = {
    element,
    coverImageUrl: pickRandomCoverImage(maskSettings),
  };
  applyTextMaskState(activeHighlight, maskSettings);

  registerTooltipTarget(element, {
    keyword: highlight.keyword,
    matchedText: highlight.matchedText,
    algorithmLabel: highlight.algorithmLabel,
    occurrences: highlight.occurrences,
    durationLabel: highlight.durationLabel,
  });

  return activeHighlight;
}

function renderNodeHighlights(
  node: Text,
  highlights: HighlightDescriptor[],
  maskSettings: MaskSettings,
): ActiveTextHighlight[] {
  const parent = node.parentNode;
  if (parent === null) {
    return [];
  }

  const sourceText = node.data;
  const ordered = [...highlights].sort((left, right) => left.start - right.start);
  const fragment = document.createDocumentFragment();
  const created: ActiveTextHighlight[] = [];
  let cursor = 0;

  for (const highlight of ordered) {
    if (highlight.start < cursor || highlight.end > sourceText.length) {
      continue;
    }

    if (highlight.start > cursor) {
      fragment.appendChild(
        document.createTextNode(sourceText.slice(cursor, highlight.start)),
      );
    }

    const highlightedText = sourceText.slice(highlight.start, highlight.end);
    const activeHighlight = createHighlightElement(
      highlightedText,
      highlight,
      maskSettings,
    );
    fragment.appendChild(activeHighlight.element);
    created.push(activeHighlight);
    cursor = highlight.end;
  }

  if (cursor < sourceText.length) {
    fragment.appendChild(document.createTextNode(sourceText.slice(cursor)));
  }

  parent.replaceChild(fragment, node);
  return created;
}

function createImageWrapper(
  highlight: ImageHighlightDescriptor,
  maskSettings: MaskSettings,
): ActiveImageHighlight | null {
  const { element: image } = highlight;
  const parent = image.parentNode;
  if (parent === null) {
    return null;
  }

  const wrapper = document.createElement("span");
  wrapper.className = IMAGE_FRAME_CLASS;
  wrapper.dataset.judolDetector = "image";
  wrapper.dataset.judolDetectorRoot = "image-frame";

  const display = window.getComputedStyle(image).display;
  wrapper.style.display = display === "block" ? "block" : "inline-block";

  if (highlight.variant === "ocr-failed") {
    wrapper.classList.add(IMAGE_OCR_FAILED_CLASS);
  }

  const cover = document.createElement("span");
  cover.className = IMAGE_COVER_CLASS;
  cover.dataset.judolDetectorRoot = "image-cover";
  cover.setAttribute("aria-hidden", "true");

  image.classList.add(IMAGE_CLASS);
  image.dataset.judolDetectorRoot = "image-node";

  parent.replaceChild(wrapper, image);
  wrapper.append(image, cover);

  const activeImageHighlight: ActiveImageHighlight = {
    wrapper,
    image,
    shouldMask: highlight.shouldBlur,
    coverImageUrl: pickRandomCoverImage(maskSettings),
  };
  applyImageMaskState(activeImageHighlight, maskSettings);

  registerTooltipTarget(wrapper, {
    keyword: highlight.keyword,
    matchedText: highlight.matchedText,
    algorithmLabel: highlight.algorithmLabel,
    occurrences: highlight.occurrences,
    durationLabel: highlight.durationLabel,
    noteLabel: highlight.noteLabel,
    noteValue: highlight.noteValue,
  });

  return activeImageHighlight;
}

export function clearHighlights(): void {
  resetTooltipTargets();

  for (const highlight of activeHighlights) {
    const parent = highlight.element.parentNode;
    if (parent === null) {
      continue;
    }

    parent.replaceChild(
      document.createTextNode(highlight.element.textContent ?? ""),
      highlight.element,
    );
    parent.normalize();
  }

  activeHighlights = [];

  for (const imageHighlight of activeImageHighlights) {
    const { wrapper, image } = imageHighlight;
    image.classList.remove(IMAGE_CLASS);
    delete image.dataset.judolDetectorRoot;
    wrapper.style.removeProperty(COVER_IMAGE_VARIABLE);

    if (wrapper.parentNode !== null) {
      wrapper.parentNode.replaceChild(image, wrapper);
    }
  }

  activeImageHighlights = [];
}

export function renderHighlights(
  highlights: HighlightDescriptor[],
  maskSettings: MaskSettings,
): void {
  clearHighlights();
  const groups = groupHighlightsByNode(highlights);
  const created: ActiveTextHighlight[] = [];

  for (const [node, nodeHighlights] of groups.entries()) {
    created.push(...renderNodeHighlights(node, nodeHighlights, maskSettings));
  }

  activeHighlights = created;
}

export function renderImageHighlights(
  highlights: ImageHighlightDescriptor[],
  maskSettings: MaskSettings,
): void {
  const created: ActiveImageHighlight[] = [];

  for (const highlight of highlights) {
    const wrappedImage = createImageWrapper(highlight, maskSettings);
    if (wrappedImage !== null) {
      created.push(wrappedImage);
    }
  }

  activeImageHighlights = created;
}

export function applyMaskState(maskSettings: MaskSettings): void {
  for (const highlight of activeHighlights) {
    applyTextMaskState(highlight, maskSettings);
  }

  for (const imageHighlight of activeImageHighlights) {
    applyImageMaskState(imageHighlight, maskSettings);
  }
}
