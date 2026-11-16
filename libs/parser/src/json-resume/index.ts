import { createId } from "@paralleldrive/cuid2";
import type { ResumeData } from "@reactive-resume/schema";
import {
  defaultAward,
  defaultCertification,
  defaultEducation,
  defaultExperience,
  defaultInterest,
  defaultLanguage,
  defaultProfile,
  defaultProject,
  defaultPublication,
  defaultReference,
  defaultResumeData,
  defaultSkill,
  defaultVolunteer,
} from "@reactive-resume/schema";
import type { Json } from "@reactive-resume/utils";
import type { Schema } from "zod";

import type { Parser } from "../interfaces/parser";
import type { JsonResume } from "./schema";
import { jsonResumeSchema } from "./schema";

export * from "./schema";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
const dateRange = (start?: string, end?: string) => [start, end].filter(Boolean).join(" - ");

/** JSON Resume descriptions and highlights are text, not trusted HTML. */
function richText(summary?: string, highlights?: string[]) {
  const paragraphs = summary?.trim()
    ? summary
        .trim()
        .split(/\n\s*\n/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`)
        .join("")
    : "";
  const items = highlights?.filter((item) => item.trim());
  return (
    paragraphs +
    (items?.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "")
  );
}

export class JsonResumeParser implements Parser<Json, JsonResume> {
  schema: Schema;

  constructor() {
    this.schema = jsonResumeSchema;
  }

  readFile(file: File): Promise<Json> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      // eslint-disable-next-line unicorn/prefer-add-event-listener
      reader.onload = () => {
        try {
          const result = JSON.parse(reader.result as string) as Json;
          resolve(result);
        } catch {
          reject(new Error("Failed to parse JSON"));
        }
      };

      // eslint-disable-next-line unicorn/prefer-add-event-listener
      reader.onerror = () => {
        reject(new Error("Failed to read the file"));
      };

      // eslint-disable-next-line unicorn/prefer-blob-reading-methods
      reader.readAsText(file);
    });
  }

  validate(data: Json) {
    return this.schema.parse(data) as JsonResume;
  }

  convert(data: JsonResume) {
    const result = JSON.parse(JSON.stringify(defaultResumeData)) as ResumeData;

    // Basics
    result.basics.name = data.basics?.name ?? "";
    result.basics.headline = data.basics?.label ?? "";
    result.basics.picture.url = data.basics?.image ?? "";
    result.basics.email = data.basics?.email ?? "";
    result.basics.phone = data.basics?.phone ?? "";
    result.basics.location = [
      ...new Set(Object.values(data.basics?.location ?? {}).filter(Boolean)),
    ].join(", ");
    result.basics.url.href = data.basics?.url ?? "";
    result.sections.summary.content = richText(data.basics?.summary);

    // Profiles
    if (data.basics?.profiles) {
      for (const profile of data.basics.profiles) {
        result.sections.profiles.items.push({
          ...defaultProfile,
          id: createId(),
          icon: profile.network?.toLocaleLowerCase() ?? "",
          network: profile.network ?? "",
          username: profile.username ?? "",
          url: { ...defaultProfile.url, href: profile.url ?? "" },
        });
      }
    }

    // Work
    if (data.work) {
      for (const work of data.work) {
        result.sections.experience.items.push({
          ...defaultExperience,
          id: createId(),
          company: work.name ?? "",
          position: work.position ?? "",
          location: work.location ?? "",
          summary: richText(work.summary, work.highlights),
          date: dateRange(work.startDate, work.endDate),
          url: { ...defaultExperience.url, href: work.url ?? "" },
        });
      }
    }

    // Volunteer
    if (data.volunteer) {
      for (const volunteer of data.volunteer) {
        result.sections.volunteer.items.push({
          ...defaultVolunteer,
          id: createId(),
          organization: volunteer.organization ?? "",
          date: dateRange(volunteer.startDate, volunteer.endDate),
          position: volunteer.position ?? "",
          summary: richText(volunteer.summary, volunteer.highlights),
          url: { ...defaultVolunteer.url, href: volunteer.url ?? "" },
        });
      }
    }

    // Education
    if (data.education) {
      for (const education of data.education) {
        result.sections.education.items.push({
          ...defaultEducation,
          id: createId(),
          institution: education.institution ?? "",
          studyType: education.studyType ?? "",
          area: education.area ?? "",
          score: education.score ?? "",
          date: dateRange(education.startDate, education.endDate),
          summary: richText(undefined, education.courses),
          url: { ...defaultEducation.url, href: education.url ?? "" },
        });
      }
    }

    // Awards
    if (data.awards) {
      for (const award of data.awards) {
        result.sections.awards.items.push({
          ...defaultAward,
          id: createId(),
          title: award.title ?? "",
          date: award.date ?? "",
          awarder: award.awarder ?? "",
          summary: richText(award.summary),
        });
      }
    }

    // Certificates
    if (data.certificates) {
      for (const certificate of data.certificates) {
        result.sections.certifications.items.push({
          ...defaultCertification,
          id: createId(),
          name: certificate.name ?? "",
          date: certificate.date ?? "",
          issuer: certificate.issuer ?? "",
          summary: richText(certificate.summary),
          url: { ...defaultCertification.url, href: certificate.url ?? "" },
        });
      }
    }

    // Publications
    if (data.publications) {
      for (const publication of data.publications) {
        result.sections.publications.items.push({
          ...defaultPublication,
          id: createId(),
          name: publication.name ?? "",
          publisher: publication.publisher ?? "",
          summary: richText(publication.summary),
          date: publication.releaseDate ?? "",
          url: { ...defaultPublication.url, href: publication.url ?? "" },
        });
      }
    }

    // Preserve projects instead of stripping them during schema validation.
    for (const project of data.projects ?? []) {
      const name = project.name?.trim() ?? "";
      const context = [project.entity, project.type, project.roles?.join(", ")]
        .filter(Boolean)
        .join(" · ");
      result.sections.projects.items.push({
        ...defaultProject,
        id: createId(),
        name: name.length > 0 ? name : "Untitled project",
        description: project.description ?? "",
        summary: richText(context, project.highlights),
        date: dateRange(project.startDate, project.endDate),
        keywords: [...(project.keywords ?? [])],
        url: { ...defaultProject.url, href: project.url ?? "" },
      });
    }

    // Skills
    if (data.skills) {
      for (const skill of data.skills) {
        result.sections.skills.items.push({
          ...defaultSkill,
          id: createId(),
          name: skill.name ?? "",
          description: skill.level ?? "",
          keywords: skill.keywords ?? [],
        });
      }
    }

    // Languages
    if (data.languages) {
      for (const language of data.languages) {
        result.sections.languages.items.push({
          ...defaultLanguage,
          id: createId(),
          name: language.language ?? "",
          description: language.fluency ?? "",
        });
      }
    }

    // Interests
    if (data.interests) {
      for (const interest of data.interests) {
        result.sections.interests.items.push({
          ...defaultInterest,
          id: createId(),
          name: interest.name ?? "",
          keywords: interest.keywords ?? [],
        });
      }
    }

    // References
    if (data.references) {
      for (const reference of data.references) {
        result.sections.references.items.push({
          ...defaultReference,
          id: createId(),
          name: reference.name ?? "",
          summary: richText(reference.reference),
        });
      }
    }

    return result;
  }
}
