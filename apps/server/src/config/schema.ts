import { z } from "zod";

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),

  // Ports
  PORT: z.coerce.number().default(3000),

  // URLs
  PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  STORAGE_URL: z.string().url().default("http://localhost:3000"),

  // Database (SQLite)
  DATABASE_URL: z.string().default("file:./local-resume.db"),

  // Authentication Secrets (简化为默认值)
  ACCESS_TOKEN_SECRET: z.string().default("local-access-token-secret-key-for-development"),
  REFRESH_TOKEN_SECRET: z.string().default("local-refresh-token-secret-key-for-development"),

  // PDF Generation (现在使用本地 Puppeteer，不再需要外部 Chrome)
  // 保留这些配置以保持向后兼容，但实际上已不使用
  CHROME_TOKEN: z.string().optional().default("local-chrome-token"),
  CHROME_URL: z.string().optional().default("http://localhost:6173"),
  CHROME_IGNORE_HTTPS_ERRORS: z
    .string()
    .optional()
    .default("true")
    .transform((s) => s !== "false" && s !== "0"),

  // Mail Server (本地模式简化)
  MAIL_FROM: z.string().includes("@").default("local@example.com"),

  // Feature Flags (本地模式默认配置)
  DISABLE_SIGNUPS: z
    .string()
    .default("true")
    .transform((s) => s !== "false" && s !== "0"),
  DISABLE_EMAIL_AUTH: z
    .string()
    .default("true")
    .transform((s) => s !== "false" && s !== "0"),
});

export type Config = z.infer<typeof configSchema>;
