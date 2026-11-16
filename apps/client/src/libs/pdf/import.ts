import { t } from "@lingui/macro";
import { createId } from "@paralleldrive/cuid2";
import {
  defaultCustomSection,
  defaultResumeData,
  defaultSection,
  resumeDataSchema,
} from "@reactive-resume/schema";

import type { ExtractedPdf, PdfLine } from ".";

const heading =
  /^(?:summary|profile|objective|about(?: me)?|experience|work experience|employment|education|skills|technical skills|projects|certifications?|awards|languages|interests|volunteering|publications|references|个人简介|个人总结|自我评价|求职意向|工作经历|工作经验|实习经历|教育背景|教育经历|项目经历|项目经验|专业技能|技能|语言能力|荣誉奖项|获奖经历|证书|兴趣爱好|联系方式)[：:]?$/iu;
const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function joinRow(lines: PdfLine[]) {
  let result = "";
  let previous: PdfLine | undefined;
  for (const line of lines) {
    const gap = previous === undefined ? 0 : line.x - previous.x - previous.width;
    const cjk =
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(result) ||
      /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line.text);
    result += (result && gap > 2 && !cjk && !/\s$/u.test(result) ? " " : "") + line.text;
    previous = line;
  }
  return result.trim();
}

function rows(lines: PdfLine[]) {
  const result: PdfLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = result.at(-1);
    if (row && Math.abs(row[0].y - line.y) <= 2) row.push(line);
    else result.push([line]);
  }
  return result.map((row) => joinRow(row.sort((a, b) => a.x - b.x))).filter(Boolean);
}

/** Conservative two-column detection; retain every fragment exactly once. */
export function pdfImportLines(pdf: ExtractedPdf) {
  return pdf.pages.flatMap((page) => {
    const mid = page.width / 2;
    const left = page.lines.filter((line) => line.x + line.width < mid - 5);
    const right = page.lines.filter((line) => line.x > mid + 5);
    const spanning = page.lines.filter((line) => !left.includes(line) && !right.includes(line));
    if (left.length < 3 || right.length < 3 || spanning.length > page.lines.length / 4)
      return rows(page.lines);
    const start = Math.min(...left.map((line) => line.y), ...right.map((line) => line.y));
    return [
      ...rows(spanning.filter((line) => line.y < start)),
      ...rows(left),
      ...rows(right),
      ...rows(spanning.filter((line) => line.y >= start)),
    ];
  });
}

/** Text-only import keeps uncertain content in editable sections instead of guessing dates or employers. */
export function convertPdfImport(pdf: ExtractedPdf) {
  const lines = pdfImportLines(pdf);
  if (!lines.some((line) => /[\p{L}\p{N}]/u.test(line)))
    throw new Error(t`This PDF has no readable text. Scanned documents need OCR before importing.`);
  const data = structuredClone(defaultResumeData);
  const text = lines.join("\n");
  data.basics.email = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/iu.exec(text)?.[0] ?? "";
  data.basics.phone =
    (text.match(/\+?\d[\d ().-]{6,}\d/gu) ?? [])
      .find((candidate) => {
        const digits = candidate.replace(/\D/gu, "");
        return (
          digits.length >= 10 &&
          digits.length <= 15 &&
          !/^(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2}$/u.test(candidate)
        );
      })
      ?.trim() ?? "";
  const first = lines[0] ?? "";
  if (first.length <= 60 && /^[\p{L}\p{M} .·'-]+$/u.test(first) && !heading.test(first))
    data.basics.name = first;
  const groups: { name: string; content: string[] }[] = [];
  let group = { name: t`Imported text`, content: [] as string[] };
  for (const line of lines) {
    if (heading.test(line)) {
      if (group.content.length > 0) groups.push(group);
      group = { name: line.replace(/[：:]$/u, ""), content: [] };
    } else group.content.push(line);
  }
  if (group.content.length > 0) groups.push(group);
  const keys: string[] = [];
  for (const group of groups) {
    const id = createId();
    data.sections.custom[id] = {
      ...defaultSection,
      id,
      name: group.name,
      items: [
        {
          ...structuredClone(defaultCustomSection),
          id: createId(),
          summary: group.content.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
        },
      ],
    };
    keys.push(`custom.${id}`);
  }
  data.metadata.layout = [[keys, []]];
  return {
    data: resumeDataSchema.parse(data),
    text,
    warnings: [
      ...pdf.warnings,
      t`PDF layout, photos and formatting are not imported. Review the text and move entries into the appropriate sections after importing.`,
    ],
  };
}
