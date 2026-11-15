/* eslint-disable unicorn/prefer-spread -- Match the library's DOM-only tsconfig when reading NodeLists. */

import { Editor } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { Underline } from "@tiptap/extension-underline";
import { StarterKit } from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";

import { cleanPastedHtml } from "./pasted-html";

const googleDocs =
  '<b style="font-weight:normal" id="docs-internal-guid-1"><p dir="ltr"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700">带领团队</span><span style="color:rgb(0,0,0)"> 完成项目，</span><a href="https://example.com"><span style="font-size:11pt;color:blue;text-decoration:underline">查看成果</span></a></p></b>';

const wordBullets = [
  '<h2 style="color:#1F3864">工作经历</h2>',
  '<p class="MsoListParagraphCxSpFirst" style="text-indent:-18pt;mso-list:l0 level1 lfo1"><span style="font-family:Symbol;mso-list:Ignore">·<span style="font:7.0pt &quot;Times New Roman&quot;">&nbsp;&nbsp;&nbsp;</span></span>交付支付系统</p>',
  '<p class="MsoListParagraphCxSpLast" style="text-indent:-18pt;mso-list:l0 level1 lfo1"><span style="font-family:Symbol;mso-list:Ignore">·<span>&nbsp;&nbsp;</span></span>减少 <b>加载时间</b> 30%</p>',
  '<p class="MsoNormal">普通中文正文</p>',
].join("");

const wordNumbered = [
  '<p style="mso-list:l1 level1 lfo2"><span style="MSO-LIST:Ignore">4.<span>&nbsp;&nbsp;</span></span>第四步</p>',
  '<p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">5.<span>&nbsp;&nbsp;</span></span>- 配置监控</p>',
].join("");

const wordNested = [
  '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.&nbsp;</span>Parent</p>',
  '<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a)&nbsp;</span>Child</p>',
  '<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">b)&nbsp;</span>Second child</p>',
  '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.&nbsp;</span>Next parent</p>',
].join("");

const wordWithExplanation = [
  '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.&nbsp;</span>First</p>',
  "Important explanation",
  '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.&nbsp;</span>Second</p>',
].join("");

describe("cleanPastedHtml", () => {
  it("drops Google Docs colours, font and size while preserving emphasis, links and Chinese text", () => {
    const html = cleanPastedHtml(googleDocs);
    expect(html).not.toMatch(/color|font-family|font-size|background/);
    expect(html).toContain("font-weight:700");
    expect(html).toContain("text-decoration:underline");
    expect(html).toContain('<a href="https://example.com">');
    expect(html).toContain(" 完成项目，");
  });

  it("converts Word's fake bullets into a real list, keeping bold text and surrounding paragraphs", () => {
    expect(cleanPastedHtml(wordBullets)).toBe(
      "<h2>工作经历</h2><ul><li>交付支付系统</li><li>减少 <b>加载时间</b> 30%</li></ul><p>普通中文正文</p>",
    );
  });

  it("keeps a numbered list's start and authored leading dash", () => {
    expect(cleanPastedHtml(wordNumbered)).toBe(
      '<ol start="4"><li>第四步</li><li>- 配置监控</li></ol>',
    );
  });

  it("recognizes numbered Word paragraphs without conditional marker spans", () => {
    expect(
      cleanPastedHtml(
        '<p style="mso-list:l1 level1 lfo2">3.&nbsp;第三步</p><p style="mso-list:l1 level1 lfo2">4.&nbsp;第四步</p>',
      ),
    ).toBe('<ol start="3"><li>第三步</li><li>第四步</li></ol>');
  });

  it("separates different Word lists and marker kinds, without stripping authored words", () => {
    const html = [
      '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·&nbsp;</span>项目</p>',
      '<p style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">1.&nbsp;</span>第一步</p>',
      '<p class="MsoListParagraph">·&nbsp;另一列表</p>',
      '<p class="MsoListParagraph">2.&nbsp;第二步</p>',
      '<p class="MsoListParagraph">Inc. grew revenue</p>',
    ].join("");
    expect(cleanPastedHtml(html)).toBe(
      '<ul><li>项目</li></ul><ol><li>第一步</li></ol><ul><li>另一列表</li></ul><ol start="2"><li>第二步</li></ol><ul><li>Inc. grew revenue</li></ul>',
    );
  });

  it("keeps existing nested lists, including Word-styled paragraphs already inside a list item", () => {
    const html =
      '<ul><li><p class="MsoListParagraph">父项</p><ol start="3"><li><p style="mso-list:l0 level2 lfo1">子项</p></li></ol></li></ul>';
    expect(cleanPastedHtml(html)).toBe(
      '<ul><li><p>父项</p><ol start="3"><li><p>子项</p></li></ol></li></ul>',
    );
  });

  it("does not move nonempty text between Word list paragraphs past the second item", () => {
    expect(cleanPastedHtml(wordWithExplanation)).toBe(
      '<ol><li>First</li></ol>Important explanation<ol start="2"><li>Second</li></ol>',
    );
  });

  it("continues a Word list across whitespace and comments", () => {
    const html = wordNumbered.replace("</p><p", "</p> \n<!-- Word list separator -->\t<p");
    const dom = new DOMParser().parseFromString(cleanPastedHtml(html), "text/html");
    expect(dom.querySelectorAll("ol")).toHaveLength(1);
    expect(dom.querySelectorAll("ol > li")).toHaveLength(2);
    expect(dom.querySelector("ol")?.textContent).toBe("第四步- 配置监控");
  });

  it("reconstructs Word levels within one list instance instead of flattening children", () => {
    expect(cleanPastedHtml(wordNested)).toBe(
      "<ol><li>Parent<ol><li>Child</li><li>Second child</li></ol></li><li>Next parent</li></ol>",
    );
  });

  it("keeps each Word level's list type and starting number", () => {
    const html = [
      '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·&nbsp;</span>Parent</p>',
      '<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">4.&nbsp;</span>Fourth child</p>',
      '<p style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">5.&nbsp;</span>Fifth child</p>',
      '<p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·&nbsp;</span>Next parent</p>',
    ].join("");
    expect(cleanPastedHtml(html)).toBe(
      '<ul><li>Parent<ol start="4"><li>Fourth child</li><li>Fifth child</li></ol></li><li>Next parent</li></ul>',
    );
  });

  it("keeps normal markup and Chinese paragraphs whose text resembles a list", () => {
    const html =
      '<p>1. 普通中文说明，非列表</p><p>普通正文：<a href="https://example.com">链接</a></p><ul><li>项目<ul><li>子项</li></ul></li></ul>';
    expect(cleanPastedHtml(html)).toBe(html);
  });

  it("removes legacy font tags and pasted classes without discarding text or semantic formatting", () => {
    expect(
      cleanPastedHtml(
        '<p class="external"><font face="Arial" color="red" size="6">普通中文 <strong>重点</strong></font> <em>强调</em> <u>下划线</u></p>',
      ),
    ).toBe("<p>普通中文 <strong>重点</strong> <em>强调</em> <u>下划线</u></p>");
  });
});

