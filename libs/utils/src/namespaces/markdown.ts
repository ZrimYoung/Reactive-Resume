/* eslint-disable unicorn/prefer-spread -- DOM collections are not iterable in this library's DOM-only tsconfig. */

import type { ResumeData, URL } from "@reactive-resume/schema";

// Adapted for the v4 schema from Reactive Resume v6.1.1's Markdown export (MIT).
// Only explicitly printed resume fields are visited; private metadata is never serialized.
const escapeText = (text: string) => text.replace(/([*<>[\\\]_`{}])/g, String.raw`\$1`);
const inlineText = (text: string) => escapeText(text.replace(/\s+/g, " ").trim());

function markdownHref(value: string) {
  // eslint-disable-next-line no-control-regex -- Link destinations must not contain raw control characters.
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  try {
    const url = new globalThis.URL(value.trim());
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return null;
    return url.href
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29")
      .replace(/[\s<>]/g, (character) => encodeURIComponent(character));
  } catch {
    return null;
  }
}

function link(label: string, href: string) {
  const url = markdownHref(href);
  const text = inlineText(label || href);
  return url ? `[${text}](${url})` : text;
}

const website = (url: URL) => (url.href ? link(url.label || url.href, url.href) : "");
const heading = (name: string) => (name.trim() ? `## ${inlineText(name)}` : "");
const italicLine = (parts: string[]) => {
  const text = parts
    .filter(Boolean)
    .map((part) => inlineText(part))
    .join(" · ");
  return text ? `_${text}_` : "";
};

function renderHeader(basics: ResumeData["basics"]) {
  const contact = [
    inlineText(basics.email),
    inlineText(basics.phone),
    inlineText(basics.location),
    website(basics.url),
    ...basics.customFields.map((field) =>
      markdownHref(field.value)
        ? link(field.name || field.value, field.value)
        : [field.name, field.value]
            .filter(Boolean)
            .map((part) => inlineText(part))
            .join(": "),
    ),
  ].filter(Boolean);
  return [
    basics.name.trim() ? `# ${inlineText(basics.name)}` : "",
    italicLine([basics.headline]),
    contact.join(" · "),
  ];
}

type Entry = {
  title: string;
  subtitle?: string;
  date?: string;
  details?: string[];
  summary?: string;
  keywords?: string[];
  url?: URL;
};

function renderEntry(entry: Entry) {
  let title = `### ${inlineText(entry.title)}`;
  if (entry.subtitle) title += ` — ${inlineText(entry.subtitle)}`;
  if (entry.date) title += ` (${inlineText(entry.date)})`;
  return [
    title,
    italicLine(entry.details ?? []),
    htmlToMarkdown(entry.summary ?? ""),
    entry.keywords?.map(inlineText).join(", ") ?? "",
    entry.url ? website(entry.url) : "",
  ];
}

function renderItems<T extends { visible: boolean }>(
  section: { name: string; visible: boolean; items: T[] },
  render: (item: T) => string[],
) {
  if (!section.visible) return [];
  const items = section.items.filter((item) => item.visible);
  return items.length > 0 ? [heading(section.name), ...items.flatMap((item) => render(item))] : [];
}

function compactEntry(name: string, description: string, keywords: string[] = [], level = 0) {
  let line = `- **${inlineText(name)}**`;
  if (description) line += ` — ${inlineText(description)}`;
  if (level > 0) line += ` (${level}/5)`;
  if (keywords.length > 0) line += `: ${keywords.map((keyword) => inlineText(keyword)).join(", ")}`;
  return [line];
}

function renderSection(id: string, data: ResumeData): string[] {
  const sections = data.sections;
  switch (id) {
    case "summary": {
      if (!sections.summary.visible) return [];
      const content = htmlToMarkdown(sections.summary.content);
      return content ? [heading(sections.summary.name), content] : [];
    }
    case "experience": {
      return renderItems(sections.experience, (item) =>
        renderEntry({
          title: item.company,
          subtitle: item.position,
          date: item.date,
          details: [item.location],
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "education": {
      return renderItems(sections.education, (item) =>
        renderEntry({
          title: item.institution,
          subtitle: [item.studyType, item.area].filter(Boolean).join(", "),
          date: item.date,
          details: [item.score],
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "projects": {
      return renderItems(sections.projects, (item) =>
        renderEntry({
          title: item.name,
          subtitle: item.description,
          date: item.date,
          summary: item.summary,
          keywords: item.keywords,
          url: item.url,
        }),
      );
    }
    case "volunteer": {
      return renderItems(sections.volunteer, (item) =>
        renderEntry({
          title: item.organization,
          subtitle: item.position,
          date: item.date,
          details: [item.location],
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "awards": {
      return renderItems(sections.awards, (item) =>
        renderEntry({
          title: item.title,
          subtitle: item.awarder,
          date: item.date,
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "certifications": {
      return renderItems(sections.certifications, (item) =>
        renderEntry({
          title: item.name,
          subtitle: item.issuer,
          date: item.date,
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "publications": {
      return renderItems(sections.publications, (item) =>
        renderEntry({
          title: item.name,
          subtitle: item.publisher,
          date: item.date,
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "references": {
      return renderItems(sections.references, (item) =>
        renderEntry({
          title: item.name,
          subtitle: item.description,
          summary: item.summary,
          url: item.url,
        }),
      );
    }
    case "skills": {
      return renderItems(sections.skills, (item) =>
        compactEntry(item.name, item.description, item.keywords, item.level),
      );
    }
    case "languages": {
      return renderItems(sections.languages, (item) =>
        compactEntry(item.name, item.description, [], item.level),
      );
    }
    case "interests": {
      return renderItems(sections.interests, (item) => compactEntry(item.name, "", item.keywords));
    }
    case "profiles": {
      return renderItems(sections.profiles, (item) => [
        `- **${inlineText(item.network)}** — ${item.url.href ? link(item.username, item.url.href) : inlineText(item.username)}`,
      ]);
    }
    default: {
      if (!id.startsWith("custom.")) return [];
      const customId = id.slice("custom.".length);
      if (!Object.prototype.hasOwnProperty.call(sections.custom, customId)) return [];
      return renderItems(sections.custom[customId], (item) =>
        renderEntry({
          title: item.name,
          subtitle: item.description,
          date: item.date,
          details: [item.location],
          summary: item.summary,
          keywords: item.keywords,
          url: item.url,
        }),
      );
    }
  }
}

/** The v4 renderer prints the main and sidebar columns of each page, in layout order. */
export function buildResumeMarkdown(data: ResumeData) {
  const blocks = renderHeader(data.basics);
  for (const page of data.metadata.layout) {
    for (const column of page.slice(0, 2)) {
      for (const id of column) blocks.push(...renderSection(id, data));
    }
  }
  return `${blocks
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

function inlineMarker(content: string, marker: string) {
  const text = content.trim();
  if (!text) return content;
  return `${content.startsWith(" ") ? " " : ""}${marker}${text}${marker}${content.endsWith(" ") ? " " : ""}`;
}

function codeFence(content: string, minimum: number) {
  const runs = content.match(/`+/g) ?? [];
  return "`".repeat(Math.max(minimum, ...runs.map((run) => run.length + 1)));
}

function renderList(element: Element) {
  const ordered = element.tagName === "OL";
  let number = Number.parseInt(element.getAttribute("start") ?? "1", 10);
  if (!Number.isFinite(number) || number < 0) number = 1;
  const items = Array.from(element.children).map((item) => {
    if (item.tagName !== "LI") return renderHtmlNode(item);
    const value = Number.parseInt(item.getAttribute("value") ?? "", 10);
    if (ordered && Number.isFinite(value) && value >= 0) number = value;
    const prefix = ordered ? `${number++}. ` : "- ";
    const content = renderHtmlChildren(item)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return `${prefix}${content.replace(/\n/g, `\n${" ".repeat(prefix.length)}`)}`;
  });
  return `\n${items.join("\n")}\n`;
}

const renderHtmlChildren = (node: Node): string =>
  Array.from(node.childNodes)
    .map((child) => renderHtmlNode(child))
    .join("");

function renderHtmlNode(node: Node): string {
  if (node.nodeType === 3) return escapeText((node.textContent ?? "").replace(/\s+/g, " "));
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  const tag = element.tagName;
  if (
    ["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "IMG"].includes(
      tag,
    )
  )
    return "";
  if (tag === "UL" || tag === "OL") return renderList(element);
  if (tag === "PRE") {
    const content = (element.textContent ?? "").replace(/\r\n?/g, "\n").replace(/\n$/, "");
    const fence = codeFence(content, 3);
    const language =
      /\blanguage-([\w-]+)/.exec(element.firstElementChild?.className ?? "")?.[1] ?? "";
    return `\n\n${fence}${language}\n${content}\n${fence}\n\n`;
  }
  if (tag === "CODE") {
    const content = (element.textContent ?? "").replace(/\r?\n/g, " ");
    const fence = codeFence(content, 1);
    const padding = /^[\s`]|[\s`]$/.test(content) ? " " : "";
    return `${fence}${padding}${content}${padding}${fence}`;
  }
  const content = renderHtmlChildren(element);
  switch (tag) {
    case "A": {
      const href = markdownHref(element.getAttribute("href") ?? "");
      return href
        ? `[${content || inlineText(element.getAttribute("href") ?? "")}](${href})`
        : content;
    }
    case "B":
    case "STRONG": {
      return inlineMarker(content, "**");
    }
    case "I":
    case "EM": {
      return inlineMarker(content, "_");
    }
    case "S":
    case "STRIKE":
    case "DEL": {
      return inlineMarker(content, "~~");
    }
    case "U": {
      return `<u>${content}</u>`;
    }
    case "BR": {
      return "  \n";
    }
    case "HR": {
      return "\n\n---\n\n";
    }
    case "BLOCKQUOTE": {
      return `\n\n${content
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")}\n\n`;
    }
    case "P":
    case "DIV":
    case "SECTION":
    case "ARTICLE": {
      return `${content}\n\n`;
    }
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6": {
      return `${"#".repeat(Number(tag[1]))} ${content.trim()}\n\n`;
    }
    default: {
      return content;
    }
  }
}

/** Convert supported editor HTML using the browser parser, preserving list nesting and numbering. */
export function htmlToMarkdown(html: string) {
  if (!html) return "";
  if (typeof DOMParser === "undefined")
    throw new Error("Markdown export requires a browser document.");
  const document = new DOMParser().parseFromString(html, "text/html");
  return renderHtmlChildren(document.body)
    .replace(/\u00A0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
