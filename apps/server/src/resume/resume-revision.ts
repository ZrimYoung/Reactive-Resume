import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";

/** SQLite compare-and-swap: the first statement takes the write lock, before reading the row. */
export async function writeResumeRevision(
  prisma: PrismaClient,
  input: {
    id: string;
    userId: string;
    expectedUpdatedAt?: Date;
    data: Prisma.ResumeUpdateManyMutationInput;
    allowLocked?: boolean;
  },
) {
  const expected = input.expectedUpdatedAt && new Date(input.expectedUpdatedAt);
  if (!expected || !Number.isFinite(expected.getTime())) {
    throw new ConflictException({
      code: "RESUME_VERSION_REQUIRED",
      message:
        "Read the resume again before saving. This client did not provide its saved version.",
    });
  }

  return prisma.$transaction(
    async (tx) => {
      const changed = await tx.resume.updateMany({
        where: {
          id: input.id,
          userId: input.userId,
          updatedAt: expected,
          ...(input.allowLocked ? {} : { locked: false }),
        },
        data: {
          ...input.data,
          // Equal millisecond timestamps must not let another stale writer through.
          updatedAt: new Date(Math.max(Date.now(), expected.getTime() + 1)),
        },
      });
      const resume = await tx.resume.findUnique({
        where: { userId_id: { userId: input.userId, id: input.id } },
      });
      if (!resume) throw new NotFoundException("Resume does not exist or access denied");
      if (changed.count !== 1) {
        if (
          resume.updatedAt.getTime() === expected.getTime() &&
          resume.locked &&
          !input.allowLocked
        ) {
          throw new BadRequestException("This resume is locked. Unlock it before saving changes.");
        }
        throw new ConflictException({
          code: "RESUME_VERSION_CONFLICT",
          message:
            "This resume changed in another window. Keep your local changes as a copy before reloading.",
          updatedAt: resume.updatedAt.toISOString(),
        });
      }
      return resume;
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}
