/* eslint-disable unicorn/prefer-spread -- DOM collections need Array.from with this library's DOM-only tsconfig. */

// Adapted from Reactive Resume v6.1.0's pasted-html.ts (MIT).
// Keep semantic emphasis, but let the resume control pasted colours, fonts and sizes.
const PASTED_STYLE =
  /^(color|background|background-color|font|font-family|font-size|line-height|mso-.*)$/i;
const WORD_LIST = /\bmso-list\s*:\s*l\d/i;
const ORDERED_MARKER = /^\s*\(?[\da-z]{1,3}[).]/i;
const BARE_MARKER = /^\s*(?:[o§·•▪◦]|\(?\d{1,3}[).])\s+/;
const IGNORE_SPAN = /\bmso-list\s*:\s*ignore/i;

function isWordListItem(element: Element) {
  return (
    element.tagName === "P" &&
    // A paragraph inside a real list already has its list semantics, including nesting.
    !element.closest("li") &&
    (/\bMsoListParagraph/.test(element.className) ||
      WORD_LIST.test(element.getAttribute("style") ?? ""))
  );
}

function markerNumber(marker: string) {
  const digits = /^\s*\(?(\d{1,3})[).]/.exec(marker)?.[1];
  return digits ? Number(digits) : undefined;
}

type WordMarker = { ordered: boolean; number: number | undefined };

/** Remove only Word's marker, not authored text such as "- configured monitoring" or "Inc. grew". */
function stripWordMarker(item: Element): WordMarker {
  const result: WordMarker = { ordered: false, number: undefined };
  let spanned = false;
  for (const marker of Array.from(item.querySelectorAll("[style]"))) {
    // Word may spell the property MSO-LIST:Ignore; attribute selectors are case sensitive.
    if (!IGNORE_SPAN.test(marker.getAttribute("style") ?? "")) continue;
    const text = marker.textContent ?? "";
    result.ordered ||= ORDERED_MARKER.test(text);
    result.number ??= markerNumber(text);
    marker.remove();
    spanned = true;
  }

  const walker = item.ownerDocument.createTreeWalker(item, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (!text.trim()) {
      node.textContent = "";
      continue;
    }
    const match = spanned ? null : BARE_MARKER.exec(text);
    if (match) {
      result.ordered ||= ORDERED_MARKER.test(match[0]);
      result.number ??= markerNumber(match[0]);
      node.textContent = text.slice(match[0].length);
    }
    break;
  }
  return result;
}

const listInstance = (element: Element) =>
  /\blfo(\d+)/i.exec(element.getAttribute("style") ?? "")?.[1];

function isOrderedItem(item: Element) {
  for (const marker of Array.from(item.querySelectorAll("[style]"))) {
    if (IGNORE_SPAN.test(marker.getAttribute("style") ?? "")) {
      return ORDERED_MARKER.test(marker.textContent ?? "");
    }
  }
  return /^\s*\(?\d{1,3}[).]/.test(item.textContent ?? "");
}

/** Separate Word list instances, or marker kinds when no list instance is available. */
function sameList(first: Element, item: Element) {
  const instance = listInstance(first);
  if (instance !== undefined || listInstance(item) !== undefined) {
    return listInstance(item) === instance;
  }
  return isOrderedItem(item) === isOrderedItem(first);
}

/** Only formatting whitespace and comments may separate adjacent Word list paragraphs. */
function nextListSibling(item: Element): Element | null {
  let sibling = item.nextSibling;
  while (sibling) {
    if (
      sibling.nodeType === Node.COMMENT_NODE ||
      (sibling.nodeType === Node.TEXT_NODE && !sibling.textContent?.trim())
    ) {
      sibling = sibling.nextSibling;
      continue;
    }
    return sibling.nodeType === Node.ELEMENT_NODE ? (sibling as Element) : null;
  }
  return null;
}

const listLevel = (item: Element) =>
  Number(/\blevel(\d+)/i.exec(item.getAttribute("style") ?? "")?.[1] ?? 1);

type WordListFrame = {
  level: number;
  ordered: boolean;
  list: HTMLOListElement | HTMLUListElement;
  lastItem?: HTMLLIElement;
};

function convertWordLists(body: HTMLElement) {
  const document = body.ownerDocument;
  for (const paragraph of Array.from(body.querySelectorAll("p"))) {
    if (!paragraph.isConnected || !isWordListItem(paragraph)) continue;
    const run: Element[] = [];
    for (
      let item: Element | null = paragraph;
      item && isWordListItem(item) && sameList(paragraph, item);
      item = nextListSibling(item)
    ) {
      run.push(item);
    }

    // Word writes nested lists as sibling paragraphs; each level belongs to the preceding parent item.
    const frames: WordListFrame[] = [];
    for (const item of run) {
      const level = listLevel(item);
      const marker = stripWordMarker(item);
      let frame = frames.pop();
      while (frame && frame.level > level) frame = frames.pop();
      if (frame?.level === level && frame.ordered !== marker.ordered) {
        frame = frames.pop();
      }
      if (!frame || frame.level !== level) {
        if (frame) frames.push(frame);
        const list = document.createElement(marker.ordered ? "ol" : "ul");
        if (marker.ordered && marker.number !== undefined && marker.number !== 1) {
          list.setAttribute("start", String(marker.number));
        }
        if (frame?.lastItem) frame.lastItem.append(list);
        else item.before(list);
        frame = { level, ordered: marker.ordered, list };
      }
      const li = document.createElement("li");
      li.append(...Array.from(item.childNodes));
      frame.list.append(li);
      frame.lastItem = li;
      frames.push(frame);
      item.remove();
    }
  }
}

/** Normalize pasted Word/Google Docs HTML without removing emphasis, links or real lists. */
export function cleanPastedHtml(html: string) {
  if (typeof DOMParser === "undefined") return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  const { body } = document;
  convertWordLists(body);
  for (const element of Array.from(body.querySelectorAll<HTMLElement>("[style]"))) {
    const kept = (element.getAttribute("style") ?? "")
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => {
        const property = declaration.split(":")[0]?.trim() ?? "";
        return declaration.includes(":") && !PASTED_STYLE.test(property);
      });
    if (kept.length > 0) element.setAttribute("style", kept.join("; "));
    else element.removeAttribute("style");
  }
  for (const font of Array.from(body.querySelectorAll<HTMLElement>("font"))) {
    font.replaceWith(...Array.from(font.childNodes));
  }
  for (const element of Array.from(body.querySelectorAll("[class]"))) {
    element.removeAttribute("class");
  }
  return body.innerHTML;
}
