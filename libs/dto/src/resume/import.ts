import { resumeDataSchema } from "@reactive-resume/schema";
import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const importResumeSchema = z.object({
  title: z.string().optional(),
  slug: z.string().trim().min(1).optional(),
  autoNumber: z.boolean().optional(),
  visibility: z.enum(["public", "private"]).default("private").optional(),
  data: resumeDataSchema,
});

export class ImportResumeDto extends createZodDto(importResumeSchema) {}
