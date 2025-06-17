import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";

import { FontModule } from "../font/font.module";
import { StorageModule } from "../storage/storage.module";
import { PrinterService } from "./printer.service";

@Module({
  imports: [HttpModule, StorageModule, FontModule],
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
