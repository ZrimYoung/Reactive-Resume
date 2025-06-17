import { Module } from "@nestjs/common";

import { StorageModule } from "../storage/storage.module";

import { FontController } from "./font.controller";
import { FontService } from "./font.service";
import { VariableFontParserService } from "./variable-font-parser.service";

@Module({
  imports: [StorageModule],
  controllers: [FontController],
  providers: [FontService, VariableFontParserService],
  exports: [FontService, VariableFontParserService],
})
export class FontModule {} 