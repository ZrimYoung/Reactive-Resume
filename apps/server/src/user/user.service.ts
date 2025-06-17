import { Injectable } from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import { PrismaService } from "nestjs-prisma";

import { StorageService } from "../storage/storage.service";

// 本地用户 ID 常量
const LOCAL_USER_ID = "local-user-id";

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  findOneById(id: string): Promise<User> {
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
    });
  }

  async findOneByIdentifier(identifier: string): Promise<User | null> {
    // 首先尝试通过邮箱查找
    const userByEmail = await this.prisma.user.findUnique({
      where: { email: identifier },
    });

    if (userByEmail) return userByEmail;

    // 然后尝试通过用户名查找
    return this.prisma.user.findUnique({
      where: { username: identifier },
    });
  }

  async findOneByIdentifierOrThrow(identifier: string): Promise<User> {
    const user = await this.findOneByIdentifier(identifier);
    if (!user) {
      throw new Error(`User with identifier ${identifier} not found`);
    }
    return user;
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  updateByEmail(email: string, data: Prisma.UserUpdateArgs["data"]): Promise<User> {
    return this.prisma.user.update({ where: { email }, data });
  }

  async deleteOneById(id: string): Promise<void> {
    await Promise.all([
      this.storageService.deleteFolder(id),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }

  // 获取本地用户的便捷方法
  async getLocalUser(): Promise<User> {
    return this.findOneById(LOCAL_USER_ID);
  }
}
