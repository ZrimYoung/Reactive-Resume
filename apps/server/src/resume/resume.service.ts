import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CreateResumeDto, ImportResumeDto, ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import {
  defaultMetadata,
  defaultResumeData,
  ResumeData,
  resumeDataSchema,
} from "@reactive-resume/schema";
import type { DeepPartial } from "@reactive-resume/utils";
import { generateRandomName } from "@reactive-resume/utils";
import deepmerge from "deepmerge";
import { PrismaService } from "nestjs-prisma";

import { PrinterService } from "@/server/printer/printer.service";

import { StorageService } from "../storage/storage.service";
import { createNumberedCopy } from "./numbered-copy";
import { ResumeArchive } from "./resume-archive";
import { checkpoint, normalizeTags } from "./resume-history";
import { libraryQuery, listLibrary } from "./resume-library";
import { decodeResume } from "./resume-record";
import { writeResumeRevision } from "./resume-revision";

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
    const normalized = input.trim().toLowerCase();
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
        editedAt: new Date(),
        template: data.metadata.template,
        slug:
          createResumeDto.slug ??
          (this.generateUnicodeSlug(createResumeDto.title) ||
            this.generateUnicodeSlug(generateRandomName())),
      },
    });

    return decodeResume(resume);
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

      const resume = await createNumberedCopy(
        this.prisma,
        {
          userId,
          data: processedData,
          tags: JSON.stringify(normalizeTags(importResumeDto.tags ?? [])),
          title: importResumeDto.title ?? randomTitle,
          editedAt: new Date(),
          template: validatedData.metadata.template,
          slug:
            importResumeDto.slug ??
            (this.generateUnicodeSlug(importResumeDto.title ?? randomTitle) ||
              this.generateUnicodeSlug(randomTitle)),
        },
        importResumeDto.autoNumber,
      );

      return decodeResume(resume);
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
      where: { userId, trashedAt: null },
      orderBy: { updatedAt: "desc" },
    });

    return resumes.map((resume) => decodeResume(resume));
  }

  async findOne(id: string, userId?: string) {
    const resume = await this.prisma.resume.findFirst({ where: { id, userId, trashedAt: null } });
    if (!resume) throw new NotFoundException("Resume does not exist or is in Trash");
    return decodeResume(resume);
  }

  async update(userId: string, id: string, updateResumeDto: UpdateResumeDto) {
    try {
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

      const lockOnly =
        updateResumeDto.locked !== undefined &&
        updateResumeDto.title === undefined &&
        updateResumeDto.slug === undefined &&
        updateResumeDto.tags === undefined &&
        updateResumeDto.data === undefined;
      const updatedResume = await writeResumeRevision(this.prisma, {
        id,
        userId,
        expectedUpdatedAt: updateResumeDto.expectedUpdatedAt,
        allowLocked: lockOnly,
        data: {
          title: updateResumeDto.title,
          slug: updateResumeDto.slug,
          locked: updateResumeDto.locked,
          ...(updateResumeDto.tags !== undefined && {
            tags: JSON.stringify(normalizeTags(updateResumeDto.tags)),
          }),
          ...(processedData && {
            template:
              (JSON.parse(processedData) as { metadata?: { template?: string } }).metadata
                ?.template ?? "onyx",
            editedAt: new Date(),
          }),
          ...(processedData && { data: processedData }),
        },
        afterWrite: async (tx, before, updated) => {
          if (before.data !== updated.data) await checkpoint(tx, id, before.data, "auto");
        },
      });

      return decodeResume(updatedResume);
    } catch (error) {
      const err = error as Error & { code?: string };
      this.logger.error(
        `Resume update failed: ${err.message}`,
        (err as unknown as { stack?: string }).stack,
      );

      if (err.code === "P2025") {
        throw new InternalServerErrorException("Resume does not exist or access denied");
      }

      if (err instanceof HttpException) {
        throw err;
      }

      throw new InternalServerErrorException(`Resume update failed: ${err.message}`);
    }
  }

  lock(userId: string, id: string, set: boolean, expectedUpdatedAt?: Date) {
    return this.update(userId, id, { locked: set, expectedUpdatedAt });
  }

  remove(userId: string, id: string, expectedUpdatedAt?: Date) {
    return new ResumeArchive(this.prisma).trash(userId, id, expectedUpdatedAt);
  }
  restore(userId: string, id: string, expectedUpdatedAt?: Date) {
    return new ResumeArchive(this.prisma).restore(userId, id, expectedUpdatedAt);
  }
  async permanent(userId: string, id: string, expectedUpdatedAt?: Date) {
    const result = await new ResumeArchive(this.prisma).permanent(userId, id, expectedUpdatedAt);
    // Preview IDs are unique; title-named PDFs, pictures and fonts may be shared by other versions.
    await this.storageService.deleteObject(userId, "previews", id).catch(() => {
      this.logger.warn("Could not remove the deleted resume preview");
    });
    await this.storageService.deleteResumeArtifacts(userId, id).catch(() => {
      this.logger.warn("Could not remove the deleted resume PDF artifacts");
    });
    return result;
  }
  async emptyTrash(userId: string, confirm: boolean) {
    const result = await new ResumeArchive(this.prisma).empty(userId, confirm);
    await Promise.all(
      result.ids.map(async (id) => {
        await this.storageService.deleteObject(userId, "previews", id).catch(() => {
          this.logger.warn("Could not remove a trashed resume preview");
        });
        await this.storageService.deleteResumeArtifacts(userId, id).catch(() => {
          this.logger.warn("Could not remove a trashed resume PDF artifact");
        });
      }),
    );
    return { deleted: result.deleted };
  }
  library(userId: string, query: Record<string, unknown>, trashed = false) {
    return listLibrary(this.prisma, userId, libraryQuery(query, trashed));
  }
  versions(userId: string, id: string) {
    return new ResumeArchive(this.prisma).versions(userId, id);
  }
  version(userId: string, id: string, versionId: string) {
    return new ResumeArchive(this.prisma).version(userId, id, versionId);
  }
  namedVersion(userId: string, id: string, name: string, expectedUpdatedAt?: Date) {
    return new ResumeArchive(this.prisma).named(userId, id, name, expectedUpdatedAt);
  }
  deleteVersion(userId: string, id: string, versionId: string) {
    return new ResumeArchive(this.prisma).deleteVersion(userId, id, versionId);
  }
  restoreVersion(userId: string, id: string, versionId: string, expectedUpdatedAt?: Date) {
    return new ResumeArchive(this.prisma).restoreVersion(userId, id, versionId, expectedUpdatedAt);
  }

  async printResume(resume: ResumeDto) {
    const url = await this.printerService.printResume(resume);
    return url;
  }

  printPreview(resume: ResumeDto) {
    return this.printerService.printPreview(resume);
  }
}
