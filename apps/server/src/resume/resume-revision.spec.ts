import fs from "node:fs/promises";
import path from "node:path";

import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { initializeLocalDatabase } from "../database/local-database";
import { writeResumeRevision } from "./resume-revision";

async function fixture() {
  const root = path.resolve("tmp/resume-revision-tests");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "profile-"));
  const datasourceUrl = `file:${path.join(directory, "data.db").replace(/\\/g, "/")}`;
  const first = new PrismaClient({ datasourceUrl });
  const second = new PrismaClient({ datasourceUrl });
  await initializeLocalDatabase(first);
  const original = await first.resume.create({
    data: {
      title: "Original",
      slug: "original",
      userId: "local-user-id",
      data: '{"text":"Original"}',
    },
  });
  return {
    first,
    second,
    original,
    async close() {
      await Promise.all([first.$disconnect(), second.$disconnect()]);
      const relative = path.relative(root, directory);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Unexpected temporary path");
      await fs.rm(directory, { recursive: true, force: true });
    },
  };
}

describe("SQLite resume revisions", () => {
  it("accepts exactly one of two concurrent writers and never mixes a body with another writer's metadata", async () => {
    const test = await fixture();
    try {
      const input = {
        id: test.original.id,
        userId: "local-user-id",
        expectedUpdatedAt: test.original.updatedAt,
      };
      const results = await Promise.allSettled([
        writeResumeRevision(test.first, {
          ...input,
          data: { title: "First", data: '{"text":"First"}' },
        }),
        writeResumeRevision(test.second, {
          ...input,
          data: { title: "Second", data: '{"text":"Second"}' },
        }),
      ]);
      const successes = results.filter((result) => result.status === "fulfilled");
      const failures = results.filter((result) => result.status === "rejected");
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        reason: { response: { code: "RESUME_VERSION_CONFLICT" }, status: 409 },
      });
      const stored = await test.first.resume.findUniqueOrThrow({ where: { id: input.id } });
      const acknowledged = successes[0].value;
      expect(stored).toEqual(acknowledged);
      expect(JSON.parse(stored.data)).toEqual({ text: stored.title });
      expect(stored.updatedAt.getTime()).toBeGreaterThan(test.original.updatedAt.getTime());
    } finally {
      await test.close();
    }
  });

  it("rejects unversioned old clients and guards lock and unlock with strictly increasing revisions", async () => {
    const test = await fixture();
    try {
      const input = { id: test.original.id, userId: "local-user-id" };
      await expect(
        writeResumeRevision(test.first, { ...input, data: { title: "Old client" } }),
      ).rejects.toMatchObject({ response: { code: "RESUME_VERSION_REQUIRED" }, status: 409 });
      const clock = vi.spyOn(Date, "now").mockReturnValue(test.original.updatedAt.getTime());
      try {
        const locked = await writeResumeRevision(test.first, {
          ...input,
          expectedUpdatedAt: test.original.updatedAt,
          data: { locked: true },
          allowLocked: true,
        });
        expect(locked.updatedAt.getTime()).toBe(test.original.updatedAt.getTime() + 1);
        await expect(
          writeResumeRevision(test.second, {
            ...input,
            expectedUpdatedAt: test.original.updatedAt,
            data: { data: "stale" },
          }),
        ).rejects.toBeInstanceOf(ConflictException);
        await expect(
          writeResumeRevision(test.second, {
            ...input,
            expectedUpdatedAt: locked.updatedAt,
            data: { data: "locked" },
          }),
        ).rejects.toMatchObject({ status: 400 });
        const unlocked = await writeResumeRevision(test.first, {
          ...input,
          expectedUpdatedAt: locked.updatedAt,
          data: { locked: false },
          allowLocked: true,
        });
        expect(unlocked.updatedAt.getTime()).toBe(locked.updatedAt.getTime() + 1);
        expect(unlocked.data).toBe(test.original.data);
        expect(unlocked.title).toBe("Original");
      } finally {
        clock.mockRestore();
      }
    } finally {
      await test.close();
    }
  });

  it("does not disclose or modify a different owner's row", async () => {
    const test = await fixture();
    try {
      await expect(
        writeResumeRevision(test.second, {
          id: test.original.id,
          userId: "other",
          expectedUpdatedAt: test.original.updatedAt,
          data: { title: "Wrong owner" },
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(await test.first.resume.findUnique({ where: { id: test.original.id } })).toEqual(
        test.original,
      );
    } finally {
      await test.close();
    }
  });

  it("changes the content clock only for different data and follows the acknowledged revision when the system clock moves backwards", async () => {
    const test = await fixture();
    try {
      const future = new Date("2099-01-01T00:00:00Z");
      const before = await test.first.resume.update({
        where: { id: test.original.id },
        data: { updatedAt: future, editedAt: future },
      });
      const same = await writeResumeRevision(test.first, {
        id: before.id,
        userId: before.userId,
        expectedUpdatedAt: before.updatedAt,
        data: { data: before.data, title: "Renamed" },
      });
      expect(same.editedAt).toEqual(future);
      const changed = await writeResumeRevision(test.first, {
        id: before.id,
        userId: before.userId,
        expectedUpdatedAt: same.updatedAt,
        data: { data: '{"text":"Changed"}' },
      });
      expect(changed.editedAt).toEqual(changed.updatedAt);
      expect(changed.updatedAt.getTime()).toBeGreaterThan(future.getTime());
    } finally {
      await test.close();
    }
  });
});
