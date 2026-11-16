import { resumeDataSchema } from "@reactive-resume/schema";
import { describe, expect, it } from "vitest";

import { JsonResumeParser } from ".";
import { jsonResumeSchema } from "./schema";

const parser = new JsonResumeParser();
const imported = (data: unknown) => parser.convert(jsonResumeSchema.parse(data));

describe("JSON Resume import", () => {
  it("accepts unspecified dates without inventing dates or printing undefined", () => {
    const result = imported({
      work: [{ name: "公司", startDate: "2020-01", endDate: "", url: "" }],
      education: [{ institution: "学校" }],
      volunteer: [{ organization: "Community", endDate: "2024" }],
    });
    expect(result.sections.experience.items[0].date).toBe("2020-01");
    expect(result.sections.education.items[0].date).toBe("");
    expect(result.sections.volunteer.items[0].date).toBe("2024");
    expect(JSON.stringify(result)).not.toContain("undefined");
    expect(resumeDataSchema.safeParse(result).success).toBe(true);
  });

  it.each(["2024-00", "2024-13", "2024-02-30", "2023-02-29", "2024-04-31"])(
    "rejects an invalid calendar date: %s",
    (date) => {
      expect(jsonResumeSchema.safeParse({ work: [{ startDate: date }] }).success).toBe(false);
    },
  );

  it.each(["2024", "2024-12", "2024-02-29", ""])("accepts date precision %s", (date) => {
    expect(jsonResumeSchema.safeParse({ work: [{ startDate: date }] }).success).toBe(true);
  });

  it("keeps highlights, courses, projects and certificate links", () => {
    const result = imported({
      work: [
        {
          name: "Company",
          location: "北京",
          summary: "Overview",
          highlights: ["Built A", "中文成果"],
        },
      ],
      volunteer: [{ organization: "Community", highlights: ["Mentored students"] }],
      education: [
        {
          institution: "School",
          studyType: "Master",
          area: "Physics",
          courses: ["QFT", "Statistics"],
        },
      ],
      projects: [
        {
          name: "Offline app",
          description: "Local resume editor",
          highlights: ["Works offline"],
          keywords: ["React"],
          roles: ["Developer"],
          entity: "Team",
          startDate: "2024",
          url: "https://example.com",
        },
      ],
      certificates: [{ name: "Certificate", url: "https://example.com/certificate" }],
    });
    expect(result.sections.experience.items[0].summary).toContain("<li>中文成果</li>");
    expect(result.sections.experience.items[0].location).toBe("北京");
    expect(result.sections.volunteer.items[0].summary).toContain("Mentored students");
    expect(result.sections.education.items[0]).toMatchObject({
      studyType: "Master",
      area: "Physics",
      summary: "<ul><li>QFT</li><li>Statistics</li></ul>",
    });
    expect(result.sections.projects.items[0]).toMatchObject({
      name: "Offline app",
      description: "Local resume editor",
      keywords: ["React"],
      date: "2024",
    });
    expect(result.sections.projects.items[0].summary).toContain("Works offline");
    expect(result.sections.projects.items[0].summary).toContain("Developer");
    expect(result.sections.certifications.items[0].url.href).toBe(
      "https://example.com/certificate",
    );
    expect(resumeDataSchema.safeParse(result).success).toBe(true);
  });

  it("treats imported description and list text as text rather than executable HTML", () => {
    const result = imported({
      work: [
        {
          name: "Company",
          summary: '<script>alert("x")</script>\nSecond line',
          highlights: ['<img src=x onerror="alert(1)">', "A & B"],
        },
      ],
    });
    const html = result.sections.experience.items[0].summary;
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).toContain("A &amp; B");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
  });

  it("does not share defaults between imports or project links", () => {
    const first = imported({ projects: [{ name: "A" }, { name: "B" }] });
    first.sections.projects.items[0].url.href = "https://example.com/a";
    expect(first.sections.projects.items[1].url.href).toBe("");
    expect(imported({}).sections.projects.items).toEqual([]);
  });

  it.each([undefined, "", "   "])(
    "keeps an unnamed project and the rest of the resume: %s",
    (name) => {
      const result = imported({
        basics: { name: "Imported person" },
        projects: [
          {
            name,
            description: "维护离线工具",
            highlights: ["完成打印", "保留画布"],
            keywords: ["Desktop"],
            roles: ["Developer"],
            entity: "Local team",
            startDate: "2024",
            url: "https://example.com/project",
          },
        ],
      });
      const validated = resumeDataSchema.parse(result);
      expect(validated.basics.name).toBe("Imported person");
      expect(validated.sections.projects.items).toHaveLength(1);
      expect(validated.sections.projects.items[0]).toMatchObject({
        name: "Untitled project",
        description: "维护离线工具",
        keywords: ["Desktop"],
        date: "2024",
        url: { href: "https://example.com/project" },
      });
      expect(validated.sections.projects.items[0].summary).toContain("完成打印");
      expect(validated.sections.projects.items[0].summary).toContain("保留画布");
      expect(validated.sections.projects.items[0].summary).toContain("Local team");
      expect(validated.sections.projects.items[0].summary).toContain("Developer");
    },
  );
});
