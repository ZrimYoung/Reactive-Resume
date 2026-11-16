import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

const additions = {
  tags: "TEXT NOT NULL DEFAULT '[]'",
  template: "TEXT NOT NULL DEFAULT 'onyx'",
  trashedAt: "DATETIME",
  editedAt: "DATETIME",
};

/** VACUUM INTO makes a consistent copy, including WAL, before changing an existing profile. */
async function backupBeforeUpgrade(prisma: PrismaClient) {
  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table'",
  );
  if (!tables.some((table) => table.name === "Resume")) return;
  const columns = await prisma.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info("Resume")');
  if (
    Object.keys(additions).every((name) => columns.some((column) => column.name === name)) &&
    tables.some((table) => table.name === "ResumeVersion")
  )
    return;
  const databases =
    await prisma.$queryRawUnsafe<{ name: string; file: string }[]>("PRAGMA database_list");
  const file = databases.find((database) => database.name === "main")?.file;
  if (!file) throw new Error("Cannot back up the existing resume database before upgrading");
  const directory = path.join(path.dirname(file), "backups");
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(
    directory,
    `before-library-v1-${Date.now()}-${randomUUID()}.sqlite`,
  );
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
}

// Idempotent bootstrap for the single-user desktop database. Never copy a developer's DB into a release.
export async function initializeLocalDatabase(prisma: PrismaClient) {
  await backupBeforeUpgrade(prisma);
  await prisma.$transaction(
    async (database) => {
      await database.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL DEFAULT 'Local User',
      "username" TEXT NOT NULL DEFAULT 'local-user', "email" TEXT NOT NULL DEFAULT 'local@example.com',
      "locale" TEXT NOT NULL DEFAULT 'zh-CN', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL)`);
      await database.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")`,
      );
      await database.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`,
      );
      await database.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Resume" (
      "id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL, "slug" TEXT NOT NULL,
      "data" TEXT NOT NULL DEFAULT '{}', "locked" BOOLEAN NOT NULL DEFAULT false,
      "userId" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
      const columns = await database.$queryRawUnsafe<{ name: string }[]>(
        'PRAGMA table_info("Resume")',
      );
      for (const [name, definition] of Object.entries(additions)) {
        if (!columns.some((column) => column.name === name))
          await database.$executeRawUnsafe(
            `ALTER TABLE "Resume" ADD COLUMN "${name}" ${definition}`,
          );
      }
      if (!columns.some((column) => column.name === "editedAt"))
        await database.$executeRawUnsafe(
          'UPDATE "Resume" SET "editedAt" = "updatedAt" WHERE "editedAt" IS NULL',
        );
      if (!columns.some((column) => column.name === "template")) {
        const rows = await database.$queryRawUnsafe<{ id: string; data: string }[]>(
          'SELECT "id", "data" FROM "Resume"',
        );
        for (const row of rows) {
          let template = "onyx";
          try {
            const content = JSON.parse(row.data) as { metadata?: { template?: unknown } };
            if (typeof content.metadata?.template === "string")
              template = content.metadata.template;
          } catch {
            /* Keep malformed legacy content intact; only its thumbnail gets a fallback. */
          }
          await database.$executeRaw`UPDATE "Resume" SET "template" = ${template} WHERE "id" = ${row.id}`;
        }
      }
      await database.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ResumeVersion" (
      "id" TEXT NOT NULL PRIMARY KEY, "resumeId" TEXT NOT NULL, "data" TEXT NOT NULL,
      "kind" TEXT NOT NULL, "name" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
      await database.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "ResumeVersion_resumeId_createdAt_idx" ON "ResumeVersion"("resumeId", "createdAt")',
      );
      await database.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS "Resume_userId_trashedAt_editedAt_idx" ON "Resume"("userId", "trashedAt", "editedAt")',
      );
      await database.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Resume_userId_id_key" ON "Resume"("userId", "id")`,
      );
      await database.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "Resume_userId_slug_key" ON "Resume"("userId", "slug")`,
      );

      const local = await database.user.findUnique({ where: { id: "local-user-id" } });
      if (!local) {
        // Older single-user builds sometimes seeded an autogenerated ID; keep their resumes accessible.
        const users = await database.user.findMany({ take: 2, select: { id: true } });
        await (users.length === 1
          ? database.user.update({ where: { id: users[0].id }, data: { id: "local-user-id" } })
          : database.user.create({
              data: {
                id: "local-user-id",
                name: "本地用户",
                username: "local-user",
                email: "local@example.com",
                locale: "zh-CN",
              },
            }));
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
