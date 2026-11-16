/* eslint-disable lingui/no-unlocalized-strings -- ODF element names, styles and namespaces are document markup. */
import { strToU8, zipSync } from "fflate";

import type { Block, Inline, Paragraph } from "./html";
import type { DocumentModel } from "./model";

export const ODT_MIME = "application/vnd.oasis.opendocument.text";

const xml = (value: string) =>
  value
    // eslint-disable-next-line no-control-regex -- ODF XML cannot contain these control characters.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const contentText = (value: string) =>
  xml(value)
    .replace(/ {2,}/g, (spaces) => `<text:s text:c="${spaces.length}"/>`)
    .replace(/\t/g, "<text:tab/>")
    .replace(/\r?\n/g, "<text:line-break/>");
const cm = (mm: number) => `${Math.round((mm * 1000) / 10) / 1000}cm`;
const namespaces =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"';
const declaration = '<?xml version="1.0" encoding="UTF-8"?>';

/** Generate a self-contained ODF archive, with the required uncompressed first mimetype entry. */
export function buildOdt(model: DocumentModel): Uint8Array {
  const automatic: string[] = [];
  const styleNames = new Map<string, string>();
  const textStyle = (properties: string) => {
    const previous = styleNames.get(properties);
    if (previous) return previous;
    const name = `T${styleNames.size}`;
    styleNames.set(properties, name);
    automatic.push(
      `<style:style style:name="${name}" style:family="text"><style:text-properties ${properties}/></style:style>`,
    );
    return name;
  };
  const renderRun = (run: Inline): string => {
    const properties = [
      run.bold
        ? 'fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"'
        : "",
      run.italic
        ? 'fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"'
        : "",
      run.strike ? 'style:text-line-through-style="solid"' : "",
      run.underline || (run.href && model.underlineLinks)
        ? 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"'
        : "",
      run.code ? 'fo:font-family="monospace"' : "",
      run.color || run.href ? `fo:color="#${run.color ?? model.primary}"` : "",
      run.background ? `fo:background-color="#${run.background}"` : "",
    ]
      .filter(Boolean)
      .join(" ");
    let result = contentText(run.text);
    if (properties)
      result = `<text:span text:style-name="${textStyle(properties)}">${result}</text:span>`;
    return run.href
      ? `<text:a xlink:type="simple" xlink:href="${xml(run.href)}">${result}</text:a>`
      : result;
  };
  let paragraphCount = 0;
  const renderParagraph = (paragraph: Paragraph, quoteDepth: number, pageBreak: boolean) => {
    const firstParagraph = paragraphCount === 0;
    const name = `P${paragraphCount++}`;
    let parent = paragraph.pre ? "Code" : "Standard";
    if (paragraph.heading) parent = `Heading${paragraph.heading}`;
    const properties = [
      paragraph.align ? `fo:text-align="${paragraph.align}"` : "",
      quoteDepth > 0 ? `fo:margin-left="${quoteDepth * 0.6}cm"` : "",
      pageBreak ? 'fo:break-before="page"' : "",
    ]
      .filter(Boolean)
      .join(" ");
    automatic.push(
      `<style:style style:name="${name}" style:family="paragraph" style:parent-style-name="${parent}"${firstParagraph ? ' style:master-page-name="ResumePage"' : ""}>${properties ? `<style:paragraph-properties ${properties}/>` : ""}</style:style>`,
    );
    const tag = paragraph.heading ? "text:h" : "text:p";
    return `<${tag} text:style-name="${name}"${paragraph.heading ? ` text:outline-level="${paragraph.heading}"` : ""}>${paragraph.runs.map((run) => renderRun(run)).join("")}</${tag}>`;
  };
  const renderBlocks = (blocks: Block[], quoteDepth = 0): string =>
    blocks
      .map((block): string => {
        if (block.kind === "paragraph") return renderParagraph(block, quoteDepth, false);
        if (block.kind === "quote") return renderBlocks(block.blocks, quoteDepth + 1);
        return `<text:list text:style-name="${block.ordered ? "Numbered" : "Bullets"}">${block.items.map((item, index) => `<text:list-item${block.ordered && (index === 0 || item.value !== undefined) ? ` text:start-value="${item.value ?? block.start}"` : ""}>${item.blocks.length > 0 ? renderBlocks(item.blocks, quoteDepth) : "<text:p/>"}</text:list-item>`).join("")}</text:list>`;
      })
      .join("");
  const body = model.pages
    .map(
      (page, index) =>
        `${index > 0 ? renderParagraph({ kind: "paragraph", runs: [] }, 0, true) : ""}${renderBlocks(page)}`,
    )
    .join("");
  const lists = [false, true]
    .map(
      (ordered) =>
        `<text:list-style style:name="${ordered ? "Numbered" : "Bullets"}">${Array.from(
          { length: 10 },
          (_, level) => {
            const tag = ordered ? "text:list-level-style-number" : "text:list-level-style-bullet";
            return `<${tag} text:level="${level + 1}"${ordered ? ' style:num-format="1" style:num-suffix="."' : ` text:bullet-char="${["•", "◦", "▪"][level % 3]}"`}><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(level + 1) * 0.6}cm" fo:text-indent="-0.3cm" fo:margin-left="${(level + 1) * 0.6}cm"/></style:list-level-properties></${tag}>`;
          },
        ).join("")}</text:list-style>`,
    )
    .join("");
  const content = `${declaration}<office:document-content ${namespaces} office:version="1.3"><office:automatic-styles>${automatic.join("")}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
  const fontSize = model.fontSize;
  // A master-page reference on Standard is inherited by every paragraph. Word
  // interprets those repeated references as page changes; select it only on P0.
  const styles = [
    `${declaration}<office:document-styles ${namespaces} office:version="1.3">`,
    `<office:font-face-decls><style:font-face style:name="ResumeFont" svg:font-family="${xml(model.font)}"/></office:font-face-decls>`,
    `<office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="${model.lineHeight * 100}%" fo:margin-bottom="0.15cm"/><style:text-properties style:font-name="ResumeFont" style:font-name-asian="ResumeFont" style:font-name-complex="ResumeFont" fo:font-size="${fontSize}pt" style:font-size-asian="${fontSize}pt" style:font-size-complex="${fontSize}pt" fo:color="#${model.color}"/></style:default-style>`,
    '<style:style style:name="Standard" style:family="paragraph"/>',
    ...[1, 2, 3].map(
      (heading) =>
        `<style:style style:name="Heading${heading}" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:keep-with-next="always" fo:margin-top="${heading === 1 ? 0 : 0.3}cm"/><style:text-properties fo:font-size="${fontSize * [1.8, 1.25, 1][heading - 1]}pt" fo:font-weight="bold" fo:color="#${heading < 3 ? model.primary : model.color}"/></style:style>`,
    ),
    '<style:style style:name="Code" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:line-height="100%"/><style:text-properties fo:font-family="monospace"/></style:style>',
    `${lists}</office:styles>`,
    `<office:automatic-styles><style:page-layout style:name="ResumeLayout"><style:page-layout-properties fo:page-width="${cm(model.width)}" fo:page-height="${cm(model.height)}" fo:margin="${cm(model.margin)}" style:print-orientation="${model.width > model.height ? "landscape" : "portrait"}"/></style:page-layout></office:automatic-styles>`,
    '<office:master-styles><style:master-page style:name="ResumePage" style:page-layout-name="ResumeLayout"/></office:master-styles></office:document-styles>',
  ].join("");
  const manifest = `${declaration}<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="${ODT_MIME}"/>${["content.xml", "styles.xml", "meta.xml"].map((path) => `<manifest:file-entry manifest:full-path="${path}" manifest:media-type="text/xml"/>`).join("")}</manifest:manifest>`;
  const meta = `${declaration}<office:document-meta ${namespaces} xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"><office:meta><dc:title>${xml(model.title)}</dc:title><meta:generator>Reactive Resume</meta:generator></office:meta></office:document-meta>`;
  return zipSync(
    {
      mimetype: [strToU8(ODT_MIME), { level: 0 }],
      "content.xml": strToU8(content),
      "styles.xml": strToU8(styles),
      "meta.xml": strToU8(meta),
      "META-INF/manifest.xml": strToU8(manifest),
    },
    { level: 6 },
  );
}
