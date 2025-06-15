import { promises as fs } from "node:fs";
import path from "node:path";

import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createId } from "@paralleldrive/cuid2";
import slugify from "@sindresorhus/slugify";
import sharp from "sharp";

// 本地文件存储路径结构:
// "./storage/<userId>/<type>/<fileName>",
// where `userId` is a unique identifier (cuid) for the user,
// where `type` can either be "pictures", "previews" or "resumes",
// and where `fileName` is a unique identifier (cuid) for the file.

type ImageUploadType = "pictures" | "previews";
type DocumentUploadType = "resumes";
type FontUploadType = "fonts";
export type UploadType = ImageUploadType | DocumentUploadType | FontUploadType;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageRoot = "./storage";

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      // 确保存储目录存在
      await fs.mkdir(this.storageRoot, { recursive: true });
      this.logger.log("本地存储服务初始化成功");
    } catch (error) {
      this.logger.error("本地存储服务初始化失败", error);
      throw new InternalServerErrorException("存储服务初始化失败");
    }
  }

  async uploadObject(
    userId: string,
    type: UploadType,
    buffer: Buffer,
    filename: string = createId(),
  ): Promise<string> {
    let extension: string;
    let normalizedFilename: string;
    
    if (type === "resumes") {
      extension = "pdf";
      normalizedFilename = slugify(filename);
      if (!normalizedFilename) normalizedFilename = createId();
    } else if (type === "fonts") {
      // 对于字体文件，保留原始扩展名
      const originalExt = path.extname(filename);
      extension = originalExt.slice(1); // 移除点号
      normalizedFilename = slugify(path.basename(filename, originalExt));
      if (!normalizedFilename) normalizedFilename = createId();
    } else {
      extension = "jpg";
      normalizedFilename = slugify(path.basename(filename, path.extname(filename)));
      if (!normalizedFilename) normalizedFilename = createId();
    }

    const userDir = path.join(this.storageRoot, userId, type);
    const filepath = path.join(userDir, `${normalizedFilename}.${extension}`);
    
    // 构建完整的URL
    const storageUrl = this.configService.get<string>("STORAGE_URL") ?? "http://localhost:3000";
    const url = `${storageUrl}/api/storage/${userId}/${type}/${normalizedFilename}.${extension}`;

    try {
      // 确保用户目录存在
      await fs.mkdir(userDir, { recursive: true });

      if (type === "pictures" || type === "previews") {
        // 如果是图片，使用 sharp 调整大小
        buffer = await sharp(buffer)
          .resize({ width: 600, height: 600, fit: sharp.fit.outside })
          .jpeg({ quality: 80 })
          .toBuffer();
      }

      await fs.writeFile(filepath, buffer);
      this.logger.log(`文件上传成功: ${url}`);

      return url;
    } catch (error) {
      this.logger.error("文件上传失败", error);
      throw new InternalServerErrorException("文件上传失败");
    }
  }

  async deleteObject(userId: string, type: UploadType, filename: string): Promise<void> {
    let extension: string;
    if (type === "resumes") {
      extension = "pdf";
    } else if (type === "fonts") {
      // 对于字体文件，从文件名中提取扩展名
      const ext = path.extname(filename);
      extension = ext ? ext.slice(1) : "";
    } else {
      extension = "jpg";
    }

    const finalFilename = extension ? `${filename}.${extension}` : filename;
    const filepath = path.join(this.storageRoot, userId, type, finalFilename);

    try {
      await fs.unlink(filepath);
      this.logger.log(`文件删除成功: ${filepath}`);
    } catch (error) {
      this.logger.error(`文件删除失败: ${filepath}`, error);
      throw new InternalServerErrorException(`文件删除失败: ${filepath}`);
    }
  }

  async deleteFolder(prefix: string): Promise<void> {
    const folderPath = path.join(this.storageRoot, prefix);

    try {
      await fs.rm(folderPath, { recursive: true, force: true });
      this.logger.log(`文件夹删除成功: ${folderPath}`);
    } catch (error) {
      this.logger.error(`文件夹删除失败: ${folderPath}`, error);
      throw new InternalServerErrorException(`文件夹删除失败: ${folderPath}`);
    }
  }

  // 新增：获取文件内容
  async getObject(userId: string, type: UploadType, filename: string): Promise<Buffer> {
    let extension: string;
    if (type === "resumes") {
      extension = "pdf";
    } else if (type === "fonts") {
      // 对于字体文件，从文件名中提取扩展名
      const ext = path.extname(filename);
      extension = ext ? ext.slice(1) : "";
    } else {
      extension = "jpg";
    }
    
    // 检查文件名是否已经包含扩展名
    let finalFilename = filename;
    if (extension && !filename.endsWith(`.${extension}`)) {
      finalFilename = `${filename}.${extension}`;
    }
    
    const filepath = path.join(this.storageRoot, userId, type, finalFilename);

    try {
      return await fs.readFile(filepath);
    } catch (error) {
      this.logger.error(`文件读取失败: ${filepath}`, error);
      throw new InternalServerErrorException(`文件读取失败: ${filepath}`);
    }
  }
}
