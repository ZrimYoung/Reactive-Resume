import type { Prisma, PrismaClient, Resume } from "@prisma/client";

import type { RevisionInput } from "./resume-transaction";
import { withResumeRevision } from "./resume-transaction";

/** SQLite compare-and-swap: the first statement takes the write lock, before reading the row. */
export async function writeResumeRevision(
  prisma: PrismaClient,
  input: RevisionInput & {
    data: Prisma.ResumeUpdateManyMutationInput;
    afterWrite?: (tx: Prisma.TransactionClient, before: Resume, updated: Resume) => Promise<void>;
  },
) {
  return withResumeRevision(prisma, input, async (tx, before, updatedAt) => {
    const nextData = typeof input.data.data === "string" ? input.data.data : input.data.data?.set;
    const contentChanged = nextData !== undefined && nextData !== before.data;
    const updated = await tx.resume.update({
      where: { id: before.id },
      data: { ...input.data, updatedAt, editedAt: contentChanged ? updatedAt : before.editedAt },
    });
    await input.afterWrite?.(tx, before, updated);
    return updated;
  });
}
