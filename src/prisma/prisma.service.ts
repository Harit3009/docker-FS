import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Folder, Prisma, PrismaClient, User } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

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
  private logger = new Logger(PrismaService.name);

  constructor(private config: ConfigService) {
    const connectionString = process.env.DATABASE_URL;
    const workerId = process.env.NODE_APP_INSTANCE || '0';
    const maxConnectionsForCluster = 120;
    const totalNodesPerCluster = parseInt(process.env.TOTAL_PM2_NODES, 10) || 1;
    const connections = Math.floor(
      maxConnectionsForCluster / totalNodesPerCluster,
    );

    const pool = new Pool({
      connectionString,
      max: connections,
      application_name: `nestjs_worker_${workerId}`,
    });
    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    this.$on('query', (e) => {
      // console.log('Query:', e.query);
      // console.log('Params:', e.params);
      // console.log('Duration:', e.duration, 'ms');
    });
    this.logger.log(`Max Connections : ${connections}`);
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
      where: { id: id, ...(includeDeleted ? {} : { isDeleted: false }) },
    });
  }

  async createRootFolderForUser(
    user: User,
    client: TransactionClient,
  ): Promise<Folder> {
    return client.folder.create({
      data: {
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

  async updateSize(
    client: TransactionClient,
    deltaSize: bigint,
    parentId: string,
  ) {
    await client.$executeRaw`WITH RECURSIVE folderSubTree AS (
      SELECT id, "parentId" from "Folder" f 
      where "id" = ${parentId}

      UNION ALL 

      SELECT parent.id, parent."parentId" FROM "Folder" parent
      JOIN folderSubTree f
      ON f."parentId" = parent.id
      )

      UPDATE "Folder" target
      SET "size" = target."size" + ${deltaSize}, "updatedAt" = NOW()
      FROM folderSubTree f
      WHERE target.id = f.id`;
  }
}
