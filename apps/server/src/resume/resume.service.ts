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
import slugify from "@sindresorhus/slugify";
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
        slug: createResumeDto.slug ?? slugify(createResumeDto.title),
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
      // 验证和标准化导入的数据
      const parsedData = importResumeDto.data;

      // 确保数据结构完整，合并默认值
      const safeData = {
        ...parsedData,
        basics: parsedData.basics || {},
        sections: parsedData.sections || {},
        metadata: {
          ...defaultMetadata,
          ...parsedData.metadata,
          css: {
            ...defaultMetadata.css,
            ...parsedData.metadata.css,
            visible: parsedData.metadata.css.visible ?? false,
          },
          typography: {
            ...defaultMetadata.typography,
            ...parsedData.metadata.typography,
          },
        },
      };

      // 使用schema验证
      const validatedData = resumeDataSchema.parse(safeData);
      const processedData = JSON.stringify(validatedData);

      this.logger.debug(
        `简历导入 - 数据验证成功: ${JSON.stringify({
          hasMetadata: !!validatedData.metadata,
          hasCss: !!validatedData.metadata.css,
          cssVisible: validatedData.metadata.css.visible,
          title: importResumeDto.title ?? randomTitle,
        })}`,
      );

      return this.prisma.resume.create({
        data: {
          userId,
          data: processedData,
          title: importResumeDto.title ?? randomTitle,
          slug: importResumeDto.slug ?? slugify(randomTitle),
        },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `简历导入失败: ${err.message}`,
        (err as unknown as { stack?: string }).stack,
      );
      throw new BadRequestException(`简历导入失败: ${err.message}`);
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

      // 验证和标准化数据
      let processedData: string | undefined;
      if (updateResumeDto.data) {
        try {
          // 如果是字符串，先解析再重新序列化以验证格式
          const parsedData =
            typeof updateResumeDto.data === "string"
              ? JSON.parse(updateResumeDto.data)
              : updateResumeDto.data;

          // 使用resumeDataSchema验证数据结构
          try {
            // 在验证之前，先确保数据结构完整
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

            // 使用schema验证
            const validatedData = resumeDataSchema.parse(safeData);
            processedData = JSON.stringify(validatedData);

            this.logger.debug(
              `简历更新 - 数据验证成功: ${JSON.stringify({
                hasMetadata: !!validatedData.metadata,
                hasCss: !!validatedData.metadata.css,
                cssVisible: validatedData.metadata.css.visible,
                cssValueLength: validatedData.metadata.css.value.length || 0,
              })}`,
            );
          } catch (validationError) {
            const e = validationError as Error;
            this.logger.error(`简历数据验证失败: ${e.message}`, e);

            // 如果验证失败，尝试使用原始数据但修复已知问题
            if (parsedData.metadata?.css) {
              const css = parsedData.metadata.css;
              parsedData.metadata.css = {
                value: typeof css.value === "string" ? css.value : "",
                visible: typeof css.visible === "boolean" ? css.visible : false,
              };
            }

            processedData = JSON.stringify(parsedData);
            this.logger.warn("使用修复后的数据而非验证通过的数据");
          }
        } catch (parseError) {
          const e = parseError as Error;
          this.logger.error(
            `简历数据解析失败: ${e.message}`,
            (e as unknown as { stack?: string }).stack,
          );
          throw new BadRequestException(`无效的简历数据格式: ${e.message}`);
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
        `简历更新失败: ${err.message}`,
        (err as unknown as { stack?: string }).stack,
      );

      if (err.code === "P2025") {
        throw new InternalServerErrorException("简历不存在或无权限访问");
      }

      if (err instanceof BadRequestException) {
        throw err;
      }

      throw new InternalServerErrorException(`简历更新失败: ${err.message}`);
    }
  }

  lock(userId: string, id: string, set: boolean) {
    return this.prisma.resume.update({
      data: { locked: set },
      where: { userId_id: { userId, id } },
    });
  }

  async remove(userId: string, id: string) {
    await Promise.all([
      // Remove files in storage, and their cached keys
      this.storageService.deleteObject(userId, "resumes", id),
      this.storageService.deleteObject(userId, "previews", id),
    ]);

    return this.prisma.resume.delete({ where: { userId_id: { userId, id } } });
  }

  async printResume(resume: ResumeDto, userId?: string) {
    const url = await this.printerService.printResume(resume);
    return url;
  }

  printPreview(resume: ResumeDto) {
    return this.printerService.printPreview(resume);
  }
}
