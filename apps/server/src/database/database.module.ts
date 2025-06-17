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
          // 使用本地 SQLite 数据库，不再依赖环境变量
          datasourceUrl: "file:./local-resume.db" 
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
