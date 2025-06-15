import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { CreateResumeDto, ImportResumeDto, ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import { defaultResumeData, ResumeData } from "@reactive-resume/schema";
import type { DeepPartial } from "@reactive-resume/utils";
import { ErrorMessage, generateRandomName } from "@reactive-resume/utils";
import slugify from "@sindresorhus/slugify";
import deepmerge from "deepmerge";
import { PrismaService } from "nestjs-prisma";

import { PrinterService } from "@/server/printer/printer.service";

import { StorageService } from "../storage/storage.service";

@Injectable()
export class ResumeService {
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

    return this.prisma.resume.create({
      data: {
        data: JSON.stringify(data),
        userId,
        title: createResumeDto.title,
        slug: createResumeDto.slug ?? slugify(createResumeDto.title),
      },
    });
  }

  import(userId: string, importResumeDto: ImportResumeDto) {
    const randomTitle = generateRandomName();

    return this.prisma.resume.create({
      data: {
        userId,
        data: JSON.stringify(importResumeDto.data),
        title: importResumeDto.title ?? randomTitle,
        slug: importResumeDto.slug ?? slugify(randomTitle),
      },
    });
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

      const updatedResume = await this.prisma.resume.update({
        data: {
          title: updateResumeDto.title,
          slug: updateResumeDto.slug,
          data:
            typeof updateResumeDto.data === "string"
              ? updateResumeDto.data
              : JSON.stringify(updateResumeDto.data),
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
      if (error.code === "P2025") {
        Logger.error(error);
        throw new InternalServerErrorException(error);
      }
      throw error;
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