describe("Tiptap 2 HTML paste", () => {
  let editor: Editor | undefined;

  afterEach(() => {
    editor?.destroy();
    editor = undefined;
  });

  function paste(html: string) {
    editor = new Editor({
      extensions: [StarterKit, Underline, Link.configure({ openOnClick: false })],
      editorProps: { transformPastedHTML: cleanPastedHtml },
    });
    // jsdom has no ClipboardEvent constructor; ProseMirror only needs the paste event here.
    editor.view.pasteHTML(html, new Event("paste") as ClipboardEvent);
    return editor;
  }

  it("parses cleaned Docs content into editable bold and linked text without source styling", () => {
    const value = paste(googleDocs);
    expect(value.getText()).toBe("带领团队 完成项目，查看成果");
    const dom = new DOMParser().parseFromString(value.getHTML(), "text/html");
    expect(dom.querySelector("strong")?.textContent).toBe("带领团队");
    expect(dom.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(dom.querySelector("a")?.textContent).toBe("查看成果");
    expect(dom.querySelector("a u")?.textContent).toBe("查看成果");
    expect(value.getHTML()).not.toMatch(/font-family|font-size|background|color/);
  });

  it("pastes Word bullets as editable list items without duplicate typed markers", () => {
    const value = paste(wordBullets);
    const dom = new DOMParser().parseFromString(value.getHTML(), "text/html");
    expect(Array.from(dom.querySelectorAll("ul > li")).map((item) => item.textContent)).toEqual([
      "交付支付系统",
      "减少 加载时间 30%",
    ]);
    expect(dom.querySelector("li strong")?.textContent).toBe("加载时间");
    expect(value.getText()).toContain("普通中文正文");
    expect(value.getHTML()).not.toContain("·");
  });

  it("retains ordered-list start values and valid nested lists in the editor document", () => {
    const value = paste(
      `${wordNumbered}<ul><li><p>父项</p><ol start="3"><li><p>子项</p></li></ol></li></ul>`,
    );
    const dom = new DOMParser().parseFromString(value.getHTML(), "text/html");
    expect(dom.querySelector("ol")?.getAttribute("start")).toBe("4");
    expect(dom.querySelector("ol > li:nth-child(2)")?.textContent).toBe("- 配置监控");
    expect(dom.querySelector("ul > li > ol")?.getAttribute("start")).toBe("3");
    expect(dom.querySelector("ul > li > ol > li")?.textContent).toBe("子项");
  });

  it("pastes intervening explanation text in its original reading order", () => {
    const value = paste(wordWithExplanation);
    expect(value.getText().split(/\n+/).filter(Boolean)).toEqual([
      "First",
      "Important explanation",
      "Second",
    ]);
    const dom = new DOMParser().parseFromString(value.getHTML(), "text/html");
    expect(Array.from(dom.body.children).map((element) => element.tagName)).toEqual([
      "OL",
      "P",
      "OL",
    ]);
    expect(dom.body.children[1].textContent).toBe("Important explanation");
  });

  it("pastes Word parent/child levels as an editable nested list", () => {
    const value = paste(wordNested);
    const dom = new DOMParser().parseFromString(value.getHTML(), "text/html");
    const root = dom.body.querySelector("ol");
    expect(root?.children).toHaveLength(2);
    expect(root?.children[1].textContent).toBe("Next parent");
    expect(root?.children[0].querySelectorAll("ol > li")).toHaveLength(2);
    expect(root?.children[0].querySelector("ol > li")?.textContent).toBe("Child");
  });
});
