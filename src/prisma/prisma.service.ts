import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Folder, Prisma, PrismaClient, User } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

export type TransactionClient = Omit<
  PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel, any>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async getUserById(id: string) {
    return this.user.findUnique({ where: { id } });
  }

  async getFolderById(id: string) {
    return this.folder.findUnique({ where: { id: id } });
  }

  async createRootFolderForUser(
    user: User,
    client: TransactionClient,
  ): Promise<Folder> {
    return client.folder.create({
      data: {
        s3Key: `${user.id}/`,
        fileSystemPath: '/',
        createdById: user.id,
      },
    });
  }
}
