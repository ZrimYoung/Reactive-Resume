import { Module } from "@nestjs/common";

import { StorageModule } from "../storage/storage.module";
import { FontController } from "./font.controller";
import { FontService } from "./font.service";
import { OfflineFontController } from "./offline-font.controller";
import { OfflineFontService } from "./offline-font.service";
import { VariableFontParserService } from "./variable-font-parser.service";

@Module({
  imports: [StorageModule],
  controllers: [FontController, OfflineFontController],
  providers: [FontService, VariableFontParserService, OfflineFontService],
  exports: [FontService, VariableFontParserService],
})
export class FontModule {}
