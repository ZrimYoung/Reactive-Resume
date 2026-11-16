import type { ResumeData } from "@reactive-resume/schema";

export type ResumeCheckCode =
  | "missing-name"
  | "missing-email"
  | "invalid-email"
  | "missing-phone"
  | "invalid-url"
  | "missing-date"
  | "custom-date"
  | "reversed-date"
  | "hidden-section"
  | "hidden-items"
  | "unplaced-section"
  | "small-text"
  | "tight-lines"
  | "tight-margins"
  | "custom-css";

export type ResumeCheckFinding = {
  key: string;
  code: ResumeCheckCode;
  severity: "warning" | "info";
  sectionId: string;
  sectionName?: string;
  itemName?: string;
  value?: string | number;
  count?: number;
};

type DatePart = { first: number; last: number };
const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function parseDatePart(value: string): DatePart | undefined {
  const text = value.trim();
  const numeric = /^([12]\d{3})(?:[./年-]\s*(\d{1,2})(?:[./月-]\s*(\d{1,2})日?)?月?)?年?$/.exec(
    text,
  );
  const named =
    /^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|sep|sept|september|oct|october|nov|november|dec|december)\.?\s+([12]\d{3})$/i.exec(
      text,
    );
  if (!numeric && !named) return;
  const year = Number(numeric?.[1] ?? named?.[2]);
  const month = named
    ? monthNames.indexOf(named[1].slice(0, 3).toLowerCase()) + 1
    : Number(numeric?.[2] ?? 0);
  if (month < 0 || month > 12 || ((named || numeric?.[2]) && month === 0)) return;
  const day = Number(numeric?.[3] ?? 0);
  const lastDay = new Date(Date.UTC(year, month || 12, 0)).getUTCDate();
  if (day < 0 || day > lastDay || (numeric?.[3] && !day)) return;
  return {
    first: year * 10_000 + (month || 1) * 100 + (day || 1),
    last: year * 10_000 + (month || 12) * 100 + (day || lastDay),
  };
}

/** Custom wording remains valid authored content; it is never rewritten or treated as an ATS verdict. */
export function inspectResumeDate(value: string): "empty" | "readable" | "reversed" | "custom" {
  const text = value.trim();
  if (!text) return "empty";
  if (parseDatePart(text)) return "readable";
  const ongoing = /(?:present|current|now|ongoing|至今|迄今|现在|現在|目前)$/i.exec(text);
  if (ongoing) {
    const start = text
      .slice(0, ongoing.index)
      .replace(/(?:[~–—到至～-]|\bto)\s*$/i, "")
      .trim();
    return !start || parseDatePart(start) ? "readable" : "custom";
  }
  for (const separator of text.matchAll(/[~–—到至～-]|\bto\b/gi)) {
    const start = parseDatePart(text.slice(0, separator.index));
    const end = parseDatePart(text.slice(separator.index + separator[0].length));
    if (start && end) return end.last < start.first ? "reversed" : "readable";
  }
  return "custom";
}

