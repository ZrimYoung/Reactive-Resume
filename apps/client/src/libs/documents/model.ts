import type { ResumeData, URL as ResumeURL } from "@reactive-resume/schema";
import { pageSizeMap } from "@reactive-resume/utils";

import type { Block, Inline } from "./html";
import { colorHex, htmlBlocks, safeLink, textParagraph } from "./html";

export type DocumentModel = {
  title: string;
  pages: Block[][];
  font: string;
  fontSize: number;
  lineHeight: number;
  color: string;
  primary: string;
  width: number;
  height: number;
  margin: number;
  underlineLinks: boolean;
};

type Entry = {
  title: string;
  subtitle?: string;
  date?: string;
  details?: string[];
  summary?: string;
  keywords?: string[];
  url?: ResumeURL;
};

const website = (url: ResumeURL): Inline[] =>
  url.href ? [{ text: url.label || url.href, href: safeLink(url.href) }] : [];
const joinRuns = (parts: Inline[][], separator = " · "): Inline[] =>
  parts
    .filter((part) => part.length > 0)
    .flatMap((part, index) => (index === 0 ? part : [{ text: separator }, ...part]));

function entry(item: Entry): Block[] {
  const title = [item.title, item.subtitle].filter(Boolean).join(" — ");
  const details = [item.date, ...(item.details ?? [])].filter(Boolean).join(" · ");
  return [
    ...(title ? [textParagraph(title, { heading: 3 })] : []),
    ...(details ? [{ kind: "paragraph" as const, runs: [{ text: details, italic: true }] }] : []),
    ...htmlBlocks(item.summary ?? ""),
    ...(item.keywords?.length ? [textParagraph(item.keywords.join(", "))] : []),
    ...(item.url?.href ? [{ kind: "paragraph" as const, runs: website(item.url) }] : []),
  ];
}

function items<T extends { visible: boolean }>(
  section: { name: string; visible: boolean; items: T[] },
  render: (item: T) => Block[],
): Block[] {
  if (!section.visible) return [];
  const content = section.items.filter((item) => item.visible).flatMap((item) => render(item));
  if (content.length === 0) return [];
  return [
    ...(section.name.trim() ? [textParagraph(section.name, { heading: 2 })] : []),
    ...content,
  ];
}

function compact(name: string, description: string, keywords: string[] = [], level = 0): Block[] {
  return [
    {
      kind: "paragraph",
      runs: [
        { text: name, bold: true },
        ...(description ? [{ text: ` — ${description}` }] : []),
        ...(level > 0 ? [{ text: ` (${level}/5)` }] : []),
        ...(keywords.length > 0 ? [{ text: `: ${keywords.join(", ")}` }] : []),
      ],
    },
  ];
}

