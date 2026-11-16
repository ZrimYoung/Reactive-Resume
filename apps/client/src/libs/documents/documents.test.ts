/* eslint-disable lingui/no-unlocalized-strings -- Export fixtures and XML assertions are not UI copy. */
import { defaultResumeData } from "@reactive-resume/schema";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { buildEditableResume } from ".";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const FO = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
const STYLE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const XLINK = "http://www.w3.org/1999/xlink";

const readXml = (bytes: Uint8Array) => {
  const document = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  expect(document.querySelectorAll("parsererror")).toHaveLength(0);
  return document;
};

function fixture() {
  const data = structuredClone(defaultResumeData);
  data.basics.name = "张三 & 李四";
  data.basics.headline = "开发工程师";
  data.basics.email = "person@example.com";
  data.basics.phone = "+86 123456";
  data.basics.location = "上海";
  data.basics.url = { label: "个人主页", href: "https://example.com/?a=1&b=2" };
  data.basics.customFields = [
    { id: "custom-field", icon: "link", name: "作品", value: "https://portfolio.example.com/" },
  ];
  data.basics.picture.url = "https://never-fetch.example.com/PRIVATE-PHOTO.png";
  data.metadata.notes = "PRIVATE-NOTES";
  data.metadata.css.value = "PRIVATE-CSS";
  data.metadata.typography.font.family = "Microsoft YaHei";
  data.metadata.page.format = "b5";
  data.metadata.page.orientation = "landscape";
  data.sections.summary.name = "简介";
  data.sections.summary.content =
    '<p style="text-align: center"><strong>粗体</strong> <em>斜体</em> <u>下划线</u> <s>删除线</s> <mark>高亮</mark> <span style="color:#123456">彩色</span> <a href="https://example.com/path?q=中文&amp;b=2">安全链接</a></p><ol start="4"><li><p>有序第一项</p><ul><li><p>嵌套项目</p></li></ul></li><li><p>有序第二项</p><p>同项续段</p></li></ol><blockquote><p>引用内容</p></blockquote><pre><code>代码  空格\n第二行</code></pre><p><a href="javascript:alert(1)">不安全链接文本</a><img src="https://never-fetch.example.com/image.png"><script>PRIVATE-SCRIPT</script></p>';
  const url = { label: "条目链接", href: "https://entry.example.com/" };
  data.sections.experience.items = [
    {
      id: "experience",
      visible: true,
      company: "示例公司",
      position: "负责人",
      location: "杭州",
      date: "2020 — 至今",
      summary: "<p>经历内容</p>",
      url,
    },
    {
      id: "hidden",
      visible: false,
      company: "PRIVATE-HIDDEN",
      position: "",
      location: "",
      date: "",
      summary: "",
      url,
    },
  ];
  data.sections.education.items = [
    {
      id: "education",
      visible: true,
      institution: "示例大学",
      studyType: "硕士",
      area: "计算机",
      score: "4.0",
      date: "2018",
      summary: "<p>教育内容</p>",
      url,
    },
  ];
  data.sections.projects.items = [
    {
      id: "project",
      visible: true,
      name: "示例项目",
      description: "项目描述",
      date: "2024",
      summary: "<p>项目内容</p>",
      keywords: ["项目关键词"],
      url,
    },
  ];
  data.sections.volunteer.items = [
    {
      id: "volunteer",
      visible: true,
      organization: "志愿组织",
      position: "志愿者",
      location: "北京",
      date: "2023",
      summary: "<p>志愿内容</p>",
      url,
    },
  ];
  data.sections.awards.items = [
    {
      id: "award",
      visible: true,
      title: "示例奖项",
      awarder: "颁奖方",
      date: "2022",
      summary: "<p>奖项内容</p>",
      url,
    },
  ];
  data.sections.certifications.items = [
    {
      id: "cert",
      visible: true,
      name: "示例证书",
      issuer: "认证方",
      date: "2021",
      summary: "<p>证书内容</p>",
      url,
    },
  ];
  data.sections.publications.items = [
    {
      id: "publication",
      visible: true,
      name: "示例论文",
      publisher: "出版社",
      date: "2020",
      summary: "<p>论文内容</p>",
      url,
    },
  ];
  data.sections.references.items = [
    {
      id: "reference",
      visible: true,
      name: "推荐人",
      description: "推荐人描述",
      summary: "<p>推荐内容</p>",
      url,
    },
  ];
  data.sections.skills.items = [
    {
      id: "skill",
      visible: true,
      name: "开发技能",
      description: "熟练",
      level: 4,
      keywords: ["技能关键词"],
    },
  ];
  data.sections.languages.items = [
    { id: "language", visible: true, name: "中文", description: "母语", level: 5 },
  ];
  data.sections.interests.items = [
    { id: "interest", visible: true, name: "阅读", keywords: ["兴趣关键词"] },
  ];
  data.sections.profiles.items = [
    {
      id: "profile",
      visible: true,
      network: "GitHub",
      username: "示例用户名",
      icon: "github",
      url,
    },
  ];
  data.sections.custom.extra = {
    id: "extra",
    name: "自定义章节",
    visible: true,
    columns: 1,
    separateLinks: true,
    items: [
      {
        id: "custom",
        visible: true,
        name: "自定义条目",
        description: "自定义描述",
        location: "深圳",
        date: "2025",
        summary: "<p>自定义内容</p>",
        keywords: ["自定义关键词"],
        url,
      },
    ],
  };
  data.sections.custom.unlisted = {
    ...structuredClone(data.sections.custom.extra),
    id: "unlisted",
    name: "PRIVATE-UNLISTED",
  };
  data.sections.custom.hidden = {
    ...structuredClone(data.sections.custom.extra),
    id: "hidden-section",
    name: "PRIVATE-SECTION",
    visible: false,
  };
  data.metadata.layout = [
    [
      ["summary", "experience", "education", "projects", "volunteer", "references"],
      ["profiles", "skills", "languages", "interests"],
    ],
    [
      [
        "custom.extra",
        "awards",
        "certifications",
        "publications",
        "custom.hidden",
        "custom.__proto__",
      ],
      [],
      ["custom.unlisted"],
    ],
  ];
  return data;
}

