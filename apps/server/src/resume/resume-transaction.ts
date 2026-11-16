import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient, Resume } from "@prisma/client";

export type RevisionInput = {
  id: string;
  userId: string;
  expectedUpdatedAt?: Date;
  allowLocked?: boolean;
  trashed?: boolean;
};

/** The first no-op UPDATE acquires SQLite's write lock before inspecting the original content. */
export async function withResumeRevision<T>(
  prisma: PrismaClient,
  input: RevisionInput,
  mutate: (tx: Prisma.TransactionClient, before: Resume, updatedAt: Date) => Promise<T>,
) {
  const expected = input.expectedUpdatedAt && new Date(input.expectedUpdatedAt);
  if (!expected || !Number.isFinite(expected.getTime()))
    throw new ConflictException({
      code: "RESUME_VERSION_REQUIRED",
      message:
        "Read the resume again before saving. This client did not provide its saved version.",
    });
  return prisma.$transaction(
    async (tx) => {
      const changed = await tx.resume.updateMany({
        where: {
          id: input.id,
          userId: input.userId,
          updatedAt: expected,
          trashedAt: input.trashed ? { not: null } : null,
          ...(input.allowLocked ? {} : { locked: false }),
        },
        data: { updatedAt: expected },
      });
      const before = await tx.resume.findUnique({
        where: { userId_id: { userId: input.userId, id: input.id } },
      });
      if (!before || Boolean(before.trashedAt) !== Boolean(input.trashed))
        throw new NotFoundException("Resume does not exist or is in Trash");
      if (changed.count !== 1) {
        if (
          before.updatedAt.getTime() === expected.getTime() &&
          before.locked &&
          !input.allowLocked
        )
          throw new BadRequestException("This resume is locked. Unlock it before saving changes.");
        throw new ConflictException({
          code: "RESUME_VERSION_CONFLICT",
          message:
            "This resume changed in another window. Keep your local changes as a copy before reloading.",
          updatedAt: before.updatedAt.toISOString(),
        });
      }
      return mutate(tx, before, new Date(Math.max(Date.now(), expected.getTime() + 1)));
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}
