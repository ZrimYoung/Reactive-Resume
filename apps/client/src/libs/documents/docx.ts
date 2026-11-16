import type { ILevelsOptions } from "docx";
/* eslint-disable lingui/no-unlocalized-strings -- OOXML style identifiers and font names are document markup. */
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  TextRun,
  UnderlineType,
} from "docx";

import type { Block, Inline, Paragraph as ParagraphModel } from "./html";
import type { DocumentModel } from "./model";

const mmToTwips = (mm: number) => Math.round((mm * 1440) / 25.4);
const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];

/** An editable, single-column document; explicit resume pages stay page breaks. */
export async function buildDocx(model: DocumentModel): Promise<Uint8Array> {
  const numbering: { reference: string; levels: ILevelsOptions[] }[] = [];
  const children: Paragraph[] = [];
  const font = { ascii: model.font, hAnsi: model.font, eastAsia: model.font, cs: model.font };

  const renderRun = (run: Inline): (TextRun | ExternalHyperlink)[] => {
    const color = run.color ?? (run.href ? model.primary : undefined);
    const runs = run.text.split("\n").map(
      (text, index) =>
        new TextRun({
          text,
          ...(index > 0 ? { break: 1 } : {}),
          bold: run.bold,
          italics: run.italic,
          strike: run.strike,
          ...(run.underline || (run.href && model.underlineLinks)
            ? { underline: { type: UnderlineType.SINGLE } }
            : {}),
          ...(run.code ? { font: "Consolas" } : {}),
          ...(color ? { color } : {}),
          ...(run.background
            ? { shading: { type: ShadingType.CLEAR, fill: run.background, color: "auto" } }
            : {}),
        }),
    );
    return run.href ? [new ExternalHyperlink({ link: run.href, children: runs })] : runs;
  };

  const renderParagraph = (
    block: ParagraphModel,
    quoteDepth: number,
    list?: { reference: string; level: number },
    continuationLevel?: number,
  ) => {
    children.push(
      new Paragraph({
        children: block.runs.flatMap((run) => renderRun(run)),
        ...(block.heading ? { heading: headingLevels[block.heading - 1], keepNext: true } : {}),
        ...(block.align
          ? { alignment: block.align === "justify" ? AlignmentType.JUSTIFIED : block.align }
          : {}),
        ...(list ? { numbering: list } : {}),
        ...(quoteDepth > 0 || continuationLevel !== undefined
          ? {
              indent: {
                left:
                  quoteDepth * 360 +
                  (continuationLevel === undefined ? 0 : (continuationLevel + 1) * 720),
              },
            }
          : {}),
        ...(block.pre ? { style: "Code" } : {}),
      }),
    );
  };

  const createNumbering = (ordered: boolean, start: number) => {
    const reference = `resume-list-${numbering.length}`;
    numbering.push({
      reference,
      levels: Array.from({ length: 9 }, (_, level) => ({
        level,
        format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
        text: ordered ? `%${level + 1}.` : ["•", "◦", "▪"][level % 3],
        start,
        alignment: AlignmentType.START,
        style: { paragraph: { indent: { left: (level + 1) * 720, hanging: 360 } } },
      })),
    });
    return reference;
  };

  const renderBlocks = (blocks: Block[], quoteDepth = 0, level = 0) => {
    for (const block of blocks) {
      if (block.kind === "paragraph") renderParagraph(block, quoteDepth);
      else if (block.kind === "quote") renderBlocks(block.blocks, quoteDepth + 1, level);
      else {
        const safeLevel = Math.min(level, 8);
        let reference = createNumbering(block.ordered, block.start);
        for (const item of block.items) {
          if (item.value !== undefined && block.ordered)
            reference = createNumbering(true, item.value);
          let markerPrinted = false;
          for (const child of item.blocks) {
            if (child.kind === "paragraph") {
              renderParagraph(
                child,
                quoteDepth,
                markerPrinted ? undefined : { reference, level: safeLevel },
                markerPrinted ? safeLevel : undefined,
              );
              markerPrinted = true;
            } else {
              if (!markerPrinted) {
                renderParagraph({ kind: "paragraph", runs: [] }, quoteDepth, {
                  reference,
                  level: safeLevel,
                });
                markerPrinted = true;
              }
              renderBlocks([child], quoteDepth, level + 1);
            }
          }
          if (!markerPrinted)
            renderParagraph({ kind: "paragraph", runs: [] }, quoteDepth, {
              reference,
              level: safeLevel,
            });
        }
      }
    }
  };

  for (const [index, page] of model.pages.entries()) {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    renderBlocks(page);
  }
  const size = Math.round(model.fontSize * 2);
  const document = new Document({
    title: model.title,
    creator: "Reactive Resume",
    numbering: { config: numbering },
    styles: {
      default: {
        document: {
          run: { font, size, color: model.color },
          paragraph: { spacing: { after: 100, line: Math.round(model.lineHeight * 240) } },
        },
        heading1: {
          run: { font, size: Math.round(size * 1.8), bold: true, color: model.primary },
          paragraph: { spacing: { before: 0, after: 160 } },
        },
        heading2: {
          run: { font, size: Math.round(size * 1.25), bold: true, color: model.primary },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        heading3: {
          run: { font, size, bold: true, color: model.color },
          paragraph: { spacing: { before: 100, after: 60 } },
        },
      },
      paragraphStyles: [
        {
          id: "Code",
          name: "Code",
          basedOn: "Normal",
          run: { font: "Consolas" },
          paragraph: { spacing: { line: 240 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: mmToTwips(model.width), height: mmToTwips(model.height) },
            margin: {
              top: mmToTwips(model.margin),
              right: mmToTwips(model.margin),
              bottom: mmToTwips(model.margin),
              left: mmToTwips(model.margin),
            },
          },
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toArrayBuffer(document));
}