const printableText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
const isUrl = (value: string) => {
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Mechanical checks on this version's content/settings, without scores, AI or English-only language heuristics. */
export function checkResume(data: ResumeData): ResumeCheckFinding[] {
  const findings: ResumeCheckFinding[] = [];
  const add = (
    code: ResumeCheckCode,
    sectionId: string,
    details: Partial<ResumeCheckFinding> = {},
  ) => {
    findings.push({
      key: `${code}:${sectionId}:${findings.length}`,
      code,
      sectionId,
      severity: "warning",
      ...details,
    });
  };
  if (!data.basics.name.trim()) add("missing-name", "basics");
  if (!data.basics.email.trim()) add("missing-email", "basics");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.basics.email.trim()))
    add("invalid-email", "basics", { value: data.basics.email });
  if (!data.basics.phone.trim()) add("missing-phone", "basics", { severity: "info" });
  if (data.basics.url.href.trim() && !isUrl(data.basics.url.href.trim()))
    add("invalid-url", "basics", { value: data.basics.url.href });

  const placed = new Set(data.metadata.layout.flatMap((page) => page.flat()));
  type CheckedItem = {
    id: string;
    visible: boolean;
    date?: string;
    name?: string;
    title?: string;
    company?: string;
    institution?: string;
    url?: { href: string };
  };
  type CheckedSection = { name: string; visible: boolean; items?: CheckedItem[] };
  const sections: { id: string; section: CheckedSection }[] = Object.entries(data.sections)
    .filter(([id]) => id !== "custom")
    .map(([id, section]) => ({ id, section: section as CheckedSection }));
  sections.push(
    ...Object.values(data.sections.custom).map((section) => ({
      id: `custom.${section.id}`,
      section,
    })),
  );
  for (const { id, section } of sections) {
    if (!section.items) continue;
    const details = { sectionName: section.name };
    const items = section.items;
    if (!section.visible && items.length > 0) {
      add("hidden-section", id, { ...details, severity: "info", count: items.length });
      continue;
    }
    if (!section.visible) continue;
    const visible = items.filter((item) => item.visible);
    if (visible.length > 0 && !placed.has(id)) add("unplaced-section", id, details);
    const hidden = items.length - visible.length;
    if (hidden > 0) add("hidden-items", id, { ...details, severity: "info", count: hidden });
    for (const item of visible) {
      const itemName = item.company ?? item.institution ?? item.name ?? item.title;
      const itemDetails = { ...details, itemName };
      if (item.url?.href.trim() && !isUrl(item.url.href.trim()))
        add("invalid-url", id, { ...itemDetails, value: item.url.href });
      if (typeof item.date !== "string") continue;
      const date = inspectResumeDate(item.date);
      if (date === "empty" && ["experience", "education"].includes(id))
        add("missing-date", id, itemDetails);
      if (date === "reversed") add("reversed-date", id, { ...itemDetails, value: item.date });
      if (date === "custom")
        add("custom-date", id, { ...itemDetails, value: item.date, severity: "info" });
    }
  }
  const summary = data.sections.summary;
  if (!summary.visible && printableText(summary.content))
    add("hidden-section", "summary", { sectionName: summary.name, severity: "info" });
  if (summary.visible && printableText(summary.content) && !placed.has("summary"))
    add("unplaced-section", "summary", { sectionName: summary.name });
  // v4's rendering settings are CSS pixels. The thresholds here are 9 pt and 8 pt converted at 96 dpi.
  if (data.metadata.typography.font.size < 12)
    add("small-text", "typography", { value: data.metadata.typography.font.size });
  if (data.metadata.typography.lineHeight < 1.15)
    add("tight-lines", "typography", { value: data.metadata.typography.lineHeight });
  if (data.metadata.page.margin < (8 * 96) / 72)
    add("tight-margins", "page", { value: data.metadata.page.margin });
  if (data.metadata.css.visible && data.metadata.css.value.trim())
    add("custom-css", "css", { severity: "info" });
  return findings;
}

export type ResumePageMetrics = {
  plannedPages: number;
  estimatedPages: number;
  pages: {
    pageNumber: number;
    widthPx: number;
    heightPx: number;
    contentHeightPx: number;
    overflowPx: number;
    overflowLines: number;
    horizontalOverflowPx: number;
  }[];
};

export async function resumeMeasurementKey(data: ResumeData): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseResumePageMetrics(value: unknown): ResumePageMetrics | undefined {
  if (!value || typeof value !== "object") return;
  const metrics = value as ResumePageMetrics;
  if (
    !Array.isArray(metrics.pages) ||
    metrics.pages.length === 0 ||
    metrics.pages.length > 100 ||
    metrics.plannedPages !== metrics.pages.length ||
    !Number.isInteger(metrics.estimatedPages) ||
    metrics.estimatedPages < metrics.plannedPages ||
    metrics.estimatedPages > 1000
  )
    return;
  for (const [index, page] of metrics.pages.entries()) {
    // Runtime payloads arrive across a window boundary and can contain null despite the asserted shape.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!page || typeof page !== "object") return;
    if (
      page.pageNumber !== index + 1 ||
      ![
        page.widthPx,
        page.heightPx,
        page.contentHeightPx,
        page.overflowPx,
        page.overflowLines,
        page.horizontalOverflowPx,
      ].every((number) => Number.isFinite(number) && number >= 0 && number < 10_000_000) ||
      page.widthPx === 0 ||
      page.heightPx === 0
    )
      return;
  }
  return metrics;
}

export type CheckedPdfExtraction = {
  pages: {
    pageNumber: number;
    width: number;
    height: number;
    lines: { text: string; x: number; y: number; width: number; height: number }[];
  }[];
  text: string;
  pageCount: number;
  warnings: string[];
};
export type PdfTextFinding = {
  code: "no-text" | "empty-page" | "replacement-characters" | "private-use-characters";
  pageNumber?: number;
  count?: number;
};

export function checkExtractedPdf(extraction: CheckedPdfExtraction): PdfTextFinding[] {
  const findings: PdfTextFinding[] = [];
  if (!extraction.text.trim()) return [{ code: "no-text" }];
  const replacements = [
    // eslint-disable-next-line no-control-regex -- Detect invalid PDF text-layer control characters, preserving whitespace.
    ...extraction.text.matchAll(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g),
  ].length;
  if (replacements > 0) findings.push({ code: "replacement-characters", count: replacements });
  const privateUse = [
    ...extraction.text.matchAll(/[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu),
  ].length;
  if (privateUse > 0) findings.push({ code: "private-use-characters", count: privateUse });
  for (const page of extraction.pages)
    if (!page.lines.some((line) => line.text.trim()))
      findings.push({ code: "empty-page", pageNumber: page.pageNumber });
  return findings;
}
