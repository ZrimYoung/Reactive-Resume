import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { customFontUtils, FONT_UPLOAD_CONFIG } from "@reactive-resume/utils";
import { parse } from "opentype.js";

import { StorageService } from "../storage/storage.service";
import type { FontResponseDto, UploadFontDto } from "./dto/upload-font.dto";
import { VariableFontParserService } from "./variable-font-parser.service";

type UploadedFile = { originalname: string; buffer: Buffer; size: number };
type StoredFont = Pick<FontResponseDto, keyof FontResponseDto> & { fileName: string };

@Injectable()
export class FontService {
  private readonly logger = new Logger(FontService.name);
  private readonly pendingReads = new Map<string, Promise<StoredFont[]>>();

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly variableFontParser: VariableFontParserService,
  ) {}

  private getUserDirectory(userId: string) {
    if (!/^[\w-]+$/.test(userId)) throw new BadRequestException("Invalid font user");
    const storageRoot = process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");
    return path.resolve(storageRoot, userId, "fonts");
  }

  private currentUrl(userId: string, fileName: string) {
    const base = this.configService.get<string>("STORAGE_URL") ?? "http://localhost:3000";
    return new URL(`/api/storage/${userId}/fonts/${encodeURIComponent(fileName)}`, base).href;
  }

  private async storeMetadata(directory: string, font: StoredFont) {
    await fs.mkdir(directory, { recursive: true });
    const metadataPath = path.join(directory, `${font.fileName}.json`);
    const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(font), "utf8");
      await fs.rename(temporaryPath, metadataPath);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }

  async uploadFont(
    file: UploadedFile,
    userId: string,
    dto: UploadFontDto,
  ): Promise<FontResponseDto> {
    const validation = customFontUtils.validateFontFile(file);
    if (!validation.valid) throw new BadRequestException(validation.error);
    if (!dto.fontFamily.trim()) throw new BadRequestException("Font family is required");
    const directory = this.getUserDirectory(userId);
    const fileName = `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`;
    const url = await this.storageService.uploadObject(userId, "fonts", file.buffer, fileName);
    // Storage may normalize the filename. Keep its exact name beside the original family.
    const storedName = decodeURIComponent(path.basename(new URL(url).pathname));
    const font: StoredFont = {
      id: randomUUID(),
      fontFamily: dto.fontFamily.trim(),
      category: dto.category ?? "custom",
      originalName: file.originalname,
      fileSize: file.size,
      format: this.getFormatFromExtension(path.extname(storedName)),
      url: this.currentUrl(userId, storedName),
      uploadedAt: new Date().toISOString(),
      userId,
      variableFont: this.variableFontParser.parseFont(file.buffer, file.originalname),
      fileName: storedName,
    };
    await this.storeMetadata(directory, font);
    return font;
  }

  private async recoverLegacyFont(
    directory: string,
    fileName: string,
    userId: string,
  ): Promise<StoredFont> {
    const file = await fs.readFile(path.join(directory, fileName));
    let family = path
      .basename(fileName, path.extname(fileName))
      .replace(/[_-]?[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i, "")
      .replace(/_/g, " ");
    try {
      const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      const names = parse(buffer).names;
      family = names.fontFamily.en || Object.values(names.fontFamily)[0] || family;
    } catch {
      // Unsupported old uploads retain a filename fallback instead of disappearing.
    }
    const stats = await fs.stat(path.join(directory, fileName));
    const font: StoredFont = {
      id: randomUUID(),
      fontFamily: family || path.basename(fileName),
      category: "custom",
      originalName: fileName,
      fileSize: file.length,
      format: this.getFormatFromExtension(path.extname(fileName)),
      url: this.currentUrl(userId, fileName),
      uploadedAt: stats.birthtime.toISOString(),
      userId,
      variableFont: this.variableFontParser.parseFont(file, fileName),
      fileName,
    };
    await this.storeMetadata(directory, font);
    return font;
  }

  private async readStoredFonts(userId: string): Promise<StoredFont[]> {
    const directory = this.getUserDirectory(userId);
    await fs.mkdir(directory, { recursive: true });
    const entries = await fs.readdir(directory);
    const files = entries.filter((file) => this.validateFileFormat(file));
    const fonts: StoredFont[] = [];
    for (const fileName of files) {
      try {
        let font: StoredFont | undefined;
        try {
          const stored = JSON.parse(
            await fs.readFile(path.join(directory, `${fileName}.json`), "utf8"),
          ) as StoredFont;
          if (stored.fileName === fileName && stored.fontFamily && stored.id) font = stored;
        } catch {
          // Old versions stored only the binary. Recover once, then persist stable metadata.
        }
        font ??= await this.recoverLegacyFont(directory, fileName, userId);
        fonts.push({ ...font, userId, url: this.currentUrl(userId, fileName) });
      } catch (error) {
        this.logger.warn(`Unable to load font ${fileName}: ${(error as Error).message}`);
      }
    }
    return fonts;
  }

  async getUserFonts(userId: string): Promise<FontResponseDto[]> {
    // Return recovered metadata immediately and rebuild URLs for this launch's port.
    let pending = this.pendingReads.get(userId);
    if (!pending) {
      pending = this.readStoredFonts(userId).finally(() => {
        this.pendingReads.delete(userId);
      });
      this.pendingReads.set(userId, pending);
    }
    return pending;
  }

  async deleteFont(fontId: string, userId: string): Promise<void> {
    const fonts = await this.readStoredFonts(userId);
    const font = fonts.find((item) => item.id === fontId);
    if (!font) throw new NotFoundException("Font not found");
    const directory = this.getUserDirectory(userId);
    await fs.rm(path.join(directory, font.fileName), { force: true });
    await fs.rm(path.join(directory, `${font.fileName}.json`), { force: true });
  }

  private getFormatFromExtension(ext: string): string {
    const formats: Record<string, string> = {
      ".ttf": "truetype",
      ".otf": "opentype",
      ".woff": "woff",
      ".woff2": "woff2",
    };
    return formats[ext.toLowerCase()] ?? "truetype";
  }

  validateFileSize(fileSize: number): boolean {
    return fileSize <= FONT_UPLOAD_CONFIG.maxFileSize;
  }
  validateFileFormat(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase().slice(1);
    return (FONT_UPLOAD_CONFIG.allowedFormats as readonly string[]).includes(ext);
  }
}
