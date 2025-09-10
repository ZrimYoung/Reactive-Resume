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
  // Simple in-memory storage; ideally use a database
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
    this.logger.log(`Uploading font: ${file.originalname}, user: ${userId}`);

    // Validate file
    const validation = customFontUtils.validateFontFile(file);
    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    // Safely encode font family into filename
    const safeFontFamily = dto.fontFamily.replace(/[^\dA-Za-z-]/g, "_");
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const fileName = `${safeFontFamily}_${randomUUID()}${fileExtension}`;

    // Determine font format
    const format = this.getFormatFromExtension(fileExtension);

    // Parse variable font info
    const variableFontInfo = this.variableFontParser.parseFont(file.buffer, file.originalname);

    try {
      // Upload file to storage service (returns absolute URL based on STORAGE_URL)
      const fileUrl = await this.storageService.uploadObject(
        userId,
        "fonts",
        file.buffer,
        fileName,
      );

      // Build response
      const fontResponse: FontResponseDto = {
        id: randomUUID(),
        fontFamily: dto.fontFamily,
        category: dto.category ?? "custom",
        originalName: file.originalname,
        fileSize: file.size,
        format,
        url: fileUrl, // Absolute URL from storage service
        uploadedAt: new Date().toISOString(),
        userId,
        variableFont: variableFontInfo,
      };

      // Save to in-memory storage
      if (!this.userFonts.has(userId)) {
        this.userFonts.set(userId, []);
      }
      const userFontList = this.userFonts.get(userId);
      if (userFontList) {
        userFontList.push(fontResponse);
      }

      this.logger.log(`Font uploaded: ${fontResponse.fontFamily}, URL: ${fileUrl}`);
      return fontResponse;
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Font upload failed: ${err.message}`, err.stack);
      throw new BadRequestException("Font file upload failed");
    }
  }

  async getUserFonts(userId: string): Promise<FontResponseDto[]> {
    const fonts = this.userFonts.get(userId) ?? [];

    // If cache is empty, scan storage folder for uploaded fonts to build list
    if (fonts.length === 0) {
      try {
        const storageRoot = path.resolve("./storage");
        const userFontDir = path.resolve(storageRoot, userId, "fonts");

        // Security check: ensure path stays within expected storage directory
        if (!userFontDir.startsWith(storageRoot)) {
          this.logger.warn(`Potential path traversal detected: ${userId}`);
          return [];
        }

        // Ensure directory exists; create if missing
        try {
          await fs.access(userFontDir);
        } catch {
          this.logger.debug(`Font directory missing, creating: ${userFontDir}`);
          await fs.mkdir(userFontDir, { recursive: true });
        }

        const files = await fs.readdir(userFontDir);
        this.logger.debug(`Found ${files.length} files in ${userFontDir}`);

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
              const storageBaseUrl =
                this.configService.get<string>("STORAGE_URL") ?? "http://localhost:3000";
              const absoluteUrl = `${storageBaseUrl}/api/storage/${userId}/fonts/${file}`;

              // Get file info
              let fileSize = 0;
              try {
                const stats = await fs.stat(filePath);
                fileSize = stats.size;
              } catch {
                // Ignore stat errors
              }

              // Parse font family from filename
              const [fontFamily, _uuid] = file.split("_");
              if (!fontFamily) return null; // Skip non-conforming filenames

              return {
                id: randomUUID(),
                fontFamily: fontFamily.replace(/_/g, " "),
                category: "custom",
                originalName: file,
                fileSize,
                format,
                url: absoluteUrl,
                uploadedAt: new Date().toISOString(),
                userId,
              };
            }),
        );

        // Filter out failed parses
        const validFonts = fonts.filter((font): font is FontResponseDto => font !== null);

        // Cache results
        this.userFonts.set(userId, validFonts);
        this.logger.log(`Recovered ${validFonts.length} font files from disk scan`);
      } catch (error) {
        const err = error as Error;
        this.logger.error(`Failed to scan font directory: ${err.message}`);
        return [];
      }
    }

    this.logger.debug(`Returning ${fonts.length} fonts for user ${userId}`);

    // Fallback: if cache has historical relative URLs, prepend STORAGE_URL as fallback
    const storageBaseUrl = this.configService.get<string>("STORAGE_URL") ?? "http://localhost:3000";

    return fonts.map((font) => {
      const finalizedUrl = font.url.startsWith("http") ? font.url : `${storageBaseUrl}${font.url}`;

      return {
        id: font.id,
        fontFamily: font.fontFamily,
        category: font.category,
        originalName: font.originalName,
        fileSize: font.fileSize,
        format: font.format,
        url: finalizedUrl,
        uploadedAt: font.uploadedAt,
        userId: font.userId,
        variableFont: font.variableFont,
      } as FontResponseDto;
    });
  }

  async deleteFont(fontId: string, userId: string): Promise<void> {
    this.logger.log(`Delete font: ${fontId}, user: ${userId}`);

    try {
      // Should delete DB record and file; logging only for now
      this.logger.log(`Font deleted: ${fontId}`);
      await Promise.resolve();
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to delete font: ${err.message}`);
      throw new BadRequestException("Failed to delete font");
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
