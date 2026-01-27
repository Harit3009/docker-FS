import { Injectable, Logger } from '@nestjs/common';
import { Folder } from '@prisma/client';
import { Consumer } from 'kafkajs';
import { PrismaService } from 'src/prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPIC_NAMES } from '../../../constants';

@Injectable()
export class KafkaDeleteConsumerService {
  markChildrenForDeleteConsumer: Consumer;
  private logger = new Logger('kafkaDeleteFolderConsumer');
  private retryLog: Record<string, number> = {};
  constructor(
    private kafkaOrigin: KafkaService,
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
          this.logger.log('event listener executed in consumer');
          this.initializeConsumer();
        },
      );
    }
  }

  async publishDeleteFolderRoot(folder: Folder) {
    this.kafkaOrigin.producer.send({
      topic: KAFKA_TOPIC_NAMES.MARK_CHILDREN_FOR_DELETION,
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
        topic: KAFKA_TOPIC_NAMES.MARK_CHILDREN_FOR_DELETION,
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

            this.logger.log('commiting offsets');
            await this.markChildrenForDeleteConsumer.commitOffsets([
              {
                topic,
                partition,
                offset: (Number(message.offset) + 1).toString(),
              },
            ]);
          } catch (error) {
            if (this.retryLog[message.key[0]] < 3) {
              this.retryLog[message.key[0]]++;
              await this.markChildrenForDeleteConsumer.seek({
                offset: message.offset,
                partition,
                topic,
              });

              return;
            }
            this.logger.log('error while delete child consumer >>>>', error);
            await this.kafkaOrigin.producer.send({
              messages: [message],
              topic: KAFKA_TOPIC_NAMES.MARK_CHILDEREN_FOR_DELETE_DLQ,
            });
          }
        },
        autoCommit: false,
      });
    } catch (error) {
      this.logger.error(
        'Failed to start delete event kafka consumer, retrying',
      );
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

      this.logger.log('recursice delete files ', result);

      if (result.length < BATCH_SIZE) {
        filesRemaining = false;
      }
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
      this.logger.log('recursice delete folders ', result);

      if (result.length < BATCH_SIZE) folderRemaining = false;
    }
  }
}
