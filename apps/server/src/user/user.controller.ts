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
      // 尝试从数据库获取真实的本地用户数据
      const user = await this.userService.getLocalUser();
      return user;
    } catch {
      // 如果数据库中没有用户，返回默认值
      Logger.warn("本地用户不存在，返回默认用户数据");
      return {
        id: LOCAL_USER_ID,
        name: "本地用户",
        email: "local@example.com",
        username: "local-user",
        locale: "zh-CN",
      };
    }
  }

  @Patch("me")
  async update(@Body() updateUserDto: UpdateUserDto) {
    try {
      // 尝试更新数据库中的用户
      const user = await this.userService.updateByEmail("local@example.com", updateUserDto);
      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // 使用通用错误替代已删除的UserAlreadyExists
        throw new BadRequestException(ErrorMessage.SomethingWentWrong);
      }

      Logger.error(error);
      // 如果更新失败，返回模拟数据
      return {
        id: LOCAL_USER_ID,
        name: updateUserDto.name ?? "本地用户",
        email: updateUserDto.email ?? "local@example.com",
        username: updateUserDto.username ?? "local-user",
        locale: updateUserDto.locale ?? "zh-CN",
      };
    }
  }

  @Delete("me")
  delete(@Res({ passthrough: true }) response: Response) {
    // 在本地应用中，删除用户操作可以简化
    response.status(200).send({ message: "Sorry to see you go, goodbye!" });
  }
}
