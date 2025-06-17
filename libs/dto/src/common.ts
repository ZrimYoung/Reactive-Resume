import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

// 通用消息响应
export const messageSchema = z.object({
  message: z.string(),
});

export class MessageDto extends createZodDto(messageSchema) {}

// 功能标志响应（本地模式简化版）
// 本地模式下不需要认证相关的功能标志
export const featureSchema = z.object({
  // 移除认证相关标志，本地模式下这些都不适用
  // isSignupsDisabled: z.boolean().default(true),
  // isEmailAuthDisabled: z.boolean().default(true),
});

export class FeatureDto extends createZodDto(featureSchema) {}
