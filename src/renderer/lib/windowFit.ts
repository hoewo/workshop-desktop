function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function cssNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readLineHeight(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const lineHeight = cssNumber(style.lineHeight);
  if (lineHeight > 0) {
    return lineHeight;
  }

  const fontSize = cssNumber(style.fontSize);
  return fontSize > 0 ? fontSize * 1.4 : 20;
}

function readVerticalBorderHeight(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return cssNumber(style.borderTopWidth) + cssNumber(style.borderBottomWidth);
}

export function readTextareaHeightForFit(element: HTMLTextAreaElement, maxHeight: number) {
  const previousHeight = element.style.height;
  const previousMinHeight = element.style.minHeight;
  const previousFlex = element.style.flex;

  element.style.height = "auto";
  element.style.minHeight = "0";
  element.style.flex = "0 0 auto";

  try {
    const borderHeight = readVerticalBorderHeight(element);
    const minHeight = Math.ceil(readLineHeight(element) + borderHeight);
    return clampNumber(Math.ceil(element.scrollHeight + borderHeight), minHeight, maxHeight);
  } finally {
    element.style.height = previousHeight;
    element.style.minHeight = previousMinHeight;
    element.style.flex = previousFlex;
  }
}

function readElementHeightForFit(element: HTMLElement): number {
  const currentHeight = element.getBoundingClientRect().height;
  if (element instanceof HTMLTextAreaElement && element.classList.contains("record-editor")) {
    return readTextareaHeightForFit(element, 520);
  }
  if (element instanceof HTMLTextAreaElement && element.classList.contains("task-note-editor")) {
    return readTextareaHeightForFit(element, 420);
  }
  if (
    element.classList.contains("task-detail") ||
    element.classList.contains("task-note-panel") ||
    element.classList.contains("record-preview-panel") ||
    element.classList.contains("project-workspace-scroll") ||
    element.classList.contains("project-workspace-section") ||
    element.classList.contains("project-workspace-section-body")
  ) {
    return readElementChildrenHeight(element);
  }
  return currentHeight;
}

function readElementChildrenHeight(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const paddingBlock = cssNumber(style.paddingTop) + cssNumber(style.paddingBottom);
  const borderBlock = cssNumber(style.borderTopWidth) + cssNumber(style.borderBottomWidth);
  const rowGap = cssNumber(style.rowGap || style.gap);
  const visibleChildren = Array.from(element.children).filter((child): child is HTMLElement => {
    return child instanceof HTMLElement && window.getComputedStyle(child).display !== "none";
  });
  const childrenHeight = visibleChildren.reduce<number>((height, child) => height + readElementHeightForFit(child), 0);
  return borderBlock + paddingBlock + childrenHeight + Math.max(0, visibleChildren.length - 1) * rowGap;
}

export function readShellContentHeight() {
  const shell = document.querySelector("main");
  if (shell instanceof HTMLElement) {
    const shellStyle = window.getComputedStyle(shell);
    const paddingBlock = cssNumber(shellStyle.paddingTop) + cssNumber(shellStyle.paddingBottom);
    const rowGap = cssNumber(shellStyle.rowGap || shellStyle.gap);
    const visibleChildren = Array.from(shell.children).filter((child): child is HTMLElement => {
      const style = window.getComputedStyle(child);
      return child instanceof HTMLElement && style.display !== "none" && style.position !== "fixed";
    });
    const childrenHeight = visibleChildren.reduce((height, child) => {
      const isList = child.classList.contains("sticky-task-list") || child.classList.contains("record-list");
      return height + (isList ? readElementChildrenHeight(child) : readElementHeightForFit(child));
    }, 0);
    return Math.ceil(paddingBlock + childrenHeight + Math.max(0, visibleChildren.length - 1) * rowGap);
  }
  return Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
}
