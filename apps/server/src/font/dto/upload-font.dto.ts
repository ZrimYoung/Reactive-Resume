import type { VariableFontInfo } from "@reactive-resume/utils";
import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

const uploadFontSchema = z.object({
  fontFamily: z.string().min(1).max(100),
  category: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
});

export class UploadFontDto extends createZodDto(uploadFontSchema) {}

export class FontResponseDto {
  id!: string;
  fontFamily!: string;
  category!: string;
  originalName!: string;
  fileSize!: number;
  format!: string;
  url!: string;
  uploadedAt!: string;
  userId!: string;
  variableFont?: VariableFontInfo;
}
