import contentCss from "../styles/content.css?raw";

const CONTENT_STYLE_ID = "judol-detector-content-style";

export function injectContentStyles(): void {
  if (document.getElementById(CONTENT_STYLE_ID) !== null) {
    return;
  }

  const style = document.createElement("style");
  style.id = CONTENT_STYLE_ID;
  style.dataset.judolDetectorRoot = "style";
  style.textContent = contentCss;

  const target = document.head ?? document.documentElement;
  target.appendChild(style);
}