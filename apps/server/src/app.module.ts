import path from "node:path";

import { HttpException, Module } from "@nestjs/common";
import { APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { ServeStaticModule } from "@nestjs/serve-static";
import { RavenInterceptor, RavenModule } from "nest-raven";
import { ZodValidationPipe } from "nestjs-zod";

import { ConfigModule } from "./config/config.module";
import { ContributorsModule } from "./contributors/contributors.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { PrinterModule } from "./printer/printer.module";
import { ResumeModule } from "./resume/resume.module";
import { StorageModule } from "./storage/storage.module";
import { TranslationModule } from "./translation/translation.module";
import { UserModule } from "./user/user.module";

// 只在生产环境下配置静态文件服务
const staticFileModules =
  process.env.NODE_ENV === "production"
    ? [
        // Static Assets for Artboard
        ServeStaticModule.forRoot({
          serveRoot: "/artboard",
          // eslint-disable-next-line unicorn/prefer-module
          rootPath: path.join(__dirname, "..", "artboard"),
        }),
        // Static Assets for Client
        ServeStaticModule.forRoot({
          renderPath: "/*",
          // eslint-disable-next-line unicorn/prefer-module
          rootPath: path.join(__dirname, "..", "client"),
        }),
      ]
    : [];

@Module({
  imports: [
    // Core Modules
    ConfigModule,
    DatabaseModule,
    RavenModule,
    HealthModule,

    // Feature Modules
    UserModule,
    ResumeModule,
    StorageModule,
    PrinterModule,
    TranslationModule,
    ContributorsModule,

    // Static Assets (仅在生产环境)
    ...staticFileModules,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_INTERCEPTOR,
      useValue: new RavenInterceptor({
        filters: [
          // Filter all HttpException with status code <= 500
          {
            type: HttpException,
            filter: (exception: HttpException) => exception.getStatus() < 500,
          },
        ],
      }),
    },
  ],
})
export class AppModule {}
