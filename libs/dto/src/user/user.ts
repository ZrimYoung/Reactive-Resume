import { idSchema } from "@reactive-resume/schema";
import { dateSchema } from "@reactive-resume/utils";
import { createZodDto } from "nestjs-zod/dto";
import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[\w.-]+$/, {
    message: "Usernames can only contain letters, numbers, periods, hyphens, and underscores.",
  })
  .transform((value) => value.toLowerCase());

export const userSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(255),
  username: usernameSchema,
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  locale: z.string().default("en-US"),
  createdAt: dateSchema,
  updatedAt: dateSchema,
});

export class UserDto extends createZodDto(userSchema) {}

// 本地模式不需要密钥管理，简化为基本用户模式
export const userWithSecretsSchema = userSchema;

export class UserWithSecrets extends createZodDto(userWithSecretsSchema) {}
