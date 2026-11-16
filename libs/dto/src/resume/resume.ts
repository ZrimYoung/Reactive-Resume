import { defaultResumeData, idSchema, resumeDataSchema } from "@reactive-resume/schema";
import { dateSchema } from "@reactive-resume/utils";
import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

import { userSchema } from "../user";

export const resumeSchema = z.object({
  id: idSchema,
  title: z.string(),
  slug: z.string(),
  data: resumeDataSchema.default(defaultResumeData),
  locked: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  trashedAt: dateSchema.nullable().optional(),
  editedAt: dateSchema.nullable().optional(),
  userId: idSchema,
  user: userSchema.optional(),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export class ResumeDto extends createZodDto(resumeSchema) {}
