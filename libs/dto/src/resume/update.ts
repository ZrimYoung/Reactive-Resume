import { dateSchema } from "@reactive-resume/utils";
import { createZodDto } from "nestjs-zod/dto";

import { resumeSchema } from "./resume";

export const updateResumeSchema = resumeSchema.partial().extend({
  // Kept optional in the schema so old clients receive the actionable 409 response.
  expectedUpdatedAt: dateSchema.optional(),
});

export class UpdateResumeDto extends createZodDto(updateResumeSchema) {}
