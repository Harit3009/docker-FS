import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Folder, Prisma, PrismaClient, User } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

export type TransactionClient = Omit<
  PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel, any>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

const getExtendedClient = (client: PrismaClient) => {
  return client.$extends({
    query: {
      $allModels: {
        findFirst: async ({ model, args, query }) => {
          if (model === 'File' || model === 'Folder') {
            args.where = { ...args.where, isDeleted: false };
          }
          return query(args);
        },
        findFirstOrThrow: async ({ model, args, query }) => {
          if (model === 'File' || model === 'Folder') {
            args.where = { ...args.where, isDeleted: false };
          }
          return query(args);
        },
        findMany: async ({ model, args, query }) => {
          if (model === 'File' || model === 'Folder') {
            args.where = { ...args.where, isDeleted: false };
          }
          return query(args);
        },
        findUnique: async ({ model, args, query }) => {
          if (model === 'File' || model === 'Folder') {
            args.where = { ...args.where, isDeleted: false };
          }
          return query(args);
        },
        findUniqueOrThrow: async ({ model, args, query }) => {
          if (model === 'File' || model === 'Folder') {
            args.where = { ...args.where, isDeleted: false };
          }
          return query(args);
        },
      },
    },
  });
};

type ExtendedClient = ReturnType<typeof getExtendedClient>;

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

  private _extendedClient: ExtendedClient;
  get extended() {
    if (!this._extendedClient) {
      this._extendedClient = getExtendedClient(this);
    }
    return this._extendedClient;
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

  async getFolderById(id: string, includeDeleted: boolean = false) {
    return this.folder.findUnique({
      where: { id: id, isDeleted: includeDeleted },
    });
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

  async checkIfUserOwnsFolderId(
    user: User,
    folderId: string,
  ): Promise<boolean> {
    const folder = await this.folder.findUnique({
      where: {
        createdById: user.id,
        id: folderId,
      },
    });
    return !!folder;
  }
}
