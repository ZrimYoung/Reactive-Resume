import path from "node:path";

import { Injectable } from "@nestjs/common";
import { fonts } from "@reactive-resume/utils";

import { OfflineFontCache } from "./offline-font-cache";

@Injectable()
export class OfflineFontService extends OfflineFontCache {
  constructor() {
    const storageRoot = process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");
    super({ root: path.join(storageRoot, "font-cache"), catalog: fonts });
  }
}
