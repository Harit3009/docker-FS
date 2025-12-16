import { Injectable } from '@nestjs/common';
import { KafkaSqsService } from '../kafka-sqs/kafka-sqs.service';
import { Folder } from '@prisma/client';
import { Consumer } from 'kafkajs';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class KafkaDeleteConsumerService {
  markChildrenForDeleteConsumer: Consumer;
  markChildrenForDeletionTopicName: string = 'mark-children-for-delete-topic';
  markChildrenDeletionDLQTopic: string = 'mark-children-for-deletion-dlq';

  constructor(
    private kafkaOrigin: KafkaSqsService,
    private prisma: PrismaService,
  ) {
    this.markChildrenForDeleteConsumer = this.kafkaOrigin.kafka.consumer({
      groupId: 'marking for delete',
    });

    if (this.kafkaOrigin.isKafkaConnected) {
      this.initializeConsumer();
    } else {
      this.kafkaOrigin.connectionReadyEventEmitter.addListener(
        'producer connected',
        () => {
          console.log('event listener executed in consumer');
          this.initializeConsumer();
        },
      );
    }
  }

  async publishDeleteFolderRoot(folder: Folder) {
    this.kafkaOrigin.producer.send({
      topic: this.markChildrenForDeletionTopicName,
      messages: [
        {
          key: folder.id,
          value: JSON.stringify(folder),
        },
      ],
    });
  }

  async initializeConsumer() {
    try {
      await this.markChildrenForDeleteConsumer.connect();
      await this.markChildrenForDeleteConsumer.subscribe({
        topic: this.markChildrenForDeletionTopicName,
      });
      this.markChildrenForDeleteConsumer.run({
        eachMessage: async ({ message, topic, heartbeat, partition }) => {
          try {
            const folder = JSON.parse(message.value.toString()) as Folder;
            await this.processRecursiveDelete(
              folder.createdById,
              folder.fileSystemPath,
              heartbeat,
            );

            await this.markChildrenForDeleteConsumer.commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ]);
          } catch (error) {
            console.log('error >>>>', error);
            await this.kafkaOrigin.producer.send({
              messages: [message],
              topic: this.markChildrenDeletionDLQTopic,
            });
          }
        },
        autoCommit: false,
      });
    } catch (error) {
      console.error('Failed to start delete event kafka consumer, retrying');
      this.initializeConsumer();
    }
  }

  // The Raw SQL Logic from earlier
  async processRecursiveDelete(
    userId: string,
    targetPath: string,
    heartbeat: () => Promise<void>,
  ) {
    const BATCH_SIZE = 5000;
    const searchPath = targetPath.endsWith('/') ? targetPath : targetPath + '/';

    let filesRemaining = true;
    while (filesRemaining) {
      await heartbeat();

      const result: any[] = await this.prisma.$queryRaw`
        WITH batch AS (
          SELECT id FROM "File"
          WHERE "createdById" = ${userId}
            AND "isDeleted" = false
            AND "fileSystemPath" LIKE ${searchPath} || '%'
          LIMIT ${BATCH_SIZE}
          FOR UPDATE
        )
        UPDATE "File" SET "isDeleted" = true, "deletedAt" = NOW()
        WHERE id IN (SELECT id FROM batch)
        RETURNING id;
      `;

      if (result.length < BATCH_SIZE) filesRemaining = false;
    }

    // ... Repeat loop for "Folder" table ...
    let folderRemaining = true;

    while (folderRemaining) {
      await heartbeat();

      const result: any[] = await this.prisma.$queryRaw`
        WITH batch AS (
          SELECT id FROM "Folder"
          WHERE "createdById" = ${userId}
            AND "isDeleted" = false
            AND "fileSystemPath" LIKE ${searchPath} || '%'
          LIMIT ${BATCH_SIZE}
          FOR UPDATE
        )
        UPDATE "Folder" SET "isDeleted" = true, "deletedAt" = NOW()
        WHERE id IN (SELECT id FROM batch)
        RETURNING id;
      `;

      if (result.length < BATCH_SIZE) folderRemaining = false;
    }

    // Final cleanup of the root folder
    await this.prisma.folder.updateMany({
      where: { fileSystemPath: targetPath, createdById: userId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
