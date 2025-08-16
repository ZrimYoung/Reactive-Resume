import * as fs from "node:fs";
import path from "node:path";

import { Injectable } from "@nestjs/common";
import { HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus";

import { StorageService } from "../storage/storage.service";

@Injectable()
export class StorageHealthIndicator extends HealthIndicator {
  constructor(private readonly storageService: StorageService) {
    super();
  }

  isHealthy(): HealthIndicatorResult {
    try {
      // 检查本地存储目录是否存在（与 StorageService 保持一致）
      const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      return this.getStatus("storage", true);
    } catch (error: unknown) {
      return this.getStatus("storage", false, { message: (error as Error).message });
    }
  }
}
