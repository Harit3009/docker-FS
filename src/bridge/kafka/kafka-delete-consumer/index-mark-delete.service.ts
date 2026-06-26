import { Injectable } from '@nestjs/common';
import { OpensearchService } from 'src/bridge/open-search/open-search.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { KafkaService } from '../kafka.service';
import { Consumer } from 'kafkajs';
import { KAFKA_CONSUMER_NAMES, KAFKA_TOPIC_NAMES } from '../../../../constants';
import { Folder } from '@prisma/client';

@Injectable()
export class IndexMarkDeleteService {
  private consumer: Consumer;
  constructor(
    private oss: OpensearchService,
    private prisma: PrismaService,
    private kafkaService: KafkaService,
  ) {
    this.consumer = this.kafkaService.kafka.consumer({
      groupId: KAFKA_CONSUMER_NAMES.MARK_CHILDREN_FOR_DELETE_IN_OSS_CONSUMER,
    });
  }

  async initialiseConsumer() {
    this.consumer.connect();
    this.consumer.subscribe({
      topic: KAFKA_TOPIC_NAMES.MARK_CHILDREN_FOR_DELETION,
    });
    this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ message, heartbeat, topic }) => {
        heartbeat();
        const folder = JSON.parse(message.value.toString()) as Folder;
        await this.oss.markDocumentAsDeletedByS3Key(
          folder.fileSystemPath,
          folder.createdById,
        );
      },
    });
  }
}
