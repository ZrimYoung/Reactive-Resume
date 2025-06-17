import { Module } from "@nestjs/common";

import { PrinterModule } from "@/server/printer/printer.module";

import { StorageModule } from "../storage/storage.module";
import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";

@Module({
  imports: [PrinterModule, StorageModule],
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