function sectionBlocks(id: string, data: ResumeData): Block[] {
  const s = data.sections;
  switch (id) {
    case "summary": {
      const content = s.summary.visible ? htmlBlocks(s.summary.content) : [];
      return content.length > 0
        ? [
            ...(s.summary.name.trim() ? [textParagraph(s.summary.name, { heading: 2 })] : []),
            ...content,
          ]
        : [];
    }
    case "experience": {
      return items(s.experience, (v) =>
        entry({
          title: v.company,
          subtitle: v.position,
          date: v.date,
          details: [v.location],
          summary: v.summary,
          url: v.url,
        }),
      );
    }
    case "education": {
      return items(s.education, (v) =>
        entry({
          title: v.institution,
          subtitle: [v.studyType, v.area].filter(Boolean).join(", "),
          date: v.date,
          details: [v.score],
          summary: v.summary,
          url: v.url,
        }),
      );
    }
    case "projects": {
      return items(s.projects, (v) =>
        entry({
          title: v.name,
          subtitle: v.description,
          date: v.date,
          summary: v.summary,
          keywords: v.keywords,
          url: v.url,
        }),
      );
    }
    case "volunteer": {
      return items(s.volunteer, (v) =>
        entry({
          title: v.organization,
          subtitle: v.position,
          date: v.date,
          details: [v.location],
          summary: v.summary,
          url: v.url,
        }),
      );
    }
    case "awards": {
      return items(s.awards, (v) =>
        entry({
          title: v.title,
          subtitle: v.awarder,
          date: v.date,
          summary: v.summary,
          url: v.url,
        }),
      );
    }
    case "certifications": {
      return items(s.certifications, (v) =>
        entry({ title: v.name, subtitle: v.issuer, date: v.date, summary: v.summary, url: v.url }),
      );
    }
    case "publications": {
      return items(s.publications, (v) =>
        entry({
          title: v.name,
          subtitle: v.publisher,
          date: v.date,
          summary: v.summary,
          url: v.url,
        }),
      );
    }
    case "references": {
      return items(s.references, (v) =>
        entry({ title: v.name, subtitle: v.description, summary: v.summary, url: v.url }),
      );
    }
    case "skills": {
      return items(s.skills, (v) => compact(v.name, v.description, v.keywords, v.level));
    }
    case "languages": {
      return items(s.languages, (v) => compact(v.name, v.description, [], v.level));
    }
    case "interests": {
      return items(s.interests, (v) => compact(v.name, "", v.keywords));
    }
    case "profiles": {
      return items(s.profiles, (v) => [
        {
          kind: "paragraph",
          runs: [
            { text: `${v.network} — `, bold: true },
            { text: v.username, href: safeLink(v.url.href) },
          ],
        },
      ]);
    }
    default: {
      if (!id.startsWith("custom.")) return [];
      const customId = id.slice("custom.".length);
      if (!Object.prototype.hasOwnProperty.call(s.custom, customId)) return [];
      return items(s.custom[customId], (v) =>
        entry({
          title: v.name,
          subtitle: v.description,
          date: v.date,
          details: [v.location],
          summary: v.summary,
          keywords: v.keywords,
          url: v.url,
        }),
      );
    }
  }
}

const positive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

/** Only printable fields are visited: notes, the photo and sections outside the layout never enter the model. */
export function buildResumeDocument(data: ResumeData): DocumentModel {
  const { basics, metadata } = data;
  const header: Block[] = [
    ...(basics.name ? [textParagraph(basics.name, { heading: 1 })] : []),
    ...(basics.headline ? [textParagraph(basics.headline)] : []),
  ];
  const contacts = joinRuns([
    ...(basics.email ? [[{ text: basics.email, href: safeLink(`mailto:${basics.email}`) }]] : []),
    ...(basics.phone ? [[{ text: basics.phone, href: safeLink(`tel:${basics.phone}`) }]] : []),
    ...(basics.location ? [[{ text: basics.location }]] : []),
    website(basics.url),
    ...basics.customFields.map((field) => {
      const href = safeLink(field.value);
      return [
        {
          text: href
            ? field.name || field.value
            : [field.name, field.value].filter(Boolean).join(": "),
          ...(href ? { href } : {}),
        },
      ];
    }),
  ]);
  if (contacts.length > 0) header.push({ kind: "paragraph", runs: contacts });
  const pages = data.metadata.layout.map((page) =>
    page.slice(0, 2).flatMap((column) => column.flatMap((id) => sectionBlocks(id, data))),
  );
  if (pages.length === 0) pages.push([]);
  pages[0].unshift(...header);
  const preset = pageSizeMap[metadata.page.format];
  const width = metadata.page.custom.enabled
    ? positive(metadata.page.custom.width, preset.width)
    : preset.width;
  const height = metadata.page.custom.enabled
    ? positive(metadata.page.custom.height, preset.height)
    : preset.height;
  return {
    title: basics.name,
    pages,
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Font family names are not translated.
    font: metadata.typography.font.family || "Calibri",
    fontSize: Math.min(96, positive(metadata.typography.font.size, 11)),
    lineHeight: Math.min(5, positive(metadata.typography.lineHeight, 1.5)),
    color: colorHex(metadata.theme.text) ?? "000000",
    primary: colorHex(metadata.theme.primary) ?? "000000",
    width: metadata.page.orientation === "landscape" ? height : width,
    height: metadata.page.orientation === "landscape" ? width : height,
    margin: Math.min(
      Number.isFinite(metadata.page.margin) ? Math.max(0, metadata.page.margin) : 18,
      Math.min(width, height) / 3,
    ),
    underlineLinks: metadata.typography.underlineLinks,
  };
}
