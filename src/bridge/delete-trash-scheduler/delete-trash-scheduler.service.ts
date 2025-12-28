import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { CronJob } from 'cron';
import { DateTime, DurationLike } from 'luxon';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3-module/s3-service.service';

@Injectable()
export class DeleteTrashSchedulerService implements OnModuleInit {
  deletionDuration: Record<string, DurationLike> = {
    '0 */5 * * * *': { minute: 5 },
    '0 0 0 */3 * *': { days: 3 },
    '*/15 * * * * *': { seconds: 15 },
  };

  private logger = new Logger('deleteFileSchedulerService');

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private schedularRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    this.logger.log(process.env.DELETION_CRON_STRING, 'process.env');
    const job = new CronJob(process.env.DELETION_CRON_STRING, () => {
      this.handleDeleteS3Files();
    });
    job.addCallback(() => {
      this.logger.log('called the cron');
    });
    this.schedularRegistry.addCronJob('deletion-cron-job', job);
    job.start();
  }

  async handleDeleteS3Files() {
    const date = DateTime.now();
    const deleteFiles = async (cursor?: { id: string }) => {
      const args: Prisma.FileFindManyArgs = {
        where: {
          isDeleted: true,
          deletedAt: {
            lte: date
              .minus(this.deletionDuration[process.env.DELETION_CRON_STRING])
              .minus({ minute: 15 }) //safety net
              .toJSDate(),
          },
        },
        take: 1000,
      };

      if (cursor) {
        args.cursor = cursor;
      }

      const files = await this.prisma.file.findMany(args);

      if (files.length) {
        const data = await this.s3Service.batchDeleteS3Objects(
          files.map((e) => e.s3Key),
        );
        this.logger.log(data.Deleted.length);
      }

      if (files.length === 1000) {
        await deleteFiles(files[files.length - 1]);
      }
    };

    await deleteFiles();
  }
}
