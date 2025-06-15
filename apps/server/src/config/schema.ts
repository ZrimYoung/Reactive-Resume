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

  // Session Secret (用于会话管理)
  SESSION_SECRET: z.string().default("local-session-secret-key-for-development"),

  // PDF Generation (现在使用本地 Puppeteer)
  CHROME_URL: z.string().optional().default("http://localhost:6173"),
  CHROME_IGNORE_HTTPS_ERRORS: z
    .string()
    .optional()
    .default("true")
    .transform((s) => s !== "false" && s !== "0"),
});

export type Config = z.infer<typeof configSchema>;
