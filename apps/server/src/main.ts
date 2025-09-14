import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";

import { AppModule } from "./app.module";
import type { Config } from "./config/schema";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === "development" ? ["debug"] : ["error", "warn", "log"],
  });

  const configService = app.get(ConfigService<Config>);

  const publicUrl = configService.getOrThrow("PUBLIC_URL");
  const isHTTPS = publicUrl.startsWith("https://");

  // CORS
  // 开发环境：基于 PUBLIC_URL 动态允许来源，并兼容常用本地端口
  const publicOrigin = (() => {
    try {
      return new URL(publicUrl).origin;
    } catch {
      return;
    }
  })();

  const allowedOrigins = isHTTPS
    ? [/^https:\/\/.+$/]
    : [publicOrigin, "http://localhost:5173", "http://localhost:3000"].filter(Boolean);

  app.enableCors({ origin: allowedOrigins as (string | RegExp)[] });

  // Helmet - enabled only in production
  if (isHTTPS)
    app.use(
      helmet({
        frameguard: { action: "deny" },
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
          },
        },
      }),
    );

  // Global Prefix
  const globalPrefix = "api";
  app.setGlobalPrefix(globalPrefix);

  // Enable Shutdown Hooks
  app.enableShutdownHooks();

  // Port
  const port = configService.get<number>("PORT") ?? 3000;

  await app.listen(port);

  Logger.log(`Server is up and running on port ${port}`, "Bootstrap");
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void bootstrap();
