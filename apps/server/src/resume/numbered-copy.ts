import type { Prisma, PrismaClient } from "@prisma/client";
import { nextResumeCopy } from "@reactive-resume/utils";

/** The unique database constraint closes the gap between checking and creating a copy. */
export async function createNumberedCopy(
  prisma: Pick<PrismaClient, "resume">,
  data: Prisma.ResumeUncheckedCreateInput,
  autoNumber = false,
) {
  if (!autoNumber) return prisma.resume.create({ data });
  let identity = { title: data.title, slug: data.slug };
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await prisma.resume.findMany({
      where: { userId: data.userId },
      select: { title: true, slug: true },
    });
    if (existing.some((item) => item.title === identity.title || item.slug === identity.slug))
      identity = nextResumeCopy(identity, existing);
    try {
      return await prisma.resume.create({ data: { ...data, ...identity } });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2002"))
        throw error;
    }
  }
  throw new Error("Could not allocate an available copy name. Please try again.");
}
