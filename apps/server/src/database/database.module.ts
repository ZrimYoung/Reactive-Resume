import { Logger, Module } from "@nestjs/common";
import {
  loggingMiddleware,
  PrismaModule,
  PrismaService,
  providePrismaClientExceptionFilter,
} from "nestjs-prisma";

@Module({
  imports: [
    PrismaModule.forRootAsync({
      isGlobal: true,
      useFactory: () => ({
        prismaOptions: { 
          // 优先使用外部注入的 DATABASE_URL（Electron 主进程在生产态设置），否则回退到相对路径
          datasourceUrl: process.env.DATABASE_URL ?? "file:./local-resume.db"
        },
        middlewares: [
          loggingMiddleware({
            logLevel: "debug",
            logger: new Logger(PrismaService.name),
            logMessage: (query) =>
              `[Query] ${query.model}.${query.action} - ${query.executionTime}ms`,
          }),
        ],
      }),
    }),
  ],
  providers: [providePrismaClientExceptionFilter()],
})
export class DatabaseModule {}
