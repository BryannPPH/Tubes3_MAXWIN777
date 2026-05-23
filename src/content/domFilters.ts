const SKIPPED_TAG_NAMES = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "SVG",
  "CANVAS",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "CODE",
  "PRE",
]);

function hasReadableText(value: string): boolean {
  return /\S/u.test(value);
}

function isDetectorElement(element: Element): boolean {
  return element.closest("[data-judol-detector-root]") !== null;
}

function shouldSkipElement(element: Element): boolean {
  if (SKIPPED_TAG_NAMES.has(element.tagName)) {
    return true;
  }

  if (isDetectorElement(element)) {
    return true;
  }

  if (element.closest("[data-judol-detector='highlight']") !== null) {
    return true;
  }

  if (element.closest("[hidden], [aria-hidden='true']") !== null) {
    return true;
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  return false;
}

function acceptTextNode(node: Node): number {
  if (!(node instanceof Text)) {
    return NodeFilter.FILTER_REJECT;
  }

  if (!hasReadableText(node.data)) {
    return NodeFilter.FILTER_REJECT;
  }

  const parent = node.parentElement;
  if (parent === null || shouldSkipElement(parent)) {
    return NodeFilter.FILTER_REJECT;
  }

  const style = window.getComputedStyle(parent);
  if (style.display === "none" || style.visibility === "hidden") {
    return NodeFilter.FILTER_REJECT;
  }

  return NodeFilter.FILTER_ACCEPT;
}

export function collectTextNodes(root: ParentNode): Text[] {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: acceptTextNode,
  });

  let current = walker.nextNode();
  while (current !== null) {
    if (current instanceof Text) {
      textNodes.push(current);
    }

    current = walker.nextNode();
  }

  return textNodes;
}

export function isDetectorOwnedNode(node: Node): boolean {
  if (node instanceof Element) {
    return isDetectorElement(node);
  }

  const parent = node.parentElement;
  return parent !== null && isDetectorElement(parent);
}