const printable = [
  "开发工程师",
  "person@example.com",
  "上海",
  "个人主页",
  "作品",
  "简介",
  "粗体",
  "有序第一项",
  "嵌套项目",
  "同项续段",
  "示例公司",
  "负责人",
  "杭州",
  "2020 — 至今",
  "经历内容",
  "示例大学",
  "硕士",
  "计算机",
  "4.0",
  "教育内容",
  "示例项目",
  "项目描述",
  "项目内容",
  "项目关键词",
  "志愿组织",
  "志愿者",
  "北京",
  "志愿内容",
  "示例奖项",
  "颁奖方",
  "奖项内容",
  "示例证书",
  "认证方",
  "证书内容",
  "示例论文",
  "出版社",
  "论文内容",
  "推荐人",
  "推荐内容",
  "开发技能",
  "技能关键词",
  "4/5",
  "中文",
  "母语",
  "阅读",
  "兴趣关键词",
  "GitHub",
  "示例用户名",
  "自定义章节",
  "自定义条目",
  "自定义描述",
  "深圳",
  "自定义内容",
  "自定义关键词",
];

describe("offline editable document archives", () => {
  it.each(["docx", "odt"] as const)(
    "writes complete, filtered %s content without fetching assets",
    async (format) => {
      const fetch = vi.fn(() => {
        throw new Error("No network allowed");
      });
      vi.stubGlobal("fetch", fetch);
      try {
        const { bytes, mimeType } = await buildEditableResume(fixture(), format);
        expect(bytes.slice(0, 2)).toEqual(new Uint8Array([80, 75]));
        expect(mimeType).toContain(format === "docx" ? "wordprocessingml" : "opendocument");
        const files = unzipSync(bytes);
        const content = readXml(files[format === "docx" ? "word/document.xml" : "content.xml"]);
        const text = content.documentElement.textContent ?? "";
        for (const value of printable) expect(text).toContain(value);
        expect(text.split("张三 & 李四")).toHaveLength(2);
        const allXml = Object.entries(files)
          .filter(([name]) => name.endsWith(".xml") || name.endsWith(".rels"))
          .map(([, file]) => strFromU8(file))
          .join("");
        expect(allXml).not.toContain("PRIVATE-");
        // eslint-disable-next-line no-script-url -- Unsafe link destinations must not be exported.
        expect(allXml).not.toContain("javascript:");
        expect(allXml).not.toContain("never-fetch.example.com");
        expect(text.indexOf("示例公司")).toBeLessThan(text.indexOf("GitHub"));
        expect(text.indexOf("GitHub")).toBeLessThan(text.indexOf("自定义章节"));
        expect(fetch).not.toHaveBeenCalled();
        for (const [name, file] of Object.entries(files)) if (name.endsWith(".xml")) readXml(file);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("DOCX stores live hyperlinks, rich styles, real numbering, page breaks and selected dimensions", async () => {
    const { bytes } = await buildEditableResume(fixture(), "docx");
    const files = unzipSync(bytes);
    const document = readXml(files["word/document.xml"]);
    const relationships = readXml(files["word/_rels/document.xml.rels"]);
    const numbering = readXml(files["word/numbering.xml"]);
    const styles = readXml(files["word/styles.xml"]);
    expect(
      [...relationships.querySelectorAll("Relationship")].some(
        (link) =>
          link.getAttribute("Target") === "https://example.com/path?q=%E4%B8%AD%E6%96%87&b=2",
      ),
    ).toBe(true);
    for (const tag of ["b", "i", "u", "strike", "shd", "numPr", "hyperlink"])
      expect(document.getElementsByTagNameNS(W, tag).length).toBeGreaterThan(0);
    expect(
      [...numbering.getElementsByTagNameNS(W, "numFmt")].some(
        (node) => node.getAttributeNS(W, "val") === "decimal",
      ),
    ).toBe(true);
    expect(
      [...numbering.getElementsByTagNameNS(W, "start")].some(
        (node) => node.getAttributeNS(W, "val") === "4",
      ),
    ).toBe(true);
    expect(
      [...document.getElementsByTagNameNS(W, "br")].some(
        (node) => node.getAttributeNS(W, "type") === "page",
      ),
    ).toBe(true);
    const page = document.getElementsByTagNameNS(W, "pgSz")[0];
    expect(Number(page.getAttributeNS(W, "w"))).toBe(Math.round((250 * 1440) / 25.4));
    expect(Number(page.getAttributeNS(W, "h"))).toBe(Math.round((176 * 1440) / 25.4));
    expect(strFromU8(files["word/styles.xml"])).toContain("Microsoft YaHei");
    expect(styles.getElementsByTagNameNS(W, "rFonts").length).toBeGreaterThan(0);
  });

  it("ODT has a first uncompressed mimetype, editable nested lists, hyperlinks and page styles", async () => {
    const { bytes } = await buildEditableResume(fixture(), "odt");
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(header.getUint16(8, true)).toBe(0);
    const filenameLength = header.getUint16(26, true);
    expect(strFromU8(bytes.slice(30, 30 + filenameLength))).toBe("mimetype");
    const files = unzipSync(bytes);
    expect(strFromU8(files.mimetype)).toBe("application/vnd.oasis.opendocument.text");
    expect(files["META-INF/manifest.xml"]).toBeDefined();
    const content = readXml(files["content.xml"]);
    const styles = readXml(files["styles.xml"]);
    const masterPageReferences = [content, styles]
      .flatMap((document) => [...document.getElementsByTagNameNS(STYLE, "style")])
      .filter((style) => style.hasAttributeNS(STYLE, "master-page-name"));
    expect(masterPageReferences).toHaveLength(1);
    expect(masterPageReferences[0].getAttributeNS(STYLE, "name")).toBe("P0");
    expect(content.getElementsByTagNameNS(TEXT, "list").length).toBe(2);
    expect(
      [...content.getElementsByTagNameNS(TEXT, "list-item")].some(
        (node) => node.getAttributeNS(TEXT, "start-value") === "4",
      ),
    ).toBe(true);
    expect(
      [...content.getElementsByTagNameNS(TEXT, "a")].some(
        (node) =>
          node.getAttributeNS(XLINK, "href") ===
          "https://example.com/path?q=%E4%B8%AD%E6%96%87&b=2",
      ),
    ).toBe(true);
    expect(strFromU8(files["content.xml"])).toContain('fo:break-before="page"');
    const page = styles.getElementsByTagNameNS(STYLE, "page-layout-properties")[0];
    expect(page.getAttributeNS(FO, "page-width")).toBe("25cm");
    expect(page.getAttributeNS(FO, "page-height")).toBe("17.6cm");
  });
});
