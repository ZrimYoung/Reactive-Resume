import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Font } from "@reactive-resume/utils";
import { z } from "zod";

const MAX_FONT_BYTES = 50 * 1024 * 1024;
const MAX_FAMILY_BYTES = 300 * 1024 * 1024;
const MAX_LICENSE_BYTES = 200_000;
const fileNamePattern = /^[\da-f]{64}\.(?:ttf|otf|woff|woff2)$/;
const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

const cachedFileSchema = z.object({
  source: z.string().url(),
  fileName: z.string().regex(fileNamePattern),
  sha256: z.string().regex(/^[\da-f]{64}$/),
  bytes: z.number().int().positive().max(MAX_FONT_BYTES),
  format: z.enum(["truetype", "opentype", "woff", "woff2"]),
});

const manifestSchema = z.object({
  version: z.literal(1),
  family: z.string(),
  preparedAt: z.string(),
  license: z.object({ source: z.string().url(), text: z.string().min(100), sha256: z.string() }),
  files: z.record(cachedFileSchema),
});

type CachedFile = z.infer<typeof cachedFileSchema>;
type Manifest = z.infer<typeof manifestSchema>;

export type OfflineFontRequest = { family: string; variants?: string[]; subset?: string };
export type OfflineFontStatus = {
  family: string;
  status: "ready" | "missing";
  requiredVariants: string[];
  cachedVariants: string[];
  missingVariants: string[];
  cssUrl: string;
  license?: { source: string; sha256: string };
};

type Options = { root: string; catalog: Font[]; fetcher?: typeof fetch };

/** Only bundled catalog files can be prepared. No caller-supplied URL is ever fetched. */
export function officialFontSource(source: string): string {
  const url = new URL(source);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.hostname !== "fonts.gstatic.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/s\/[\w/-]+\.(?:ttf|otf|woff2?)$/.test(url.pathname)
  )
    throw new Error("This catalog font source is not supported for offline preparation.");
  url.protocol = "https:";
  return url.href;
}

/** Reject HTTP-200 HTML fallbacks and truncated font containers before persisting anything. */
export function identifyFont(bytes: Buffer): { extension: string; format: CachedFile["format"] } {
  if (bytes.length < 48) throw new Error("The downloaded file is not a valid font.");
  const signature = bytes.toString("ascii", 0, 4);
  if (signature === "wOFF" || signature === "wOF2") {
    if (bytes.readUInt32BE(8) !== bytes.length || bytes.readUInt16BE(12) === 0)
      throw new Error("The downloaded font is incomplete.");
    if (signature === "wOFF" && 44 + bytes.readUInt16BE(12) * 20 > bytes.length)
      throw new Error("The downloaded font is incomplete.");
    return signature === "wOFF"
      ? { extension: "woff", format: "woff" }
      : { extension: "woff2", format: "woff2" };
  }
  if (bytes.readUInt32BE(0) !== 0x00_01_00_00 && signature !== "OTTO")
    throw new Error("The downloaded file is not a valid font.");
  const count = bytes.readUInt16BE(4);
  if (!count || 12 + count * 16 > bytes.length)
    throw new Error("The downloaded font is incomplete.");
  for (let index = 0; index < count; index++) {
    const table = 12 + index * 16;
    if (bytes.readUInt32BE(table + 8) + bytes.readUInt32BE(table + 12) > bytes.length)
      throw new Error("The downloaded font is incomplete.");
  }
  return signature === "OTTO"
    ? { extension: "otf", format: "opentype" }
    : { extension: "ttf", format: "truetype" };
}

function variantStyle(variant: string) {
  return {
    weight: Number.parseInt(variant, 10) || 400,
    style: variant.includes("italic") ? "italic" : "normal",
  };
}

function cssString(value: string) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, String.raw`\"`)
    .replace(/\r?\n/g, " ")}"`;
}

export class OfflineFontCache {
  private readonly root: string;
  private readonly catalog: Font[];
  private readonly fetcher: typeof fetch;
  private readonly preparing = new Map<string, Promise<OfflineFontStatus>>();

  constructor(options: Options) {
    this.root = path.resolve(options.root);
    this.catalog = options.catalog;
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  }

