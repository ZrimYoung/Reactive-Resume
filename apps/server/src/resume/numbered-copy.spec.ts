import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { initializeLocalDatabase } from "../database/local-database";
import { createNumberedCopy } from "./numbered-copy";

describe("numbered copies in SQLite", () => {
  it("allocates distinct names for concurrent copies and never rewrites an explicit identity", async () => {
    const parent = path.resolve("tmp/numbered-copy-tests");
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(path.join(parent, "copy-"));
    const prisma = new PrismaClient({
      datasourceUrl: `file:${path.join(directory, "runtime.db").split(path.sep).join("/")}`,
    });
    try {
      await initializeLocalDatabase(prisma);
      const source = { userId: "local-user-id", title: "我的简历", slug: "我的简历", data: "{}" };
      await prisma.resume.create({ data: source });
      const request = { ...source, title: "我的简历 (2)", slug: "我的简历-copy-2" };
      const copies = await Promise.all([
        createNumberedCopy(prisma, request, true),
        createNumberedCopy(prisma, request, true),
      ]);
      expect(copies.map((item) => item.title).sort()).toEqual(["我的简历 (2)", "我的简历 (3)"]);
      expect(copies.map((item) => item.slug).sort()).toEqual([
        "我的简历-copy-2",
        "我的简历-copy-3",
      ]);
      await expect(createNumberedCopy(prisma, request, false)).rejects.toMatchObject({
        code: "P2002",
      });
      expect(await prisma.resume.count()).toBe(3);
    } finally {
      await prisma.$disconnect();
      assert.ok(directory.startsWith(`${parent}${path.sep}`), "Unexpected test directory");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
