import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { CreateResumeDto, ImportResumeDto, ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import {
  defaultMetadata,
  defaultResumeData,
  ResumeData,
  resumeDataSchema,
} from "@reactive-resume/schema";
import type { DeepPartial } from "@reactive-resume/utils";
import { ErrorMessage, generateRandomName } from "@reactive-resume/utils";
import deepmerge from "deepmerge";
import { PrismaService } from "nestjs-prisma";

import { PrinterService } from "@/server/printer/printer.service";

import { StorageService } from "../storage/storage.service";

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly printerService: PrinterService,
    private readonly storageService: StorageService,
  ) {}

  private generateUnicodeSlug(input: string): string {
    // 允许 Unicode：保留字母与数字，空白转为连字符，移除其它符号
    const normalized = (input ?? "").trim().toLowerCase();
    if (!normalized) return "";
    const dashed = normalized.replace(/\s+/g, "-");
    // 保留所有 Unicode 字母/数字/下划线/连字符
    return dashed.replace(/[^\p{L}\p{N}_-]+/gu, "");
  }

  async create(userId: string, createResumeDto: CreateResumeDto) {
    const { name, email } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const data = deepmerge(defaultResumeData, {
      basics: { name, email, picture: { url: "" } },
    } satisfies DeepPartial<ResumeData>);

    const resume = await this.prisma.resume.create({
      data: {
        data: JSON.stringify(data),
        userId,
        title: createResumeDto.title,
        slug:
          createResumeDto.slug ||
          this.generateUnicodeSlug(createResumeDto.title) ||
          this.generateUnicodeSlug(generateRandomName()),
      },
    });

    return {
      ...resume,
      data: typeof resume.data === "string" ? (JSON.parse(resume.data) as ResumeData) : resume.data,
    };
  }

  async import(userId: string, importResumeDto: ImportResumeDto) {
    const randomTitle = generateRandomName();

    try {
      // Validate and normalize imported data
      const parsedData = importResumeDto.data;

      // Ensure data structure completeness and merge defaults
      const safeData = {
        ...parsedData,
        basics: parsedData.basics,
        sections: parsedData.sections,
        metadata: {
          ...defaultMetadata,
          ...parsedData.metadata,
          css: {
            ...defaultMetadata.css,
            ...parsedData.metadata.css,
            visible: parsedData.metadata.css.visible,
          },
          typography: {
            ...defaultMetadata.typography,
            ...parsedData.metadata.typography,
          },
        },
      };

      // Validate with schema
      const validatedData = resumeDataSchema.parse(safeData);
      const processedData = JSON.stringify(validatedData);

      this.logger.debug(
        `Resume import - data validation success: ${JSON.stringify({
          hasMetadata: !!validatedData.metadata,
          hasCss: !!validatedData.metadata.css,
          cssVisible: validatedData.metadata.css.visible,
          title: importResumeDto.title ?? randomTitle,
        })}`,
      );

      const resume = await this.prisma.resume.create({
        data: {
          userId,
          data: processedData,
          title: importResumeDto.title ?? randomTitle,
          slug:
            importResumeDto.slug ||
            this.generateUnicodeSlug(importResumeDto.title ?? randomTitle) ||
            this.generateUnicodeSlug(randomTitle),
        },
      });

      return {
        ...resume,
        data: typeof resume.data === "string" ? JSON.parse(resume.data) : resume.data,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Resume import failed: ${err.message}`,
        (err as unknown as { stack?: string }).stack,
      );
      throw new BadRequestException(`Resume import failed: ${err.message}`);
    }
  }

  async findAll(userId: string) {
    const resumes = await this.prisma.resume.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return resumes.map((resume) => ({
      ...resume,
      data: typeof resume.data === "string" ? JSON.parse(resume.data) : resume.data,
    }));
  }

  async findOne(id: string, userId?: string) {
    const resume = await (userId
      ? this.prisma.resume.findUniqueOrThrow({ where: { userId_id: { userId, id } } })
      : this.prisma.resume.findUniqueOrThrow({ where: { id } }));

    return {
      ...resume,
      data: typeof resume.data === "string" ? JSON.parse(resume.data) : resume.data,
    };
  }

  async update(userId: string, id: string, updateResumeDto: UpdateResumeDto) {
    try {
      const { locked } = await this.prisma.resume.findUniqueOrThrow({
        where: { id },
        select: { locked: true },
      });

      if (locked) throw new BadRequestException(ErrorMessage.ResumeLocked);

      // Validate and normalize data
      let processedData: string | undefined;
      if (updateResumeDto.data) {
        try {
          // If string, parse then re-serialize for validation
          const parsedData =
            typeof updateResumeDto.data === "string"
              ? JSON.parse(updateResumeDto.data)
              : updateResumeDto.data;

          // Validate structure with resumeDataSchema
          try {
            // Ensure data structure completeness before validation
            const safeData = {
              ...parsedData,
              basics: parsedData.basics || {},
              sections: parsedData.sections || {},
              metadata: {
                ...defaultMetadata,
                ...parsedData.metadata,
                css: {
                  ...defaultMetadata.css,
                  ...parsedData.metadata?.css,
                  visible: parsedData.metadata?.css?.visible ?? false,
                },
                typography: {
                  ...defaultMetadata.typography,
                  ...parsedData.metadata?.typography,
                },
              },
            };

            // Validate with schema
            const validatedData = resumeDataSchema.parse(safeData);
            processedData = JSON.stringify(validatedData);

            this.logger.debug(
              `Resume update - data validation success: ${JSON.stringify({
                hasMetadata: !!validatedData.metadata,
                hasCss: !!validatedData.metadata.css,
                cssVisible: validatedData.metadata.css.visible,
                cssValueLength: validatedData.metadata.css.value.length || 0,
              })}`,
            );
          } catch (validationError) {
            const e = validationError as Error;
            this.logger.error(`Resume data validation failed: ${e.message}`, e);

            // On validation failure, fallback to original data but fix known issues
            if (parsedData.metadata?.css) {
              const css = parsedData.metadata.css;
              parsedData.metadata.css = {
                value: typeof css.value === "string" ? css.value : "",
                visible: typeof css.visible === "boolean" ? css.visible : false,
              };
            }

            processedData = JSON.stringify(parsedData);
            this.logger.warn("Using corrected data instead of validated data");
          }
        } catch (parseError) {
          const e = parseError as Error;
          this.logger.error(
            `Failed to parse resume data: ${e.message}`,
            (e as unknown as { stack?: string }).stack,
          );
          throw new BadRequestException(`Invalid resume data format: ${e.message}`);
        }
      }

      const updatedResume = await this.prisma.resume.update({
        data: {
          title: updateResumeDto.title,
          slug: updateResumeDto.slug,
          ...(processedData && { data: processedData }),
        },
        where: { userId_id: { userId, id } },
      });

      return {
        ...updatedResume,
        data:
          typeof updatedResume.data === "string"
            ? JSON.parse(updatedResume.data)
            : updatedResume.data,
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      this.logger.error(
        `Resume update failed: ${err.message}`,
        (err as unknown as { stack?: string }).stack,
      );

      if (err.code === "P2025") {
        throw new InternalServerErrorException("Resume does not exist or access denied");
      }

      if (err instanceof BadRequestException) {
        throw err;
      }

      throw new InternalServerErrorException(`Resume update failed: ${err.message}`);
    }
  }

  lock(userId: string, id: string, set: boolean) {
    return this.prisma.resume.update({
      data: { locked: set },
      where: { userId_id: { userId, id } },
    });
  }

  async remove(userId: string, id: string) {
    // 先获取记录以确定实际的 PDF 文件名（打印时使用 slugify(title) 作为文件名）
    const { title, slug } = await this.prisma.resume.findUniqueOrThrow({
      where: { userId_id: { userId, id } },
      select: { title: true, slug: true },
    });

    const titleSlug = this.generateUnicodeSlug(title);
    const candidates = [...new Set([titleSlug, slug, id].filter(Boolean))] as string[];

    await Promise.all([
      // 预览文件名固定为 id
      this.storageService.deleteObject(userId, "previews", id),
      // PDF 可能历史上用过不同命名：slugify(title) / slug / id，全部尝试删除；
      // StorageService.deleteObject 已忽略不存在文件（force: true）
      ...candidates.map((name) => this.storageService.deleteObject(userId, "resumes", name)),
    ]);

    return this.prisma.resume.delete({ where: { userId_id: { userId, id } } });
  }

  async printResume(resume: ResumeDto) {
    const url = await this.printerService.printResume(resume);
    return url;
  }

  printPreview(resume: ResumeDto) {
    return this.printerService.printPreview(resume);
  }
}
