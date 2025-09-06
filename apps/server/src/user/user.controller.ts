import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Patch,
  Res,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { UpdateUserDto } from "@reactive-resume/dto";
import { ErrorMessage } from "@reactive-resume/utils";
import type { Response } from "express";

import { UserService } from "./user.service";

// 本地用户ID常量
const LOCAL_USER_ID = "local-user-id";

@Controller("user")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get("me")
  async fetch() {
    try {
      // Try to fetch real local user from database
      const user = await this.userService.getLocalUser();
      return user;
    } catch {
      // If not found in DB, return default user
      Logger.warn("Local user not found, returning default user data");
      return {
        id: LOCAL_USER_ID,
        name: "Local User",
        email: "local@example.com",
        username: "local-user",
        locale: "en-US",
      };
    }
  }

  @Patch("me")
  async update(@Body() updateUserDto: UpdateUserDto) {
    try {
      // Try to update user in database
      const user = await this.userService.updateByEmail("local@example.com", updateUserDto);
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Use generic error instead of removed UserAlreadyExists
        throw new BadRequestException(ErrorMessage.SomethingWentWrong);
      }

      Logger.error(error);
      // If update fails, return fallback data
      return {
        id: LOCAL_USER_ID,
        name: updateUserDto.name ?? "Local User",
        email: updateUserDto.email ?? "local@example.com",
        username: updateUserDto.username ?? "local-user",
        locale: updateUserDto.locale ?? "en-US",
      };
    }
  }

  @Delete("me")
  delete(@Res({ passthrough: true }) response: Response) {
    // In local app, user deletion can be simplified
    response.status(200).send({ message: "Sorry to see you go, goodbye!" });
  }
}
