import path from "node:path";

import { Module } from "@nestjs/common";
import { APP_PIPE } from "@nestjs/core";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ZodValidationPipe } from "nestjs-zod";

import { ConfigModule } from "./config/config.module";
import { DatabaseModule } from "./database/database.module";
import { FontModule } from "./font/font.module";
import { HealthModule } from "./health/health.module";
import { PrinterModule } from "./printer/printer.module";
import { ResumeModule } from "./resume/resume.module";
import { StorageModule } from "./storage/storage.module";
import { TranslationModule } from "./translation/translation.module";
import { UserModule } from "./user/user.module";

// 只在生产环境下配置静态文件服务，并兼容 Electron asar 打包路径
function resolveStaticRoot(relative: string): string {
  const electronResources = process.env.ELECTRON_RESOURCES_PATH;
  if (electronResources) {
    // 由 Electron 主进程传入的 resources 路径
    return path.join(electronResources, "app.asar.unpacked", "dist", "apps", relative);
  }
  // 本地/开发构建或非 Electron 运行时
  // eslint-disable-next-line unicorn/prefer-module
  return path.join(__dirname, "..", relative);
}

const staticFileModules =
  process.env.NODE_ENV === "production"
    ? [
        ServeStaticModule.forRoot({
          serveRoot: "/artboard",
          rootPath: resolveStaticRoot("artboard"),
        }),
        ServeStaticModule.forRoot({
          renderPath: "/*",
          rootPath: resolveStaticRoot("client"),
        }),
      ]
    : [];

@Module({
  imports: [
    // Core Modules
    ConfigModule,
    DatabaseModule,
    HealthModule,

    // Feature Modules
    UserModule,
    ResumeModule,
    StorageModule,
    FontModule,
    PrinterModule,
    TranslationModule,

    // Static Assets (仅在生产环境)
    ...staticFileModules,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
