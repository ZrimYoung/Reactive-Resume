import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import { OfflineFontService } from "./offline-font.service";

const requestSchema = z.object({
  family: z.string().min(1).max(100),
  variants: z.array(z.string().max(20)).max(32).optional(),
  subset: z.string().max(50).optional(),
});

@Controller("fonts/offline")
export class OfflineFontController {
  constructor(private readonly fonts: OfflineFontService) {}

  private parseQuery(query: Record<string, unknown>) {
    return requestSchema.parse({
      family: query.family,
      variants:
        typeof query.variants === "string" ? query.variants.split(",").filter(Boolean) : undefined,
      subset: query.subset,
    });
  }

  @Get()
  async status(@Query() query: Record<string, unknown>) {
    try {
      return await this.fonts.getStatus(this.parseQuery(query));
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid font request.",
      );
    }
  }

  @Post("prepare")
  async prepare(@Body() body: unknown) {
    try {
      return await this.fonts.prepare(requestSchema.parse(body));
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Font preparation failed.",
      );
    }
  }

  @Get("style.css")
  async css(@Query() query: Record<string, unknown>, @Res() response: Response) {
    try {
      const result = await this.fonts.getCss(this.parseQuery(query));
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Offline-Font-Status", result.status);
      response.type("text/css").send(result.css);
    } catch {
      response
        .status(400)
        .type("text/css")
        .send("/* Font is not available in the local catalog. */");
    }
  }

  @Get("files/:fileName")
  async file(@Param("fileName") fileName: string, @Res() response: Response) {
    try {
      const bytes = await this.fonts.readFile(fileName);
      const extension = fileName.split(".").pop();
      const types: Record<string, string> = {
        ttf: "font/ttf",
        otf: "font/otf",
        woff: "font/woff",
        woff2: "font/woff2",
      };
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.type(types[extension ?? ""] ?? "application/octet-stream").send(bytes);
    } catch {
      throw new NotFoundException("The cached font is missing or damaged. Prepare the font again.");
    }
  }
}
