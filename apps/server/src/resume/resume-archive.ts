import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { resumeDataSchema } from "@reactive-resume/schema";

import { checkpoint, versionSummary } from "./resume-history";
import { decodeResume } from "./resume-record";
import { withResumeRevision } from "./resume-transaction";

export class ResumeArchive {
  constructor(private readonly prisma: PrismaClient) {}

  async active(userId: string, id: string) {
    const resume = await this.prisma.resume.findFirst({ where: { id, userId, trashedAt: null } });
    if (!resume) throw new NotFoundException("Resume does not exist or is in Trash");
    return resume;
  }

  async trash(userId: string, id: string, expectedUpdatedAt?: Date) {
    const row = await withResumeRevision(
      this.prisma,
      { id, userId, expectedUpdatedAt },
      (tx, before, updatedAt) =>
        tx.resume.update({ where: { id: before.id }, data: { trashedAt: new Date(), updatedAt } }),
    );
    return decodeResume(row);
  }

  async restore(userId: string, id: string, expectedUpdatedAt?: Date) {
    const row = await withResumeRevision(
      this.prisma,
      { id, userId, expectedUpdatedAt, trashed: true, allowLocked: true },
      (tx, before, updatedAt) =>
        tx.resume.update({ where: { id: before.id }, data: { trashedAt: null, updatedAt } }),
    );
    return decodeResume(row);
  }

  async permanent(userId: string, id: string, expectedUpdatedAt?: Date) {
    return withResumeRevision(
      this.prisma,
      { id, userId, expectedUpdatedAt, trashed: true, allowLocked: true },
      async (tx, before) => {
        await tx.resume.delete({ where: { id: before.id } });
        return { id };
      },
    );
  }

  async empty(userId: string, confirm: boolean) {
    if (!confirm) throw new BadRequestException("Explicit confirmation is required to empty Trash");
    // Keep uploaded pictures/fonts and generated files: a different document or version may reference them.
    const deleted = await this.prisma.$transaction(
      (tx) =>
        tx.$queryRaw<
          { id: string }[]
        >`DELETE FROM "Resume" WHERE "userId" = ${userId} AND "trashedAt" IS NOT NULL RETURNING "id"`,
    );
    return { deleted: deleted.length, ids: deleted.map((row) => row.id) };
  }

  async versions(userId: string, id: string) {
    await this.active(userId, id);
    return this.prisma.resumeVersion.findMany({
      where: { resumeId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: versionSummary,
    });
  }

  async version(userId: string, id: string, versionId: string) {
    await this.active(userId, id);
    const version = await this.prisma.resumeVersion.findFirst({
      where: { id: versionId, resumeId: id },
    });
    if (!version) throw new NotFoundException("Version does not exist for this resume");
    return { ...version, data: resumeDataSchema.parse(JSON.parse(version.data)) };
  }

  async named(userId: string, id: string, name: string, expectedUpdatedAt?: Date) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 80)
      throw new BadRequestException("Version names must contain 1–80 characters");
    return withResumeRevision(
      this.prisma,
      { id, userId, expectedUpdatedAt, allowLocked: true },
      (tx, before) => checkpoint(tx, id, before.data, "named", trimmed),
    );
  }

  async deleteVersion(userId: string, id: string, versionId: string) {
    await this.active(userId, id);
    const deleted = await this.prisma.resumeVersion.deleteMany({
      where: { id: versionId, resumeId: id, kind: { in: ["named", "before-restore"] } },
    });
    if (deleted.count !== 1)
      throw new NotFoundException(
        "Only a named or before-restore version of this resume can be deleted",
      );
    return { id: versionId };
  }

  async restoreVersion(userId: string, id: string, versionId: string, expectedUpdatedAt?: Date) {
    const row = await withResumeRevision(
      this.prisma,
      { id, userId, expectedUpdatedAt },
      async (tx, before, updatedAt) => {
        const version = await tx.resumeVersion.findFirst({
          where: { id: versionId, resumeId: id },
        });
        if (!version) throw new NotFoundException("Version does not exist for this resume");
        const parsed = resumeDataSchema.safeParse(JSON.parse(version.data));
        if (!parsed.success)
          throw new BadRequestException(
            "This old version cannot be restored in its current format",
          );
        await checkpoint(tx, id, before.data, "before-restore");
        return tx.resume.update({
          where: { id },
          data: {
            data: JSON.stringify(parsed.data),
            template: parsed.data.metadata.template,
            editedAt: updatedAt,
            updatedAt,
          },
        });
      },
    );
    return decodeResume(row);
  }
}
