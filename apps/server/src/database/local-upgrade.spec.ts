import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { initializeLocalDatabase } from "./local-database";

async function legacyProfile() {
  const root = path.resolve("tmp/database-upgrade-tests");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "legacy-"));
  const prisma = new PrismaClient({
    datasourceUrl: `file:${path.join(directory, "data.db").replace(/\\/g, "/")}`,
  });
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL DEFAULT 'Local User', "username" TEXT UNIQUE NOT NULL DEFAULT 'local-user', "email" TEXT UNIQUE NOT NULL DEFAULT 'local@example.com', "locale" TEXT NOT NULL DEFAULT 'zh-CN', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "Resume" ("id" TEXT PRIMARY KEY,"title" TEXT NOT NULL,"slug" TEXT NOT NULL,"data" TEXT NOT NULL,"locked" BOOLEAN NOT NULL DEFAULT false,"userId" TEXT NOT NULL,"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`,
  );
  await prisma.$executeRaw`INSERT INTO "User" ("id", "updatedAt") VALUES ('local-user-id', ${new Date("2026-01-01")})`;
  const content = JSON.stringify({
    metadata: { template: "gengar" },
    text: "完整中文与照片/字体引用都保持不变",
  });
  await prisma.$executeRaw`INSERT INTO "Resume" ("id","title","slug","data","userId","updatedAt") VALUES ('legacy','旧简历','legacy',${content},'local-user-id',${new Date("2026-01-02")})`;
  return {
    prisma,
    directory,
    content,
    async close() {
      await prisma.$disconnect();
      if (!directory.startsWith(`${root}${path.sep}`)) throw new Error("Unexpected temporary path");
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

describe("incremental desktop database upgrade", () => {
  it("backs up committed WAL content before upgrading, preserves legacy data and revisions, and is idempotent", async () => {
    const test = await legacyProfile();
    try {
      await initializeLocalDatabase(test.prisma);
      const row = await test.prisma.resume.findUniqueOrThrow({ where: { id: "legacy" } });
      expect(row).toMatchObject({
        title: "旧简历",
        data: test.content,
        tags: "[]",
        template: "gengar",
        trashedAt: null,
        updatedAt: new Date("2026-01-02"),
        editedAt: new Date("2026-01-02"),
      });
      const backups = await fs.readdir(path.join(test.directory, "backups"));
      expect(backups).toHaveLength(1);
      const backup = new PrismaClient({
        datasourceUrl: `file:${path.join(test.directory, "backups", backups[0]).replace(/\\/g, "/")}`,
      });
      try {
        expect(
          await backup.$queryRawUnsafe('SELECT "data" FROM "Resume" WHERE "id" = \'legacy\''),
        ).toEqual([{ data: test.content }]);
        const columns = await backup.$queryRawUnsafe<{ name: string }[]>(
          'PRAGMA table_info("Resume")',
        );
        expect(columns.map((column) => column.name)).not.toContain("tags");
      } finally {
        await backup.$disconnect();
      }
      await initializeLocalDatabase(test.prisma);
      expect(await test.prisma.resume.findUniqueOrThrow({ where: { id: "legacy" } })).toEqual(row);
      expect(await fs.readdir(path.join(test.directory, "backups"))).toEqual(backups);
      expect(await test.prisma.resumeVersion.count()).toBe(0);
    } finally {
      await test.close();
    }
  });

  it("leaves the old schema and content untouched when the safety backup cannot be created", async () => {
    const test = await legacyProfile();
    try {
      await fs.writeFile(path.join(test.directory, "backups"), "blocked");
      await expect(initializeLocalDatabase(test.prisma)).rejects.toThrow();
      const columns = await test.prisma.$queryRawUnsafe<{ name: string }[]>(
        'PRAGMA table_info("Resume")',
      );
      expect(columns.map((column) => column.name)).not.toContain("tags");
      expect(await test.prisma.$queryRawUnsafe('SELECT "data" FROM "Resume"')).toEqual([
        { data: test.content },
      ]);
    } finally {
      await test.close();
    }
  });
});