  private resolve(input: OfflineFontRequest) {
    const font = this.catalog.find((entry) => entry.family === input.family);
    if (!font) throw new Error("Choose a font from the bundled Google Fonts catalog.");
    if (input.subset && !font.subsets.includes(input.subset))
      throw new Error("Unknown font subset.");
    const selected = input.variants?.length
      ? input.variants
      : [font.files.regular ? "regular" : font.variants[0]];
    if (selected.length > 32 || selected.some((variant) => !font.files[variant]))
      throw new Error("Unknown font variant.");
    // Templates and rich text also use bold/italic, even when regular is selected in the picker.
    const variants = [
      ...new Set([
        ...selected,
        ...["regular", "700", "italic", "700italic"].filter((variant) => font.files[variant]),
      ]),
    ];
    const sources = Object.fromEntries(
      variants.map((variant) => [variant, officialFontSource(font.files[variant])]),
    );
    return { font, variants, sources };
  }

  private manifestPath(family: string) {
    return path.join(this.root, "families", `${sha256(family)}.json`);
  }

  private async readManifest(family: string): Promise<Manifest | undefined> {
    try {
      const manifest = manifestSchema.parse(
        JSON.parse(await fs.readFile(this.manifestPath(family), "utf8")),
      );
      if (manifest.family !== family || sha256(manifest.license.text) !== manifest.license.sha256)
        return;
      return manifest;
    } catch {
      return;
    }
  }

  private async validFiles(input: OfflineFontRequest) {
    const request = this.resolve(input);
    const manifest = await this.readManifest(input.family);
    const files = new Map<string, CachedFile>();
    const verified = new Map<string, Promise<Buffer>>();
    if (manifest) {
      await Promise.all(
        request.variants.map(async (variant) => {
          const file = manifest.files[variant] as CachedFile | undefined;
          if (!file || file.source !== request.sources[variant]) return;
          try {
            let check = verified.get(file.fileName);
            if (!check) {
              check = this.readFile(file.fileName);
              verified.set(file.fileName, check);
            }
            const bytes = await check;
            if (bytes.length === file.bytes && sha256(bytes) === file.sha256)
              files.set(variant, file);
          } catch {
            /* Corrupt or missing files are reported as missing, never fetched here. */
          }
        }),
      );
    }
    return { ...request, manifest, files };
  }

  async getStatus(input: OfflineFontRequest): Promise<OfflineFontStatus> {
    const { variants, files, manifest } = await this.validFiles(input);
    const cachedVariants = variants.filter((variant) => files.has(variant));
    const missingVariants = variants.filter((variant) => !files.has(variant));
    const query = new URLSearchParams({
      family: input.family,
      variants: (input.variants ?? []).join(","),
      subset: input.subset ?? "",
    });
    return {
      family: input.family,
      status: missingVariants.length > 0 ? "missing" : "ready",
      requiredVariants: variants,
      cachedVariants,
      missingVariants,
      cssUrl: `/api/fonts/offline/style.css?${query}`,
      ...(manifest && {
        license: { source: manifest.license.source, sha256: manifest.license.sha256 },
      }),
    };
  }

  async getCss(
    input: OfflineFontRequest,
  ): Promise<{ css: string; status: OfflineFontStatus["status"] }> {
    const { font, variants, files } = await this.validFiles(input);
    const rules = variants.flatMap((variant) => {
      const file = files.get(variant);
      if (!file) return [];
      const { weight, style } = variantStyle(variant);
      return [
        `@font-face { font-family: ${cssString(font.family)}; font-weight: ${weight}; font-style: ${style}; font-display: swap; src: url("/api/fonts/offline/files/${file.fileName}") format("${file.format}"); }`,
      ];
    });
    return { css: rules.join("\n"), status: files.size === variants.length ? "ready" : "missing" };
  }

