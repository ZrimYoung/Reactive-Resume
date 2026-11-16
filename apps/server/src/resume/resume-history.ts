import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const versionSummary = { id: true, kind: true, name: true, createdAt: true } as const;
type Summary = Prisma.ResumeVersionGetPayload<{ select: typeof versionSummary }>;

export function checkpoint(
  tx: Prisma.TransactionClient,
  resumeId: string,
  data: string,
  kind: "named" | "before-restore",
  name?: string,
): Promise<Summary>;
export function checkpoint(
  tx: Prisma.TransactionClient,
  resumeId: string,
  data: string,
  kind: "auto",
  name?: string,
): Promise<Summary | null>;

/** Checkpoints describe acknowledged data, not pending editor recovery drafts. */
export async function checkpoint(
  tx: Prisma.TransactionClient,
  resumeId: string,
  data: string,
  kind: "auto" | "named" | "before-restore",
  name?: string,
) {
  if (kind === "named" && (await tx.resumeVersion.count({ where: { resumeId, kind } })) >= 200)
    throw new BadRequestException(
      "There are 200 named versions. Delete one before creating another.",
    );
  if (kind === "auto") {
    const latest = await tx.resumeVersion.findFirst({
      where: { resumeId, kind },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (latest && (latest.data === data || Date.now() - latest.createdAt.getTime() < 60_000))
      return null;
  }
  const version = await tx.resumeVersion.create({
    data: { resumeId, data, kind, name },
    select: versionSummary,
  });
  if (kind === "auto") {
    const expired = await tx.resumeVersion.findMany({
      where: { resumeId, kind },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 100,
      select: { id: true },
    });
    if (expired.length > 0)
      await tx.resumeVersion.deleteMany({
        where: { id: { in: expired.map((entry) => entry.id) }, resumeId, kind },
      });
  }
  return version;
}

export function parseTags(value: string): string[] {
  try {
    const tags: unknown = JSON.parse(value);
    return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeTags(tags: string[]) {
  const unique = new Map<string, string>();
  for (const raw of tags) {
    const value = raw.trim();
    if (!value || value.length > 40)
      throw new BadRequestException("Tags must contain 1–40 characters");
    unique.set(value.toLowerCase(), value);
  }
  if (unique.size > 20) throw new BadRequestException("A resume can have at most 20 tags");
  return [...unique.values()];
}
