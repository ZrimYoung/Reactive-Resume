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
      // 检查本地存储目录是否存在
      const uploadsDir = path.join(process.cwd(), "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      return this.getStatus("storage", true);
    } catch (error: unknown) {
      return this.getStatus("storage", false, { message: (error as Error).message });
    }
  }
}
