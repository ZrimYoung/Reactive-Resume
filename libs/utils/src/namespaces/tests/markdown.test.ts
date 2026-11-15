import type { ResumeData } from "@reactive-resume/schema";
import {
  defaultAward,
  defaultCustomSection,
  defaultExperience,
  defaultInterest,
  defaultLanguage,
  defaultProfile,
  defaultPublication,
  defaultReference,
  defaultResumeData,
  defaultSection,
  defaultSkill,
  defaultVolunteer,
  sampleResume,
} from "@reactive-resume/schema";
import { describe, expect, it } from "vitest";

import { buildResumeMarkdown, htmlToMarkdown } from "../markdown";

const resume = (): ResumeData => structuredClone(defaultResumeData);

describe("buildResumeMarkdown", () => {
  it("uses page, main-column and sidebar order, including custom sections", () => {
    const data = resume();
    data.basics.name = "张三";
    data.basics.headline = "工程师";
    data.metadata.layout = [
      [["custom.first-section", "experience"], ["summary"]],
      [["skills"], []],
    ];
    data.sections.custom["first-section"] = {
      ...defaultSection,
      id: "first",
      name: "自定义经历",
      items: [{ ...defaultCustomSection, id: "custom-item", name: "自定义条目", visible: true }],
    };
    data.sections.experience.items = [
      { ...defaultExperience, id: "job", company: "工作条目", visible: true },
    ];
    data.sections.summary.content = "<p>侧栏概要正文</p>";
    data.sections.skills.items = [
      { ...defaultSkill, id: "skill", name: "末页技能", visible: true },
    ];

    const markdown = buildResumeMarkdown(data);
    const positions = [
      "# 张三",
      "## 自定义经历",
      "自定义条目",
      "工作条目",
      "侧栏概要正文",
      "末页技能",
    ].map((text) => markdown.indexOf(text));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(markdown).toContain("_工程师_");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("does not expose hidden sections, hidden entries, notes, photos or unprinted columns", () => {
    const data = resume();
    data.metadata.notes = "PRIVATE-NOTES";
    data.basics.picture.url = "https://private.example/PRIVATE-PHOTO.png";
    data.basics.picture.effects.hidden = true;
    data.metadata.layout = [
      [["experience", "summary", "custom.private-section"], ["profiles"], ["skills"]],
    ];
    data.sections.experience.items = [
      {
        ...defaultExperience,
        id: "hidden",
        company: "HIDDEN-EMPLOYER",
        visible: false,
        summary: "HIDDEN-SUMMARY",
        url: { href: "https://private.example/HIDDEN-URL", label: "secret" },
      },
      { ...defaultExperience, id: "shown", company: "Visible employer", visible: true },
    ];
    data.sections.summary.visible = false;
    data.sections.summary.content = "HIDDEN-SECTION";
    data.sections.skills.items = [
      { ...defaultSkill, id: "skill", name: "UNPRINTED-COLUMN", visible: true },
    ];
    data.sections.projects.items = [
      {
        ...sampleResume.sections.projects.items[0],
        id: "project",
        name: "UNPLACED-PROJECT",
        visible: true,
      },
    ];
    data.sections.custom["private-section"] = {
      ...defaultSection,
      id: "private",
      name: "HIDDEN-CUSTOM-TITLE",
      visible: false,
      items: [
        { ...defaultCustomSection, id: "custom-item", name: "HIDDEN-CUSTOM-ITEM", visible: true },
      ],
    };
    data.sections.profiles.items = [
      {
        ...defaultProfile,
        id: "profile",
        network: "Visible profile",
        username: "visible-user",
        visible: true,
      },
    ];

    const markdown = buildResumeMarkdown(data);

    expect(markdown).toContain("Visible employer");
    expect(markdown).toContain("Visible profile");
    expect(markdown).not.toMatch(/PRIVATE-|HIDDEN-|UNPRINTED-|UNPLACED-/);
  });

  it("omits empty headings and custom sections whose entries are all hidden", () => {
    const data = resume();
    data.metadata.layout = [[["experience", "summary", "custom.empty-section"], []]];
    data.sections.summary.content = "<p><br></p>";
    data.sections.custom["empty-section"] = {
      ...defaultSection,
      id: "empty",
      name: "Empty custom",
      items: [{ ...defaultCustomSection, id: "hidden", name: "Secret", visible: false }],
    };
    expect(buildResumeMarkdown(data)).toBe("\n");
  });

  it("maps every built-in section from the v4 schema", () => {
    const data = structuredClone(sampleResume);
    data.sections.awards.items = [{ ...defaultAward, title: "Research prize", visible: true }];
    data.sections.volunteer.items = [
      { ...defaultVolunteer, organization: "Community group", visible: true },
    ];
    data.sections.publications.items = [
      { ...defaultPublication, name: "Published paper", visible: true },
    ];
    data.sections.references.items = [{ ...defaultReference, name: "Referee", visible: true }];
    data.sections.languages.items = [{ ...defaultLanguage, name: "普通话", visible: true }];
    data.sections.interests.items = [{ ...defaultInterest, name: "Hiking", visible: true }];
    for (const section of Object.values(data.sections)) {
      if ("visible" in section) section.visible = true;
    }
    data.metadata.layout = [
      [
        [
          "summary",
          "experience",
          "education",
          "projects",
          "volunteer",
          "awards",
          "certifications",
          "publications",
          "references",
          "skills",
          "languages",
          "interests",
          "profiles",
        ],
        [],
      ],
    ];
    const markdown = buildResumeMarkdown(data);
    for (const section of Object.values(data.sections)) {
      if ("name" in section && typeof section.name === "string")
        expect(markdown).toContain(`## ${section.name}`);
    }
    expect(markdown).toContain(data.sections.experience.items[0].company);
    expect(markdown).toContain(data.sections.education.items[0].institution);
    expect(markdown).toContain(data.sections.projects.items[0].name);
    expect(markdown).toContain(data.sections.volunteer.items[0].organization);
    expect(markdown).toContain(data.sections.skills.items[0].keywords[0]);
  });

  it("escapes literal Markdown in user fields and preserves named contact links", () => {
    const data = resume();
    data.basics.name = "Name [literal]";
    data.basics.url = { label: "Portfolio [site]", href: "https://example.com/work_(2026)" };
    data.basics.customFields = [
      { id: "custom", icon: "link", name: "Demo", value: "https://example.com/demo" },
    ];
    const markdown = buildResumeMarkdown(data);
    expect(markdown).toContain(String.raw`# Name \[literal\]`);
    expect(markdown).toContain(
      String.raw`[Portfolio \[site\]](https://example.com/work_%282026%29)`,
    );
    expect(markdown).toContain("[Demo](https://example.com/demo)");
  });

  it("does not mutate the original resume", () => {
    const data = structuredClone(sampleResume);
    const before = structuredClone(data);
    buildResumeMarkdown(data);
    expect(data).toEqual(before);
  });
});

describe("htmlToMarkdown", () => {
  it("preserves Chinese text, emphasis, underline, strikeout and decoded entities", () => {
    expect(
      htmlToMarkdown(
        "<p>中文 <strong>重点</strong> 与 <em>强调</em>，<u>下划线</u>、<s>删除</s> &amp; &lt;文字&gt;。</p>",
      ),
    ).toBe(String.raw`中文 **重点** 与 _强调_，<u>下划线</u>、~~删除~~ & \<文字\>。`);
  });

  it("keeps semantic links with nested formatting and parentheses without accepting script URLs", () => {
    expect(
      htmlToMarkdown(
        "<p><a href='https://example.com/a_(b)?x=1&amp;y=2'><strong>结果 [一]</strong></a> <a href='javascript:alert(1)'>普通文字</a></p>",
      ),
    ).toBe(String.raw`[**结果 \[一\]**](https://example.com/a_%28b%29?x=1&y=2) 普通文字`);
    expect(
      htmlToMarkdown(
        '<a href="mailto:hello@example.com">邮件</a> <a href="tel:+85212345678">电话</a>',
      ),
    ).toBe("[邮件](mailto:hello@example.com) [电话](tel:+85212345678)");
  });

  it("keeps ordered-list starts and nested list hierarchy", () => {
    const markdown = htmlToMarkdown(
      '<ol start="4"><li><p>第一步</p><ul><li>子项<ul><li>更深</li></ul></li></ul></li><li>第二步</li></ol>',
    );
    expect(markdown).toContain("4. 第一步");
    expect(markdown).toMatch(/\n {3}- 子项/);
    expect(markdown).toMatch(/\n {5}- 更深/);
    expect(markdown).toContain("\n5. 第二步");
  });

  it("keeps paragraphs within list items and separately started lists", () => {
    expect(
      htmlToMarkdown(
        '<ul><li><p>第一段</p><p>第二段</p></li></ul><ol start="10"><li>第十项</li></ol>',
      ),
    ).toBe("- 第一段\n  \n  第二段\n\n10. 第十项");
  });

  it("preserves code whitespace and uses fences that cannot be closed by the source", () => {
    expect(
      htmlToMarkdown(
        '<pre><code class="language-js">const x = `value`;\n  ```\n  x++;</code></pre>',
      ),
    ).toBe("````js\nconst x = `value`;\n  ```\n  x++;\n````");
    expect(htmlToMarkdown("<p>Use <code>my`code</code>.</p>")).toBe("Use ``my`code``.");
  });

  it("keeps headings, line breaks and quoted paragraphs", () => {
    expect(
      htmlToMarkdown("<h3>标题</h3><blockquote><p>引用一</p><p>引用二<br>下一行</p></blockquote>"),
    ).toBe("### 标题\n\n> 引用一\n> \n> 引用二  \n> 下一行");
  });

  it("excludes executable/embedded content and image URLs without removing surrounding prose", () => {
    expect(
      htmlToMarkdown(
        '<p>可见<script>PRIVATE-SCRIPT</script><img src="https://example.com/PRIVATE-IMAGE.png">正文</p><iframe src="https://example.com">PRIVATE-FRAME</iframe>',
      ),
    ).toBe("可见正文");
  });
});
