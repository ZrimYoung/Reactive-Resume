/* eslint-disable unicorn/no-await-expression-member -- Keep assertions next to the awaited result they inspect. */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { Font } from "@reactive-resume/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { identifyFont, officialFontSource, OfflineFontCache } from "./offline-font-cache";

const prefix = path.resolve("tmp/offline-font-cache-tests-");
let directory: string;
const license = `Copyright Example font authors.\nSIL OPEN FONT LICENSE Version 1.1\n${"Fixture license notice. ".repeat(12)}`;
const catalog: Font[] = [
  {
    family: "Example Sans",
    category: "sans-serif",
    variants: ["regular", "700", "italic", "700italic"],
    subsets: ["latin"],
    files: Object.fromEntries(
      ["regular", "700", "italic", "700italic"].map((variant) => [
        variant,
        `http://fonts.gstatic.com/s/examplesans/v1/${variant}.ttf`,
      ]),
    ),
  },
];
const input = { family: "Example Sans", variants: ["regular"], subset: "latin" };
const sourceUrl = (source: Parameters<typeof fetch>[0]) => {
  if (typeof source === "string") return source;
  return source instanceof URL ? source.href : source.url;
};

function fontBytes(seed = 1) {
  const bytes = Buffer.alloc(64);
  bytes.writeUInt32BE(0x00_01_00_00, 0);
  bytes.writeUInt16BE(1, 4);
  bytes.write("head", 12);
  bytes.writeUInt32BE(28, 20);
  bytes.writeUInt32BE(36, 24);
  bytes[63] = seed;
  return bytes;
}

const online = () =>
  vi.fn<typeof fetch>((source) => {
    const url = sourceUrl(source);
    return Promise.resolve(
      url.startsWith("https://raw.githubusercontent.com/google/fonts/main/ofl/examplesans/")
        ? new Response(license)
        : new Response(new Uint8Array(fontBytes(url.length))),
    );
  });

beforeEach(async () => {
  await fs.mkdir(path.dirname(prefix), { recursive: true });
  directory = await fs.mkdtemp(prefix);
});
afterEach(async () => {
  if (!path.resolve(directory).startsWith(prefix)) throw new Error("Unexpected test cleanup path");
  await fs.rm(directory, { recursive: true, force: true });
});

describe("offline catalog font cache", () => {
  it("keeps missing-font status and CSS completely offline until Prepare is explicitly called", async () => {
    const fetcher = online();
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    expect((await cache.getStatus(input)).missingVariants).toEqual([
      "regular",
      "700",
      "italic",
      "700italic",
    ]);
    expect(await cache.getCss(input)).toEqual({ css: "", status: "missing" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("persists original license and hashes, and reuses normal, bold and italic faces after a fully offline restart", async () => {
    const fetcher = online();
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    expect((await cache.prepare(input)).status).toBe("ready");
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls.every(([, init]) => init?.redirect === "error" && init.signal)).toBe(
      true,
    );
    const manifests = await fs.readdir(path.join(directory, "families"));
    const manifest = JSON.parse(
      await fs.readFile(path.join(directory, "families", manifests[0]), "utf8"),
    ) as {
      license: { text: string; source: string; sha256: string };
      files: Record<string, { source: string; sha256: string }>;
    };
    expect(manifest.license.text).toBe(license);
    expect(manifest.license.sha256).toBe(createHash("sha256").update(license).digest("hex"));
    expect(manifest.license.source).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/google\/fonts\/main\/ofl\//,
    );
    expect(manifest.files.regular.source).toMatch(/^https:\/\/fonts\.gstatic\.com\/s\//);
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new Error("Network is offline"));
    const restarted = new OfflineFontCache({ root: directory, catalog, fetcher: offline });
    expect((await restarted.getStatus(input)).status).toBe("ready");
    const css = await restarted.getCss(input);
    expect(css.status).toBe("ready");
    expect(css.css).toContain("font-weight: 700; font-style: italic");
    expect(css.css).toContain('url("/api/fonts/offline/files/');
    expect(css.css).not.toMatch(/https?:\/\//);
    expect((await restarted.prepare(input)).status).toBe("ready");
    expect(offline).not.toHaveBeenCalled();
  });

  it("reports corrupt cached files as missing without network access, and repairs them only on explicit retry", async () => {
    const fetcher = online();
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    await cache.prepare(input);
    const files = await fs.readdir(path.join(directory, "files"));
    await fs.writeFile(path.join(directory, "files", files[0]), Buffer.from("damaged"));
    fetcher.mockClear();
    expect((await cache.getStatus(input)).status).toBe("missing");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await cache.prepare(input)).status).toBe("ready");
    expect(fetcher).toHaveBeenCalled();
  });

  it("does not mark a partially failed download ready and can retry after the connection returns", async () => {
    const fetcher = online();
    fetcher.mockImplementationOnce(() => Promise.reject(new TypeError("Network is offline")));
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    await expect(cache.prepare(input)).rejects.toThrow("Network is offline");
    expect((await cache.getStatus(input)).status).toBe("missing");
    expect((await cache.prepare(input)).status).toBe("ready");
  });

  it("refuses unknown families, variants, non-official sources, path traversal and HTTP-200 HTML font fallbacks", async () => {
    const fetcher = online();
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    await expect(cache.prepare({ family: "not in catalog" })).rejects.toThrow(
      "bundled Google Fonts",
    );
    await expect(cache.prepare({ ...input, variants: ["600"] })).rejects.toThrow("variant");
    await expect(cache.readFile("../../private.ttf")).rejects.toThrow("Unknown cached font");
    expect(() =>
      officialFontSource("https://fonts.gstatic.com.attacker.test/s/font.ttf"),
    ).toThrow();
    expect(() => officialFontSource("https://user:pass@fonts.gstatic.com/s/font.ttf")).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockImplementation((source) =>
      Promise.resolve(
        sourceUrl(source).includes("raw.githubusercontent")
          ? new Response(license)
          : new Response("<html>This is not a font file, despite returning HTTP 200.</html>"),
      ),
    );
    await expect(cache.prepare(input)).rejects.toThrow("not a valid font");
    expect((await cache.getStatus(input)).status).toBe("missing");
  });

  it("requires a real license notice and refuses oversized downloads before reading their bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not a license"));
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    await expect(cache.prepare(input)).rejects.toThrow("license could not be verified");
    fetcher.mockImplementation((source) =>
      Promise.resolve(
        sourceUrl(source).includes("raw.githubusercontent")
          ? new Response(license)
          : new Response("large", { headers: { "content-length": String(51 * 1024 * 1024) } }),
      ),
    );
    await expect(cache.prepare(input)).rejects.toThrow("size limit");
    expect((await cache.getStatus(input)).status).toBe("missing");
    expect(() => identifyFont(Buffer.alloc(64))).toThrow("not a valid font");
  });

  it("deduplicates the network work when two Prepare actions target the same family", async () => {
    const fetcher = online();
    const cache = new OfflineFontCache({ root: directory, catalog, fetcher });
    const results = await Promise.all([cache.prepare(input), cache.prepare(input)]);
    expect(results.every((result) => result.status === "ready")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});
