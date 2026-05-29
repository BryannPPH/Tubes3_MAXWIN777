import type { HighlightDescriptor } from "./scanner";
import {
  registerTooltipTarget,
  resetTooltipTargets,
} from "./tooltip";

const HIGHLIGHT_CLASS = "judol-detector-highlight";
const BLUR_CLASS = "judol-detector-blurred";

let activeHighlights: HTMLElement[] = [];
let activeImageHighlights: HTMLImageElement[] = [];

export interface ImageHighlightDescriptor {
  element: HTMLImageElement;
  keyword: string;
  matchedText: string;
  algorithmLabel: string;
  durationLabel: string;
  occurrences: number;
}

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

function createHighlightElement(
  text: string,
  highlight: HighlightDescriptor,
  blurEnabled: boolean,
): HTMLElement {
  const element = document.createElement("mark");
  element.className = HIGHLIGHT_CLASS;
  element.dataset.judolDetector = "highlight";
  element.textContent = text;

  if (blurEnabled) {
    element.classList.add(BLUR_CLASS);
  }

  registerTooltipTarget(element, {
    keyword: highlight.keyword,
    matchedText: highlight.matchedText,
    algorithmLabel: highlight.algorithmLabel,
    occurrences: highlight.occurrences,
    durationLabel: highlight.durationLabel,
  });

  return element;
}

function renderNodeHighlights(
  node: Text,
  highlights: HighlightDescriptor[],
  blurEnabled: boolean,
): HTMLElement[] {
  const parent = node.parentNode;
  if (parent === null) {
    return [];
  }

  const sourceText = node.data;
  const ordered = [...highlights].sort((left, right) => left.start - right.start);
  const fragment = document.createDocumentFragment();
  const created: HTMLElement[] = [];
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
    const element = createHighlightElement(highlightedText, highlight, blurEnabled);
    fragment.appendChild(element);
    created.push(element);
    cursor = highlight.end;
  }

  if (cursor < sourceText.length) {
    fragment.appendChild(document.createTextNode(sourceText.slice(cursor)));
  }

  parent.replaceChild(fragment, node);
  return created;
}

export function clearHighlights(): void {
  resetTooltipTargets();

  for (const highlight of activeHighlights) {
    const parent = highlight.parentNode;
    if (parent === null) {
      continue;
    }

    parent.replaceChild(
      document.createTextNode(highlight.textContent ?? ""),
      highlight,
    );
    parent.normalize();
  }

  activeHighlights = [];

  for (const image of activeImageHighlights) {
    image.classList.remove(BLUR_CLASS);
    image.classList.remove("judol-detector-image");
    delete image.dataset.judolDetector;
  }

  activeImageHighlights = [];
}

function renderImageHighlight(
  highlight: ImageHighlightDescriptor,
  blurEnabled: boolean,
): HTMLImageElement {
  const { element } = highlight;
  element.dataset.judolDetector = "image";
  element.classList.add("judol-detector-image");

  if (blurEnabled) {
    element.classList.add(BLUR_CLASS);
  }

  registerTooltipTarget(element, {
    keyword: highlight.keyword,
    matchedText: highlight.matchedText,
    algorithmLabel: highlight.algorithmLabel,
    occurrences: highlight.occurrences,
    durationLabel: highlight.durationLabel,
  });

  return element;
}

export function renderHighlights(
  highlights: HighlightDescriptor[],
  blurEnabled: boolean,
): void {
  clearHighlights();
  const groups = groupHighlightsByNode(highlights);
  const created: HTMLElement[] = [];

  for (const [node, nodeHighlights] of groups.entries()) {
    created.push(...renderNodeHighlights(node, nodeHighlights, blurEnabled));
  }

  activeHighlights = created;
}

export function renderImageHighlights(
  highlights: ImageHighlightDescriptor[],
  blurEnabled: boolean,
): void {
  const created: HTMLImageElement[] = [];

  for (const highlight of highlights) {
    created.push(renderImageHighlight(highlight, blurEnabled));
  }

  activeImageHighlights = created;
}

export function applyBlurState(blurEnabled: boolean): void {
  for (const highlight of activeHighlights) {
    highlight.classList.toggle(BLUR_CLASS, blurEnabled);
  }

  for (const image of activeImageHighlights) {
    image.classList.toggle(BLUR_CLASS, blurEnabled);
  }
}