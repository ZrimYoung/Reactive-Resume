// Editable export conventions adapted from Reactive Resume's MIT-licensed DOCX/ODT
// exporters at ac22d622. The shared tree below uses this fork's v4 schema.
import type { Node } from "node-html-parser";
import { HTMLElement, NodeType, parse } from "node-html-parser";

export type Inline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  background?: string;
  href?: string;
};

export type Paragraph = {
  kind: "paragraph";
  runs: Inline[];
  heading?: 1 | 2 | 3;
  align?: "left" | "center" | "right" | "justify";
  pre?: boolean;
};
export type List = {
  kind: "list";
  ordered: boolean;
  start: number;
  items: { blocks: Block[]; value?: number }[];
};
export type Block = Paragraph | List | { kind: "quote"; blocks: Block[] };

export function safeLink(value: string): string | undefined {
  // eslint-disable-next-line no-control-regex -- Control characters are not valid export destinations.
  if (/[\u0000-\u001F\u007F]/.test(value)) return;
  try {
    const url = new URL(value.trim());
    if (["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return url.href;
  } catch {
    // Keep a malformed link's visible text, without an active destination.
  }
}

export function colorHex(value: string): string | undefined {
  const short = /^#([\da-f]{3})$/i.exec(value.trim());
  if (short) return short[1].replace(/./g, (part) => part.repeat(2)).toUpperCase();
  const full = /^#([\da-f]{6})$/i.exec(value.trim());
  if (full) return full[1].toUpperCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(value);
  if (rgb)
    return rgb
      .slice(1, 4)
      .map((part) => Math.min(255, Number(part)).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  const named: Partial<Record<string, string>> = {
    black: "000000",
    white: "FFFFFF",
    red: "FF0000",
    yellow: "FFFF00",
    blue: "0000FF",
    green: "008000",
  };
  return Object.prototype.hasOwnProperty.call(named, value.toLowerCase())
    ? named[value.toLowerCase()]
    : undefined;
}

const ignored = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "IMG",
]);
const blockTags = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "UL",
  "OL",
  "BLOCKQUOTE",
  "PRE",
  "HR",
]);

const styles = (element: HTMLElement): Partial<Record<string, string>> =>
  Object.fromEntries(
    (element.getAttribute("style") ?? "").split(";").flatMap((declaration) => {
      const colon = declaration.indexOf(":");
      return colon < 0
        ? []
        : [[declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim()]];
    }),
  );

function inlineStyle(element: HTMLElement, inherited: Omit<Inline, "text">): Omit<Inline, "text"> {
  const tag = element.tagName;
  const css = styles(element);
  const result = { ...inherited };
  if (
    ["B", "STRONG"].includes(tag) ||
    css["font-weight"] === "bold" ||
    Number(css["font-weight"]) >= 600
  )
    result.bold = true;
  if (["I", "EM"].includes(tag) || css["font-style"] === "italic") result.italic = true;
  if (tag === "U" || css["text-decoration"]?.includes("underline")) result.underline = true;
  if (["S", "STRIKE", "DEL"].includes(tag) || css["text-decoration"]?.includes("line-through"))
    result.strike = true;
  if (tag === "CODE") result.code = true;
  if (tag === "MARK") result.background = "FFFF00";
  const color = colorHex(css.color ?? "");
  const background = colorHex(css["background-color"] ?? css.background ?? "");
  if (color) result.color = color;
  if (background) result.background = background;
  if (tag === "A") result.href = safeLink(element.getAttribute("href") ?? "");
  return result;
}

function inlineNodes(nodes: Node[], inherited: Omit<Inline, "text"> = {}, pre = false): Inline[] {
  return nodes.flatMap((node): Inline[] => {
    if (node.nodeType === NodeType.TEXT_NODE)
      return [{ ...inherited, text: pre ? node.text : node.text.replace(/\s+/g, " ") }];
    if (!(node instanceof HTMLElement) || ignored.has(node.tagName)) return [];
    if (node.tagName === "BR") return [{ ...inherited, text: "\n" }];
    return inlineNodes(node.childNodes, inlineStyle(node, inherited), pre);
  });
}

function paragraph(
  nodes: Node[],
  inherited: Omit<Inline, "text"> = {},
  options: Partial<Paragraph> = {},
): Paragraph | undefined {
  const runs = inlineNodes(nodes, inherited, options.pre);
  if (!options.pre && runs.length > 0) {
    runs[0].text = runs[0].text.trimStart();
    const last = runs.at(-1);
    if (last) last.text = last.text.trimEnd();
  }
  return runs.some((run) => run.text.length > 0)
    ? { kind: "paragraph", runs, ...options }
    : undefined;
}

const positiveInteger = (value: string | undefined, fallback: number) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
};

function parseBlocks(nodes: Node[], inherited: Omit<Inline, "text"> = {}): Block[] {
  const blocks: Block[] = [];
  let pending: Node[] = [];
  const flush = () => {
    const block = paragraph(pending, inherited);
    if (block) blocks.push(block);
    pending = [];
  };
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !blockTags.has(node.tagName)) {
      pending.push(node);
      continue;
    }
    flush();
    const style = inlineStyle(node, inherited);
    if (node.tagName === "UL" || node.tagName === "OL") {
      blocks.push({
        kind: "list",
        ordered: node.tagName === "OL",
        start: positiveInteger(node.getAttribute("start"), 1),
        items: node.childNodes
          .filter(
            (item): item is HTMLElement => item instanceof HTMLElement && item.tagName === "LI",
          )
          .map((item) => ({
            blocks: parseBlocks(item.childNodes, inlineStyle(item, style)),
            ...(item.hasAttribute("value")
              ? { value: positiveInteger(item.getAttribute("value"), 1) }
              : {}),
          })),
      });
    } else if (node.tagName === "BLOCKQUOTE") {
      blocks.push({ kind: "quote", blocks: parseBlocks(node.childNodes, style) });
    } else if (["DIV", "SECTION", "ARTICLE"].includes(node.tagName)) {
      blocks.push(...parseBlocks(node.childNodes, style));
    } else if (node.tagName !== "HR") {
      const align = styles(node)["text-align"] ?? "";
      const block = paragraph(node.childNodes, style, {
        ...(/^H[1-6]$/.test(node.tagName)
          ? { heading: Math.min(3, Number(node.tagName[1])) as 1 | 2 | 3 }
          : {}),
        ...(["left", "center", "right", "justify"].includes(align)
          ? { align: align as Paragraph["align"] }
          : {}),
        ...(node.tagName === "PRE" ? { pre: true } : {}),
      });
      if (block) blocks.push(block);
    }
  }
  flush();
  return blocks;
}

/** Parse editor HTML without loading remote resources or depending on a browser document. */
export const htmlBlocks = (html: string): Block[] => parseBlocks(parse(html).childNodes);

export const textParagraph = (text: string, style: Partial<Paragraph> = {}): Paragraph => ({
  kind: "paragraph",
  runs: [{ text }],
  ...style,
});
