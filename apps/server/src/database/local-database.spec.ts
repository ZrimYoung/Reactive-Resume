import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { initializeLocalDatabase } from "./local-database";

describe("local desktop database", () => {
  it("creates a clean profile without a bundled database and keeps resumes unchanged on restart", async () => {
    const root = path.resolve("../../tmp/database-bootstrap-tests");
    await fs.mkdir(root, { recursive: true });
    const directory = await fs.mkdtemp(path.join(root, "profile-"));
    const prisma = new PrismaClient({ datasourceUrl: `file:${path.join(directory, "data.db").replace(/\\/g, "/")}` });
    try {
      await initializeLocalDatabase(prisma);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.resume.count()).toBe(0);
      const resume = await prisma.resume.create({ data: { title: "本地简历", slug: "local", userId: "local-user-id", data: '{"content":"保留正文"}' } });
      await initializeLocalDatabase(prisma);
      expect(await prisma.resume.findUnique({ where: { id: resume.id } })).toEqual(resume);
      expect(await prisma.user.count()).toBe(1);
    } finally {
      await prisma.$disconnect();
      if (!directory.startsWith(root + path.sep)) throw new Error("Unexpected temporary path");
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps legacy single-user resumes accessible when the seeded ID differs", async () => {
    const root = path.resolve("../../tmp/database-bootstrap-tests");
    await fs.mkdir(root, { recursive: true });
    const directory = await fs.mkdtemp(path.join(root, "legacy-"));
    const prisma = new PrismaClient({ datasourceUrl: `file:${path.join(directory, "data.db").replace(/\\/g, "/")}` });
    try {
      await initializeLocalDatabase(prisma);
      await prisma.user.update({ where: { id: "local-user-id" }, data: { id: "legacy-generated-id" } });
      const resume = await prisma.resume.create({ data: { title: "旧版本简历", slug: "legacy", userId: "legacy-generated-id", data: '{"keep":true}' } });
      await initializeLocalDatabase(prisma);
      expect(await prisma.resume.findUnique({ where: { id: resume.id } })).toMatchObject({ userId: "local-user-id", data: '{"keep":true}' });
    } finally {
      await prisma.$disconnect();
      if (!directory.startsWith(root + path.sep)) throw new Error("Unexpected temporary path");
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
