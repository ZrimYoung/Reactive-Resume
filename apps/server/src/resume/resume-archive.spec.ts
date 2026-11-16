/* eslint-disable unicorn/no-await-expression-member -- Assertions inspect completed API responses. */
import fs from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import type { ResumeDto } from "@reactive-resume/dto";
import type { PrismaService } from "nestjs-prisma";
import { describe, expect, it, vi } from "vitest";

import { initializeLocalDatabase } from "../database/local-database";
import type { PrinterService } from "../printer/printer.service";
import type { StorageService } from "../storage/storage.service";
import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";
import { checkpoint } from "./resume-history";

async function fixture() {
  const root = path.resolve("tmp/resume-archive-tests");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "profile-"));
  const datasourceUrl = `file:${path.join(directory, "data.db").replace(/\\/g, "/")}`;
  const prisma = new PrismaClient({ datasourceUrl });
  const other = new PrismaClient({ datasourceUrl });
  await initializeLocalDatabase(prisma);
  const printer = { printResume: vi.fn(), printPreview: vi.fn() };
  const storage = {
    deleteObject: vi.fn().mockResolvedValue(null),
    deleteResumeArtifacts: vi.fn().mockResolvedValue(null),
  };
  const service = new ResumeService(
    prisma as PrismaService,
    printer as unknown as PrinterService,
    storage as unknown as StorageService,
  );
  let sequence = 0;
  const create = (title: string) =>
    service.create("local-user-id", { title, slug: `resume-${++sequence}` });
  const edit = (row: ResumeDto, name: string) =>
    service.update("local-user-id", row.id, {
      expectedUpdatedAt: row.updatedAt,
      data: { ...row.data, basics: { ...row.data.basics, name } },
    });
  return {
    prisma,
    other,
    service,
    printer,
    storage,
    create,
    edit,
    async close() {
      await Promise.all([prisma.$disconnect(), other.$disconnect()]);
      if (!directory.startsWith(`${root}${path.sep}`)) throw new Error("Unexpected temporary path");
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

describe("resume Trash", () => {
  it("keeps data and versions recoverable, hides trashed rows, rejects stale editors and printing, and restores the same id with a new revision", async () => {
    const test = await fixture();
    try {
      const row = await test.create("中文简历");
      const named = await test.service.namedVersion(
        "local-user-id",
        row.id,
        "投递前",
        row.updatedAt,
      );
      const trashed = await test.service.remove("local-user-id", row.id, row.updatedAt);
      expect(trashed.trashedAt).toBeInstanceOf(Date);
      expect(trashed.data).toEqual(row.data);
      expect(test.storage.deleteObject).not.toHaveBeenCalled();
      expect(
        await test.prisma.resumeVersion.findUnique({ where: { id: named.id } }),
      ).not.toBeNull();
      expect(await test.service.findAll("local-user-id")).toEqual([]);
      expect((await test.service.library("local-user-id", {}, true)).total).toBe(1);
      await expect(test.service.findOne(row.id, "local-user-id")).rejects.toMatchObject({
        status: 404,
      });
      await expect(test.edit(row, "Old editor")).rejects.toMatchObject({ status: 404 });
      await expect(new ResumeController(test.service).printResume(row.id)).rejects.toMatchObject({
        status: 404,
      });
      expect(test.printer.printResume).not.toHaveBeenCalled();
      const restored = await test.service.restore("local-user-id", row.id, trashed.updatedAt);
      expect(restored.id).toBe(row.id);
      expect(restored.trashedAt).toBeNull();
      expect(restored.updatedAt.getTime()).toBeGreaterThan(trashed.updatedAt.getTime());
      await expect(test.edit(row, "Still stale")).rejects.toMatchObject({ status: 409 });
      expect((await test.service.findOne(row.id, "local-user-id")).data).toEqual(row.data);
    } finally {
      await test.close();
    }
  });

  it("requires unlocked active state to trash, requires trashed state and CAS to purge, and never deletes shared pictures/fonts/title-named PDFs", async () => {
    const test = await fixture();
    try {
      const row = await test.create("原件");
      await expect(
        test.service.permanent("local-user-id", row.id, row.updatedAt),
      ).rejects.toMatchObject({ status: 404 });
      const locked = await test.service.lock("local-user-id", row.id, true, row.updatedAt);
      await expect(
        test.service.remove("local-user-id", row.id, locked.updatedAt),
      ).rejects.toMatchObject({ status: 400 });
      const unlocked = await test.service.lock("local-user-id", row.id, false, locked.updatedAt);
      const trashed = await test.service.remove("local-user-id", row.id, unlocked.updatedAt);
      await expect(
        test.service.permanent("local-user-id", row.id, unlocked.updatedAt),
      ).rejects.toMatchObject({ status: 409 });
      await test.service.permanent("local-user-id", row.id, trashed.updatedAt);
      expect(await test.prisma.resume.findUnique({ where: { id: row.id } })).toBeNull();
      expect(test.storage.deleteObject.mock.calls).toEqual([["local-user-id", "previews", row.id]]);
    } finally {
      await test.close();
    }
  });

  it("empties only trashed documents after explicit confirmation and preserves active rows", async () => {
    const test = await fixture();
    try {
      const active = await test.create("Active");
      const old = await test.create("Old");
      await test.service.namedVersion("local-user-id", old.id, "Old snapshot", old.updatedAt);
      await test.service.remove("local-user-id", old.id, old.updatedAt);
      await expect(test.service.emptyTrash("local-user-id", false)).rejects.toMatchObject({
        status: 400,
      });
      expect(await test.service.emptyTrash("local-user-id", true)).toEqual({ deleted: 1 });
      expect(await test.prisma.resumeVersion.count({ where: { resumeId: old.id } })).toBe(0);
      expect((await test.service.findAll("local-user-id")).map((row) => row.id)).toEqual([
        active.id,
      ]);
    } finally {
      await test.close();
    }
  });
});

describe("persistent resume checkpoints", () => {
  it("limits auto checkpoints by time, keeps named snapshots, previews without writes and restores with a before-restore checkpoint atomically", async () => {
    const test = await fixture();
    try {
      const first = await test.create("History");
      const second = await test.edit(first, "Second state");
      const named = await test.service.namedVersion(
        "local-user-id",
        first.id,
        "Second",
        second.updatedAt,
      );
      expect((await test.service.findOne(first.id, "local-user-id")).updatedAt).toEqual(
        second.updatedAt,
      );
      const third = await test.edit(second, "Third state");
      expect(
        await test.prisma.resumeVersion.count({ where: { resumeId: first.id, kind: "auto" } }),
      ).toBe(1);
      expect(
        (await test.service.version("local-user-id", first.id, named.id)).data.basics.name,
      ).toBe("Second state");
      expect((await test.service.findOne(first.id, "local-user-id")).data.basics.name).toBe(
        "Third state",
      );
      await expect(
        test.service.restoreVersion("local-user-id", first.id, named.id, second.updatedAt),
      ).rejects.toMatchObject({ status: 409 });
      expect(await test.prisma.resumeVersion.count({ where: { kind: "before-restore" } })).toBe(0);
      await test.prisma.$executeRawUnsafe(
        `CREATE TRIGGER fail_restore BEFORE UPDATE OF "data" ON "Resume" WHEN NEW."data" LIKE '%Second state%' BEGIN SELECT RAISE(ABORT, 'restore failed'); END`,
      );
      await expect(
        test.service.restoreVersion("local-user-id", first.id, named.id, third.updatedAt),
      ).rejects.toThrow();
      expect(await test.prisma.resumeVersion.count({ where: { kind: "before-restore" } })).toBe(0);
      expect((await test.service.findOne(first.id, "local-user-id")).data.basics.name).toBe(
        "Third state",
      );
      await test.prisma.$executeRawUnsafe("DROP TRIGGER fail_restore");
      const restored = await test.service.restoreVersion(
        "local-user-id",
        first.id,
        named.id,
        third.updatedAt,
      );
      expect(restored.data.basics.name).toBe("Second state");
      const before = (await test.service.versions("local-user-id", first.id)).find(
        (version) => version.kind === "before-restore",
      );
      if (!before) throw new Error("Expected a before-restore checkpoint");
      expect(
        (await test.service.version("local-user-id", first.id, before.id)).data.basics.name,
      ).toBe("Third state");
      const locked = await test.service.lock("local-user-id", first.id, true, restored.updatedAt);
      await expect(
        test.service.restoreVersion("local-user-id", first.id, named.id, locked.updatedAt),
      ).rejects.toMatchObject({ status: 400 });
      expect(await test.prisma.resumeVersion.count({ where: { kind: "before-restore" } })).toBe(1);
      await test.service.deleteVersion("local-user-id", first.id, before.id);
      expect(await test.prisma.resumeVersion.count({ where: { kind: "before-restore" } })).toBe(0);
    } finally {
      await test.close();
    }
  });

  it("rejects another resume's version and another owner's access, including restore paths", async () => {
    const test = await fixture();
    try {
      const first = await test.create("First");
      const second = await test.create("Second");
      const named = await test.service.namedVersion(
        "local-user-id",
        first.id,
        "Private",
        first.updatedAt,
      );
      await expect(test.service.version("other", first.id, named.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        test.service.version("local-user-id", second.id, named.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        test.service.restoreVersion("local-user-id", second.id, named.id, second.updatedAt),
      ).rejects.toMatchObject({ status: 404 });
      expect(await test.prisma.resumeVersion.count({ where: { kind: "before-restore" } })).toBe(0);
      expect((await test.service.findOne(second.id, "local-user-id")).data).toEqual(second.data);
    } finally {
      await test.close();
    }
  });

  it("caps auto history without deleting named or before-restore snapshots, and rejects rather than silently evicting named versions", async () => {
    const test = await fixture();
    try {
      const row = await test.create("Limits");
      await test.prisma.resumeVersion.createMany({
        data: Array.from({ length: 102 }, (_, i) => ({
          id: `auto-${i}`,
          resumeId: row.id,
          data: JSON.stringify(row.data),
          kind: "auto",
          createdAt: new Date(2020, 0, 1, 0, i),
        })),
      });
      await test.prisma.resumeVersion.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          id: `named-${i}`,
          resumeId: row.id,
          data: JSON.stringify(row.data),
          kind: "named",
          name: `Named ${i}`,
        })),
      });
      await test.prisma.$transaction((tx) =>
        checkpoint(tx, row.id, JSON.stringify({ ...row.data, notes: "new checkpoint" }), "auto"),
      );
      expect(await test.prisma.resumeVersion.count({ where: { kind: "auto" } })).toBe(100);
      await expect(
        test.service.namedVersion("local-user-id", row.id, "Another", row.updatedAt),
      ).rejects.toMatchObject({ status: 400 });
      expect(await test.prisma.resumeVersion.count({ where: { kind: "named" } })).toBe(200);
      await test.service.deleteVersion("local-user-id", row.id, "named-0");
      expect(
        await test.service.namedVersion(
          "local-user-id",
          row.id,
          "After explicit removal",
          row.updatedAt,
        ),
      ).toMatchObject({ name: "After explicit removal" });
    } finally {
      await test.close();
    }
  });
});

