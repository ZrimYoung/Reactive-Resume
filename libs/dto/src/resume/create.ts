import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const createResumeSchema = z.object({
  title: z.string().min(1),
  // 允许 Unicode/中文 slug；后端若未提供 slug 会根据标题生成
  slug: z.string().trim().min(1).optional(),
});

export class CreateResumeDto extends createZodDto(createResumeSchema) {}
