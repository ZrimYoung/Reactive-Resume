import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CreateResumeDto,
  importResumeSchema,
  ResumeDto,
  UpdateResumeDto,
} from "@reactive-resume/dto";
import { resumeDataSchema } from "@reactive-resume/schema";
import { ErrorMessage } from "@reactive-resume/utils";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ResumeService } from "./resume.service";

// 本地用户ID常量
const LOCAL_USER_ID = "local-user-id";

@Controller("resume")
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get("schema")
  getSchema() {
    return zodToJsonSchema(resumeDataSchema);
  }

  @Post()
  async create(@Body() createResumeDto: CreateResumeDto) {
    try {
      return await this.resumeService.create(LOCAL_USER_ID, createResumeDto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException(ErrorMessage.ResumeSlugAlreadyExists);
      }

      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Post("import")
  async import(@Body() importResumeDto: unknown) {
    try {
      const result = importResumeSchema.parse(importResumeDto);
      return await this.resumeService.import(LOCAL_USER_ID, result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException(ErrorMessage.ResumeSlugAlreadyExists);
      }

      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Get()
  findAll() {
    return this.resumeService.findAll(LOCAL_USER_ID);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.resumeService.findOne(id, LOCAL_USER_ID);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() updateResumeDto: UpdateResumeDto) {
    return this.resumeService.update(LOCAL_USER_ID, id, updateResumeDto);
  }

  @Post(":id/debug")
  async debugUpdate(@Param("id") id: string, @Body() updateResumeDto: UpdateResumeDto) {
    try {
      Logger.debug(
        `DEBUG: Received update payload ${JSON.stringify(updateResumeDto, null, 2)}`,
        "ResumeController",
      );

      if (updateResumeDto.data) {
        const parsedData =
          typeof updateResumeDto.data === "string"
            ? JSON.parse(updateResumeDto.data)
            : updateResumeDto.data;

        Logger.debug(
          `DEBUG: CSS status ${JSON.stringify({
            hasCss: !!parsedData.metadata?.css,
            cssVisible: parsedData.metadata?.css?.visible,
            cssValueLength: parsedData.metadata?.css?.value?.length || 0,
          })}`,
          "ResumeController",
        );
      }

      const result = await this.resumeService.update(LOCAL_USER_ID, id, updateResumeDto);
      return { success: true, result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.debug(`DEBUG: Update failed ${message}`, "ResumeController");
      return { success: false, error: message };
    }
  }

  @Patch(":id/lock")
  lock(@Param("id") id: string, @Body("set") set = true) {
    return this.resumeService.lock(LOCAL_USER_ID, id, set);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.resumeService.remove(LOCAL_USER_ID, id);
  }

  @Get("print/:id")
  async printResume(@Param("id") id: string) {
    try {
      const resume = await this.resumeService.findOne(id, LOCAL_USER_ID);
      const resumeWithParsedData = {
        ...resume,
        data: typeof resume.data === "string" ? JSON.parse(resume.data) : resume.data,
      } as ResumeDto;
      const url = await this.resumeService.printResume(resumeWithParsedData);

      return { url };
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }

  @Get("print/:id/preview")
  async printPreview(@Param("id") id: string) {
    try {
      const resume = await this.resumeService.findOne(id, LOCAL_USER_ID);
      const resumeWithParsedData = {
        ...resume,
        data: typeof resume.data === "string" ? JSON.parse(resume.data) : resume.data,
      } as ResumeDto;
      const url = await this.resumeService.printPreview(resumeWithParsedData);

      return { url };
    } catch (error) {
      Logger.error(error);
      throw new InternalServerErrorException(error);
    }
  }
}
