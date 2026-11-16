import { BadRequestException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

import { normalizeTags, parseTags } from "./resume-history";

export function libraryQuery(query: Record<string, unknown>, trashed = false) {
  if (
    [query.q, query.sort, query.order].some(
      (value) => value !== undefined && typeof value !== "string",
    )
  )
    throw new BadRequestException("Invalid library filters");
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const sort = typeof query.sort === "string" ? query.sort : "updated";
  const defaultOrder = sort === "name" ? "asc" : "desc";
  const order = typeof query.order === "string" ? query.order : defaultOrder;
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  if (
    q.length > 500 ||
    !["updated", "created", "name"].includes(sort) ||
    !["asc", "desc"].includes(order) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1_000_000 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new BadRequestException("Invalid library filters");
  const values = [query.tag, query.tags].flatMap((value) => {
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  });
  if (values.some((value) => typeof value !== "string"))
    throw new BadRequestException("Invalid tag filter");
  const tags = normalizeTags(values as string[]);
  return {
    q,
    sort,
    order,
    page,
    pageSize,
    tags,
    trashed: trashed || query.trashed === "1" || query.trashed === "true",
  };
}

export async function listLibrary(
  prisma: PrismaClient,
  userId: string,
  input: ReturnType<typeof libraryQuery>,
) {
  const filters = [
    Prisma.sql`r."userId" = ${userId}`,
    input.trashed ? Prisma.sql`r."trashedAt" IS NOT NULL` : Prisma.sql`r."trashedAt" IS NULL`,
  ];
  if (input.q)
    filters.push(
      Prisma.sql`(instr(lower(r."title"), lower(${input.q})) > 0 OR EXISTS (SELECT 1 FROM json_each(r."tags") t WHERE instr(lower(t.value), lower(${input.q})) > 0))`,
    );
  for (const tag of input.tags)
    filters.push(
      Prisma.sql`EXISTS (SELECT 1 FROM json_each(r."tags") t WHERE lower(t.value) = lower(${tag}))`,
    );
  const where = Prisma.join(filters, " AND ");
  let column = 'coalesce(r."editedAt", r."updatedAt")';
  if (input.sort === "name") column = 'lower(r."title")';
  if (input.sort === "created") column = 'r."createdAt"';
  const direction = input.order === "asc" ? "ASC" : "DESC";
  const order = Prisma.raw(`${column} ${direction}, r."id" ASC`);
  return prisma.$transaction(
    async (database) => {
      const [ids, counts] = await Promise.all([
        database.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT r."id" FROM "Resume" r WHERE ${where} ORDER BY ${order} LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`,
        ),
        database.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "Resume" r WHERE ${where}`,
        ),
      ]);
      const rows = await database.resume.findMany({
        where: { id: { in: ids.map((item) => item.id) }, userId },
        select: {
          id: true,
          userId: true,
          title: true,
          slug: true,
          locked: true,
          createdAt: true,
          updatedAt: true,
          editedAt: true,
          trashedAt: true,
          tags: true,
          template: true,
        },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const items = ids.flatMap(({ id }) => {
        const row = byId.get(id);
        return row ? [{ ...row, tags: parseTags(row.tags) }] : [];
      });
      const tagRows = await database.resume.findMany({
        where: { userId, trashedAt: input.trashed ? { not: null } : null },
        select: { tags: true },
      });
      const tags = [...new Set(tagRows.flatMap((row) => parseTags(row.tags)))].sort((a, b) =>
        a.localeCompare(b),
      );
      return {
        items,
        total: Number(counts[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
        tags,
      };
    },
    { maxWait: 10_000, timeout: 10_000 },
  );
}
