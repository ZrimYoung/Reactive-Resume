import { createHash } from "node:crypto";

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
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

  @Get("library")
  library(@Query() query: Record<string, unknown>) {
    return this.resumeService.library(LOCAL_USER_ID, query);
  }

  @Get("trash")
  trash(@Query() query: Record<string, unknown>) {
    return this.resumeService.library(LOCAL_USER_ID, query, true);
  }

  @Delete("trash")
  emptyTrash(@Body() body: { confirm?: boolean } = {}) {
    return this.resumeService.emptyTrash(LOCAL_USER_ID, body.confirm === true);
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
  lock(@Param("id") id: string, @Body() body: { set?: boolean; expectedUpdatedAt?: Date } = {}) {
    return this.resumeService.lock(LOCAL_USER_ID, id, body.set ?? true, body.expectedUpdatedAt);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Body() body: { expectedUpdatedAt?: Date } = {}) {
    return this.resumeService.remove(LOCAL_USER_ID, id, body.expectedUpdatedAt);
  }

  @Post(":id/trash")
  moveToTrash(@Param("id") id: string, @Body() body: { expectedUpdatedAt?: Date } = {}) {
    return this.resumeService.remove(LOCAL_USER_ID, id, body.expectedUpdatedAt);
  }

  @Post(":id/restore")
  restore(@Param("id") id: string, @Body() body: { expectedUpdatedAt?: Date } = {}) {
    return this.resumeService.restore(LOCAL_USER_ID, id, body.expectedUpdatedAt);
  }

  @Delete(":id/permanent")
  permanent(@Param("id") id: string, @Body() body: { expectedUpdatedAt?: Date } = {}) {
    return this.resumeService.permanent(LOCAL_USER_ID, id, body.expectedUpdatedAt);
  }

  @Get(":id/versions")
  versions(@Param("id") id: string) {
    return this.resumeService.versions(LOCAL_USER_ID, id);
  }

  @Post(":id/versions")
  namedVersion(
    @Param("id") id: string,
    @Body() body: { name?: unknown; expectedUpdatedAt?: Date } = {},
  ) {
    if (typeof body.name !== "string") throw new BadRequestException("A version name is required");
    return this.resumeService.namedVersion(LOCAL_USER_ID, id, body.name, body.expectedUpdatedAt);
  }

  @Get(":id/versions/:versionId")
  version(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.resumeService.version(LOCAL_USER_ID, id, versionId);
  }

  @Delete(":id/versions/:versionId")
  deleteVersion(@Param("id") id: string, @Param("versionId") versionId: string) {
    return this.resumeService.deleteVersion(LOCAL_USER_ID, id, versionId);
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() body: { expectedUpdatedAt?: Date } = {},
  ) {
    return this.resumeService.restoreVersion(LOCAL_USER_ID, id, versionId, body.expectedUpdatedAt);
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
      const dataHash = createHash("sha256")
        .update(JSON.stringify(resumeWithParsedData.data))
        .digest("hex");
      return { url, dataHash };
    } catch (error) {
      Logger.error(error);
      if (error instanceof HttpException) throw error;
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
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(error);
    }
  }
}
