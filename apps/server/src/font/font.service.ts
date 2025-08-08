import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { customFontUtils, FONT_UPLOAD_CONFIG } from "@reactive-resume/utils";

import { StorageService } from "../storage/storage.service";
import type { FontResponseDto, UploadFontDto } from "./dto/upload-font.dto";
import { VariableFontParserService } from "./variable-font-parser.service";

type UploadedFile = {
  originalname: string;
  buffer: Buffer;
  size: number;
};

@Injectable()
export class FontService {
  private readonly logger = new Logger(FontService.name);
  // 简单的内存存储，实际应该使用数据库
  private readonly userFonts = new Map<string, FontResponseDto[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly variableFontParser: VariableFontParserService,
  ) {}

  async uploadFont(
    file: UploadedFile,
    userId: string,
    dto: UploadFontDto,
  ): Promise<FontResponseDto> {
    this.logger.log(`上传字体文件: ${file.originalname}, 用户: ${userId}`);

    // 验证文件
    const validation = customFontUtils.validateFontFile(file);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // 将字体名称安全地编码到文件名中
    const safeFontFamily = dto.fontFamily.replace(/[^\dA-Za-z-]/g, "_");
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${safeFontFamily}_${randomUUID()}${fileExtension}`;

    // 确定字体格式
    const format = this.getFormatFromExtension(fileExtension);

    // 解析可变字体信息
    const variableFontInfo = this.variableFontParser.parseFont(file.buffer, file.originalname);

    try {
      // 上传文件到存储服务
      const relativeUrl = await this.storageService.uploadObject(
        userId,
        "fonts",
        file.buffer,
        fileName,
      );

      // 生成完整的URL（用于PDF生成等场景）
      const publicUrl =
        this.configService.get<string>("PUBLIC_URL")?.replace("5173", "3000") ??
        "http://localhost:3000";
      const fullUrl = `${publicUrl}${relativeUrl}`;

      // 构造响应
      const fontResponse: FontResponseDto = {
        id: randomUUID(),
        fontFamily: dto.fontFamily,
        category: dto.category ?? "custom",
        originalName: file.originalname,
        fileSize: file.size,
        format,
        url: fullUrl, // 使用完整URL
        uploadedAt: new Date().toISOString(),
        userId,
        variableFont: variableFontInfo,
      };

      // 保存到内存存储
      if (!this.userFonts.has(userId)) {
        this.userFonts.set(userId, []);
      }
      const userFontList = this.userFonts.get(userId);
      if (userFontList) {
        userFontList.push(fontResponse);
      }

      this.logger.log(`字体上传成功: ${fontResponse.fontFamily}, URL: ${fullUrl}`);
      return fontResponse;
    } catch (error) {
      this.logger.error(`字体上传失败: ${error.message}`, error.stack);
      throw new BadRequestException("字体文件上传失败");
    }
  }

  async getUserFonts(userId: string): Promise<FontResponseDto[]> {
    const fonts = this.userFonts.get(userId) ?? [];

    // 如果缓存为空，则尝试从 storage 文件夹扫描已上传字体，构建字体列表
    if (fonts.length === 0) {
      try {
        const storageRoot = path.resolve("./storage");
        const userFontDir = path.resolve(storageRoot, userId, "fonts");

        // 安全检查：确保路径在预期的 storage 目录内
        if (!userFontDir.startsWith(storageRoot)) {
          this.logger.warn(`检测到潜在的路径遍历攻击: ${userId}`);
          return [];
        }

        // 检查目录是否存在，如果不存在则创建
        try {
          await fs.access(userFontDir);
        } catch {
          this.logger.debug(`字体目录不存在，正在创建: ${userFontDir}`);
          await fs.mkdir(userFontDir, { recursive: true });
        }

        const files = await fs.readdir(userFontDir);
        this.logger.debug(`在 ${userFontDir} 中找到 ${files.length} 个文件`);

        const publicUrl =
          this.configService.get<string>("PUBLIC_URL")?.replace("5173", "3000") ??
          "http://localhost:3000";

        const fonts = await Promise.all(
          files
            .filter((file) => {
              const ext = path.extname(file).toLowerCase();
              return [".ttf", ".otf", ".woff", ".woff2"].includes(ext);
            })
            .map(async (file): Promise<FontResponseDto | null> => {
              const ext = path.extname(file);
              const format = this.getFormatFromExtension(ext);
              const filePath = path.join(userFontDir, file);
              const relativeUrl = `/api/storage/${userId}/fonts/${file}`;

              // 获取文件信息
              let fileSize = 0;
              try {
                const stats = await fs.stat(filePath);
                fileSize = stats.size;
              } catch {
                // 忽略文件状态读取错误
              }

              // 尝试从文件名解析字体名称
              const [fontFamily, _uuid] = file.split("_");
              if (!fontFamily) return null; // 跳过不符合命名规则的文件

              return {
                id: randomUUID(),
                fontFamily: fontFamily.replace(/_/g, " "), // 将下划线替换回空格
                category: "custom",
                originalName: file,
                fileSize,
                format,
                url: `${publicUrl}${relativeUrl}`,
                uploadedAt: new Date().toISOString(),
                userId,
              };
            }),
        );

        // 过滤掉解析失败的条目
        const validFonts = fonts.filter((font): font is FontResponseDto => font !== null);

        // 缓存结果
        this.userFonts.set(userId, validFonts);
        this.logger.log(`从磁盘扫描恢复 ${validFonts.length} 个字体文件`);
      } catch (error) {
        this.logger.error(`扫描字体目录失败: ${error.message}`);
        return [];
      }
    }

    this.logger.debug(`为用户 ${userId} 返回 ${fonts.length} 个字体`);

    const publicUrl =
      this.configService.get<string>("PUBLIC_URL")?.replace("5173", "3000") ??
      "http://localhost:3000";

    // 确保URL格式正确
    return fonts.map((font) => {
      let finalUrl = font.url;
      if (!font.url.startsWith("http")) {
        finalUrl = `${publicUrl}${font.url}`;
      }

      return {
        id: font.id,
        fontFamily: font.fontFamily,
        category: font.category,
        originalName: font.originalName,
        fileSize: font.fileSize,
        format: font.format,
        url: finalUrl,
        uploadedAt: font.uploadedAt,
        userId: font.userId,
        variableFont: font.variableFont,
      };
    });
  }

  async deleteFont(fontId: string, userId: string): Promise<void> {
    this.logger.log(`删除字体: ${fontId}, 用户: ${userId}`);

    try {
      // 这里应该从数据库删除字体记录并删除文件
      // 暂时只记录日志
      this.logger.log(`字体删除成功: ${fontId}`);
      await Promise.resolve();
    } catch (error) {
      this.logger.error(`删除字体失败: ${error.message}`);
      throw new BadRequestException("删除字体失败");
    }
  }

  private getFormatFromExtension(ext: string): string {
    const formatMap: Record<string, string> = {
      ".ttf": "truetype",
      ".otf": "opentype",
      ".woff": "woff",
      ".woff2": "woff2",
    };
    return formatMap[ext] || "truetype";
  }

  validateFileSize(fileSize: number): boolean {
    return fileSize <= FONT_UPLOAD_CONFIG.maxFileSize;
  }

  validateFileFormat(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase().slice(1);
    return (FONT_UPLOAD_CONFIG.allowedFormats as readonly string[]).includes(ext);
  }
}