  async readFile(fileName: string): Promise<Buffer> {
    if (!fileNamePattern.test(fileName)) throw new Error("Unknown cached font file.");
    const filePath = path.join(this.root, "files", fileName);
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > MAX_FONT_BYTES) throw new Error("Invalid cached font file.");
    const bytes = await fs.readFile(filePath);
    if (sha256(bytes) !== fileName.split(".")[0])
      throw new Error("Cached font integrity check failed.");
    identifyFont(bytes);
    return bytes;
  }

  prepare(input: OfflineFontRequest): Promise<OfflineFontStatus> {
    // Serialize requests for the same family so one manifest cannot overwrite another's variants.
    const prior = this.preparing.get(input.family);
    const promise = (
      prior
        ? prior.catch(() => {
            /* An earlier failure must not block a retry. */
          })
        : Promise.resolve()
    ).then(() => this.download(input));
    this.preparing.set(input.family, promise);
    void promise
      .finally(() => {
        if (this.preparing.get(input.family) === promise) this.preparing.delete(input.family);
      })
      .catch(() => {
        /* The caller receives the original rejection; this only observes cleanup. */
      });
    return promise;
  }

  private async fetchBytes(
    url: string,
    maxBytes: number,
    deadline: AbortSignal,
  ): Promise<Buffer | undefined> {
    const response = await this.fetcher(url, {
      redirect: "error",
      signal: AbortSignal.any([deadline, AbortSignal.timeout(12_000)]),
    });
    if (response.status === 404) return;
    if (!response.ok || response.redirected)
      throw new Error("The font source could not be reached. Check your connection and retry.");
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw new Error("The downloaded font exceeds the size limit.");
    if (!response.body) throw new Error("The font source returned an empty file.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      let chunk = await reader.read();
      while (!chunk.done) {
        length += chunk.value.length;
        if (length > maxBytes) throw new Error("The downloaded font exceeds the size limit.");
        chunks.push(chunk.value);
        chunk = await reader.read();
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }

  private async downloadLicense(
    family: string,
    deadline: AbortSignal,
  ): Promise<Manifest["license"]> {
    const slug = family.toLowerCase().replace(/[^\da-z]/g, "");
    for (const [directory, name] of [
      ["ofl", "OFL.txt"],
      ["apache", "LICENSE.txt"],
      ["ufl", "UFL.txt"],
    ]) {
      const source = `https://raw.githubusercontent.com/google/fonts/main/${directory}/${slug}/${name}`;
      const bytes = await this.fetchBytes(source, MAX_LICENSE_BYTES, deadline);
      if (!bytes) continue;
      const text = bytes.toString("utf8");
      if (
        text.length < 100 ||
        !/open font license|apache license|ubuntu font licen[cs]e/i.test(text)
      )
        throw new Error("The original font license could not be verified.");
      return { source, text, sha256: sha256(text) };
    }
    throw new Error(
      "The original font license is unavailable. Retry or upload a local font instead.",
    );
  }

  private async atomicWrite(filePath: string, bytes: Buffer | string) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, bytes);
      await fs.rename(temporary, filePath);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  private async download(input: OfflineFontRequest): Promise<OfflineFontStatus> {
    const existing = await this.validFiles(input);
    if (existing.files.size === existing.variants.length) return this.getStatus(input);
    const deadline = AbortSignal.timeout(45_000);
    const license =
      existing.manifest?.license ?? (await this.downloadLicense(input.family, deadline));
    const files: Record<string, CachedFile> = { ...existing.manifest?.files };
    let totalBytes = 0;
    const downloaded = new Map<string, CachedFile>();
    // Sequential preparation keeps large CJK families within a predictable memory budget.
    for (const variant of existing.variants) {
      if (existing.files.has(variant)) continue;
      const source = existing.sources[variant];
      let file = downloaded.get(source);
      if (!file) {
        const bytes = await this.fetchBytes(source, MAX_FONT_BYTES, deadline);
        if (!bytes)
          throw new Error(
            "This catalog font file is no longer available. Upload a local font instead.",
          );
        totalBytes += bytes.length;
        if (totalBytes > MAX_FAMILY_BYTES)
          throw new Error("This font family exceeds the offline cache size limit.");
        const { extension, format } = identifyFont(bytes);
        const hash = sha256(bytes);
        file = {
          source,
          sha256: hash,
          fileName: `${hash}.${extension}`,
          bytes: bytes.length,
          format,
        };
        await this.atomicWrite(path.join(this.root, "files", file.fileName), bytes);
        downloaded.set(source, file);
      }
      files[variant] = file;
    }
    const manifest: Manifest = {
      version: 1,
      family: input.family,
      preparedAt: new Date().toISOString(),
      license,
      files,
    };
    await this.atomicWrite(this.manifestPath(input.family), JSON.stringify(manifest, null, 2));
    return this.getStatus(input);
  }
}
