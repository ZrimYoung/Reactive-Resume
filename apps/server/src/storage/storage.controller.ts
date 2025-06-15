import path from "node:path";

import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";

import { StorageService } from "./storage.service";

// 本地用户 ID 常量
const LOCAL_USER_ID = "local-user-id";

// 文件类型
type UploadedFileType = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
};

@ApiTags("Storage")
@Controller("storage")
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Put("image")
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(@UploadedFile("file") file: UploadedFileType) {
    if (!file.mimetype.startsWith("image")) {
      throw new BadRequestException(
        "The file you uploaded doesn't seem to be an image, please upload a file that ends in .jp(e)g or .png.",
      );
    }

    return this.storageService.uploadObject(LOCAL_USER_ID, "pictures", file.buffer, file.filename);
  }

  @Get(":userId/:type/:filename")
  async downloadFile(
    @Param("userId") userId: string,
    @Param("type") type: "pictures" | "previews" | "resumes" | "fonts",
    @Param("filename") filename: string,
    @Res() res: Response,
  ) {
    try {
      const buffer = await this.storageService.getObject(userId, type, filename);

      // --- 设置正确的 Content-Type ---
      let contentType = "application/octet-stream";
      switch (type) {
        case "resumes": {
          contentType = "application/pdf";
          break;
        }
        case "pictures":
        case "previews": {
          contentType = "image/jpeg";
          break;
        }
        case "fonts": {
          const ext = path.extname(filename).toLowerCase();
          const mimeMap: Record<string, string> = {
            ".ttf": "font/ttf",
            ".otf": "font/otf",
            ".woff": "font/woff",
            ".woff2": "font/woff2",
          };
          contentType = mimeMap[ext] || "font/ttf";
          break;
        }
        default: {
          break;
        }
      }

      res.setHeader("Content-Type", contentType);

      if (type === "resumes") {
        // 对于PDF，设置为附件下载，确保文件名正确
        const downloadFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
        res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
      }

      res.send(buffer);
    } catch {
      res.status(404).send("文件未找到");
    }
  }
}
