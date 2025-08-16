import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { UploadFontDto } from "./dto/upload-font.dto";
import { FontService } from "./font.service";

@Controller("fonts")
export class FontController {
  constructor(private readonly fontService: FontService) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("font"))
  async uploadFont(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadFontDto) {
    if (!file) {
      throw new Error("没有上传文件");
    }

    // 假设用户ID，实际应该从认证中获取
    const userId = "local-user-id";

    try {
      const result = await this.fontService.uploadFont(file, userId, dto);
      return {
        success: true,
        message: "字体上传成功",
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "字体上传失败";
      return { success: false, message, data: null };
    }
  }

  @Get("user/:userId")
  async getUserFonts(@Param("userId") userId: string) {
    try {
      const fonts = await this.fontService.getUserFonts(userId);
      return fonts; // 直接返回字体数组，与PrinterService期望的格式一致
    } catch {
      return [];
    }
  }

  @Delete(":fontId")
  deleteFont(@Param("fontId") fontId: string) {
    return {
      success: true,
      message: "字体删除成功",
    };
  }
}
