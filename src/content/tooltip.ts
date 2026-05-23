export interface TooltipPayload {
  keyword: string;
  matchedText: string;
  algorithmLabel: string;
  occurrences: number;
  durationLabel: string;
}

let tooltipTargets = new WeakMap<HTMLElement, TooltipPayload>();
let tooltipElement: HTMLDivElement | null = null;
let currentTarget: HTMLElement | null = null;

function createTooltipElement(): HTMLDivElement {
  const tooltip = document.createElement("div");
  tooltip.className = "judol-detector-tooltip";
  tooltip.dataset.judolDetectorRoot = "tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.documentElement.appendChild(tooltip);
  return tooltip;
}

function getTooltipElement(): HTMLDivElement {
  if (tooltipElement === null || !tooltipElement.isConnected) {
    tooltipElement = createTooltipElement();
  }

  return tooltipElement;
}

function appendRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement("div");
  row.className = "judol-detector-tooltip-row";

  const labelElement = document.createElement("span");
  labelElement.className = "judol-detector-tooltip-label";
  labelElement.textContent = label;

  const valueElement = document.createElement("strong");
  valueElement.textContent = value;

  row.append(labelElement, valueElement);
  container.appendChild(row);
}

function renderTooltip(payload: TooltipPayload): void {
  const tooltip = getTooltipElement();
  tooltip.replaceChildren();

  appendRow(tooltip, "Keyword", payload.keyword);
  appendRow(tooltip, "Teks", payload.matchedText);
  appendRow(tooltip, "Algoritma", payload.algorithmLabel);
  appendRow(tooltip, "Kemunculan", String(payload.occurrences));
  appendRow(tooltip, "Waktu", payload.durationLabel);
}

function moveTooltip(event: PointerEvent): void {
  const tooltip = getTooltipElement();
  if (tooltip.hidden) {
    return;
  }

  const gap = 12;
  const padding = 8;
  const rect = tooltip.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - padding;
  const maxTop = window.innerHeight - rect.height - padding;
  const left = Math.max(padding, Math.min(event.clientX + gap, maxLeft));
  const top = Math.max(padding, Math.min(event.clientY + gap, maxTop));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function findTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest<HTMLElement>("[data-judol-detector='highlight']");
  if (element === null) {
    return null;
  }

  return element;
}

function showTooltip(target: HTMLElement, event: PointerEvent): void {
  const payload = tooltipTargets.get(target);
  if (payload === undefined) {
    return;
  }

  currentTarget = target;
  renderTooltip(payload);

  const tooltip = getTooltipElement();
  tooltip.hidden = false;
  moveTooltip(event);
}

function hideTooltip(): void {
  currentTarget = null;
  const tooltip = getTooltipElement();
  tooltip.hidden = true;
}

function handlePointerOver(event: PointerEvent): void {
  const target = findTooltipTarget(event.target);
  if (target === null) {
    return;
  }

  showTooltip(target, event);
}

function handlePointerOut(event: PointerEvent): void {
  if (currentTarget === null) {
    return;
  }

  if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) {
    return;
  }

  hideTooltip();
}

function handlePointerMove(event: PointerEvent): void {
  moveTooltip(event);
}

export function initializeTooltip(): void {
  getTooltipElement();
  document.addEventListener("pointerover", handlePointerOver, true);
  document.addEventListener("pointerout", handlePointerOut, true);
  document.addEventListener("pointermove", handlePointerMove, true);
}

export function resetTooltipTargets(): void {
  tooltipTargets = new WeakMap<HTMLElement, TooltipPayload>();
  hideTooltip();
}

export function registerTooltipTarget(
  element: HTMLElement,
  payload: TooltipPayload,
): void {
  tooltipTargets.set(element, payload);
}