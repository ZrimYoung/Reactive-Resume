import fs from "node:fs/promises";
import path from "node:path";

import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import type { PrismaService } from "nestjs-prisma";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initializeLocalDatabase } from "../database/local-database";
import { FontService } from "../font/font.service";
import { VariableFontParserService } from "../font/variable-font-parser.service";
import { StorageService } from "../storage/storage.service";

const root = path.resolve("tmp/history-assets-tests");
let directory: string;
let previousStorage: string | undefined;

beforeEach(async () => {
  await fs.mkdir(root, { recursive: true });
  directory = await fs.mkdtemp(path.join(root, "profile-"));
  previousStorage = process.env.STORAGE_DIR;
  process.env.STORAGE_DIR = directory;
});
afterEach(async () => {
  if (previousStorage === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorage;
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error("Unexpected temporary path");
  await fs.rm(directory, { recursive: true, force: true });
});

describe("assets referenced by saved resume versions", () => {
  it("stores same-named new photos under different IDs while old photo URLs keep their original bytes", async () => {
    const config = new ConfigService({ STORAGE_URL: "http://localhost:3000" });
    const storage = new StorageService(config);
    const first = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const second = await sharp({ create: { width: 2, height: 2, channels: 3, background: "blue" } })
      .png()
      .toBuffer();
    const originalUrl = await storage.uploadObject("local-user-id", "pictures", first, "头像.png");
    const originalName = path.basename(new URL(originalUrl).pathname);
    const originalBytes = await storage.getObject("local-user-id", "pictures", originalName);
    const newUrl = await storage.uploadObject("local-user-id", "pictures", second, "头像.png");
    expect(newUrl).not.toBe(originalUrl);
    expect(await storage.getObject("local-user-id", "pictures", originalName)).toEqual(
      originalBytes,
    );
    expect(
      await storage.getObject("local-user-id", "pictures", path.basename(new URL(newUrl).pathname)),
    ).not.toEqual(originalBytes);
    await fs.writeFile(
      path.join(directory, "local-user-id", "pictures", "legacy-photo.jpg"),
      originalBytes,
    );
    expect(await storage.getObject("local-user-id", "pictures", "legacy-photo.jpg")).toEqual(
      originalBytes,
    );
  });

  it("refuses font deletion for current, trashed and historical references, and permits deletion only once those references are gone", async () => {
    const prisma = new PrismaClient({
      datasourceUrl: `file:${path.join(directory, "data.db").replace(/\\/g, "/")}`,
    });
    try {
      await initializeLocalDatabase(prisma);
      const config = new ConfigService({ STORAGE_URL: "http://localhost:3000" });
      const storage = new StorageService(config);
      const service = new FontService(
        config,
        storage,
        new VariableFontParserService(),
        prisma as PrismaService,
      );
      const buffer = Buffer.from("font binary fixture");
      const font = await service.uploadFont(
        { originalname: "sample.woff", buffer, size: buffer.length },
        "local-user-id",
        { fontFamily: "History Font" },
      );
      const content = JSON.stringify({
        metadata: { typography: { font: { family: font.fontFamily } } },
      });
      const row = await prisma.resume.create({
        data: { title: "Reference", slug: "reference", userId: "local-user-id", data: content },
      });
      await expect(service.deleteFont(font.id, "local-user-id")).rejects.toThrow(
        "This font is used",
      );
      await prisma.resume.update({ where: { id: row.id }, data: { trashedAt: new Date() } });
      await expect(service.deleteFont(font.id, "local-user-id")).rejects.toThrow(
        "This font is used",
      );
      await prisma.resumeVersion.create({
        data: { resumeId: row.id, kind: "named", name: "Old font", data: content },
      });
      await prisma.resume.update({ where: { id: row.id }, data: { data: "{}" } });
      await expect(service.deleteFont(font.id, "local-user-id")).rejects.toThrow(
        "This font is used",
      );
      expect(await service.getUserFonts("local-user-id")).toHaveLength(1);
      await prisma.resumeVersion.deleteMany({ where: { resumeId: row.id } });
      await service.deleteFont(font.id, "local-user-id");
      expect(await service.getUserFonts("local-user-id")).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("cleans only a purged resume's ID-named PDFs and preserves legacy titles, shared assets and other resumes", async () => {
    const storage = new StorageService(new ConfigService({ STORAGE_URL: "http://localhost:3000" }));
    const resumes = path.join(directory, "local-user-id", "resumes");
    await fs.mkdir(resumes, { recursive: true });
    const owned = ["resume-id.pdf", `resume-id-${"a".repeat(64)}.pdf`];
    const kept = [
      "other.pdf",
      `other-${"a".repeat(64)}.pdf`,
      "Legacy title.pdf",
      "resume-id-not-a-hash.pdf",
    ];
    await Promise.all(
      [...owned, ...kept].map((name) => fs.writeFile(path.join(resumes, name), "pdf")),
    );
    await storage.deleteResumeArtifacts("local-user-id", "resume-id");
    const files = await fs.readdir(resumes);
    expect(files.sort()).toEqual(kept.sort());
  });
});