describe("offline library queries", () => {
  it("searches literal titles and tags, combines tag filters, orders and paginates summaries without sending resume bodies", async () => {
    const test = await fixture();
    try {
      const a = await test.create("中文工程师");
      const b = await test.create("Alpha");
      const c = await test.create("100% Growth");
      await test.service.update("local-user-id", a.id, {
        expectedUpdatedAt: a.updatedAt,
        tags: ["前端", "英文", "英文"],
      });
      await test.service.update("local-user-id", b.id, {
        expectedUpdatedAt: b.updatedAt,
        tags: ["前端"],
      });
      const filtered = await test.service.library("local-user-id", { tag: ["前端", "英文"] });
      expect(filtered.total).toBe(1);
      expect(filtered.items[0]).toMatchObject({
        id: a.id,
        tags: ["前端", "英文"],
        template: a.data.metadata.template,
        userId: "local-user-id",
      });
      expect(filtered.items[0]).not.toHaveProperty("data");
      expect((await test.service.library("local-user-id", { q: "工程师" })).total).toBe(1);
      expect(
        (await test.service.library("local-user-id", { q: "%" })).items.map((row) => row.id),
      ).toEqual([c.id]);
      expect((await test.service.library("local-user-id", { q: "' OR 1=1 --" })).total).toBe(0);
      const page = await test.service.library("local-user-id", {
        sort: "name",
        order: "asc",
        pageSize: "1",
        page: "2",
      });
      expect(page.total).toBe(3);
      expect(page.items.map((row) => row.id)).toEqual([b.id]);
      expect(() => test.service.library("local-user-id", { pageSize: "0" })).toThrow(
        "Invalid library filters",
      );
      expect(() => test.service.library("local-user-id", { sort: "data" })).toThrow(
        "Invalid library filters",
      );
      const edited = await test.prisma.resume.findUniqueOrThrow({ where: { id: a.id } });
      expect(edited.editedAt).toEqual(a.editedAt);
      expect(await test.prisma.resumeVersion.count()).toBe(0);
      await test.prisma.resume.update({
        where: { id: a.id },
        data: { createdAt: new Date("2000-01-01"), editedAt: new Date("2003-01-01") },
      });
      await test.prisma.resume.update({
        where: { id: b.id },
        data: { createdAt: new Date("2002-01-01"), editedAt: new Date("2000-01-01") },
      });
      await test.prisma.resume.update({
        where: { id: c.id },
        data: { createdAt: new Date("2001-01-01"), editedAt: new Date("2002-01-01") },
      });
      expect(
        (await test.service.library("local-user-id", { sort: "created", order: "desc" })).items.map(
          (row) => row.id,
        ),
      ).toEqual([b.id, c.id, a.id]);
      expect(
        (await test.service.library("local-user-id", { sort: "updated", order: "desc" })).items.map(
          (row) => row.id,
        ),
      ).toEqual([a.id, c.id, b.id]);
    } finally {
      await test.close();
    }
  });
});
