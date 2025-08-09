import { z } from "zod";

export const defaultLayout = [
  [
    ["profiles", "summary", "experience", "education", "projects", "volunteer", "references"],
    ["skills", "interests", "certifications", "awards", "publications", "languages"],
  ],
];

// Schema
export const metadataSchema = z.object({
  template: z.string().default("rhyhorn"),
  layout: z.array(z.array(z.array(z.string()))).default(defaultLayout), // pages -> columns -> sections
  css: z.object({
    value: z.string().default("* {\n\toutline: 1px solid #000;\n\toutline-offset: 4px;\n}"),
    visible: z.boolean().default(false),
  }),
  page: z.object({
    margin: z.number().default(18),
    format: z.enum(["a3", "a4", "b4", "b5", "letter"]).default("a4"),
    orientation: z.enum(["portrait", "landscape"]).default("portrait"),
    custom: z
      .object({
        enabled: z.boolean().default(false),
        width: z.number().default(210), // mm
        height: z.number().default(297), // mm
      })
      .default({ enabled: false, width: 210, height: 297 }),
    options: z.object({
      breakLine: z.boolean().default(true),
      pageNumbers: z.boolean().default(true),
    }),
  }),
  theme: z.object({
    background: z.string().default("#ffffff"),
    text: z.string().default("#000000"),
    primary: z.string().default("#dc2626"),
  }),
  typography: z.object({
    font: z.object({
      family: z.string().default("IBM Plex Serif"),
      subset: z.string().default("latin"),
      variants: z.array(z.string()).default(["regular"]),
      size: z.number().default(14),
    }),
    lineHeight: z.number().default(1.5),
    hideIcons: z.boolean().default(false),
    underlineLinks: z.boolean().default(true),
  }),
  notes: z.string().default(""),
});

// Type
export type Metadata = z.infer<typeof metadataSchema>;

// Defaults
export const defaultMetadata: Metadata = {
  template: "rhyhorn",
  layout: defaultLayout,
  css: {
    value: "* {\n\toutline: 1px solid #000;\n\toutline-offset: 4px;\n}",
    visible: false,
  },
  page: {
    margin: 18,
    format: "a4",
    orientation: "portrait",
    custom: { enabled: false, width: 210, height: 297 },
    options: {
      breakLine: true,
      pageNumbers: true,
    },
  },
  theme: {
    background: "#ffffff",
    text: "#000000",
    primary: "#dc2626",
  },
  typography: {
    font: {
      family: "IBM Plex Serif",
      subset: "latin",
      variants: ["regular", "italic", "600"],
      size: 14,
    },
    lineHeight: 1.5,
    hideIcons: false,
    underlineLinks: true,
  },
  notes: "",
};
