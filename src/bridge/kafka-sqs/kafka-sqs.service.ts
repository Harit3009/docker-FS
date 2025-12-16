import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, Producer } from 'kafkajs';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  ReceiveMessageCommandInput,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { S3Service } from 'src/s3-module/s3-service.service';
import { S3FileMetaData } from 'types/file-metadata';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface FileUploadMessage {
  s3Key: string;
  bucket: string;
}

@Injectable()
export class KafkaSqsService implements OnModuleInit, OnModuleDestroy {
  public kafka: Kafka;
  producer: Producer;
  private dbCreateConsumer: Consumer;
  private sqsS3: SQSClient;
  private isPollingS3EventSqs: Boolean = false;
  isKafkaConnected: boolean = false;
  connectionReadyEventEmitter: EventEmitter2 = new EventEmitter2({
    maxListeners: Infinity,
  });

  private readonly logger = new Logger('KafkaSqsService');

  constructor(
    private prismaService: PrismaService,
    private s3Service: S3Service,
  ) {
    this.kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKERS],
      clientId: process.env.KAFKA_CLIENT_ID,
    });
    this.producer = this.kafka.producer();
    this.dbCreateConsumer = this.kafka.consumer({
      groupId: 'db-record-creator',
    });

    this.connectionReadyEventEmitter.addListener('producer connected', () => {
      this.isKafkaConnected = true;
    });

    this.sqsS3 = new SQSClient({
      endpoint: process.env.AWS_ENDPOINT,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async onModuleInit() {
    this.initializeKafkaConnection();
  }

  private async initializeKafkaConnection() {
    await this.producer.connect();
    this.connectionReadyEventEmitter.emit('producer connected');
    await this.dbCreateConsumer.connect();
    await this.dbCreateConsumer.subscribe({ topics: ['file-uploaded'] });
    await this.dbCreateConsumer.run({
      eachMessage: async ({ message: _message }) => {
        try {
          const message = JSON.parse(
            _message.value.toString(),
          ) as FileUploadMessage;
          this.logger.log(message);

          const { Metadata, ContentLength } =
            await this.s3Service.getHeadObjectCommand(
              message.s3Key,
              message.bucket,
            );

          const fileMeta: S3FileMetaData =
            Metadata as unknown as S3FileMetaData;

          const dbFileInput: Prisma.FileCreateInput = {
            id: fileMeta.fileid,
            parentFolder: { connect: { id: fileMeta.parentid } },
            createdBy: { connect: { id: fileMeta.createdbyid } },
            s3Key: message.s3Key,
            fileSystemPath: fileMeta.filesystempath,
            mimeType: fileMeta.filesystempath,
            size: ContentLength,
          };

          await this.prismaService.file.create({ data: dbFileInput });
          this.logger.log('metadata');
          this.logger.log(Metadata);
        } catch (error) {
          this.logger.error(error);
          this.producer.send({
            topic: 'error-while-file-upload=processing',
            messages: [{ value: JSON.stringify({ stack: error.stack }) }],
          });
        }
      },
    });

    this.isPollingS3EventSqs = true;
    this.pollSqs();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    await this.dbCreateConsumer.disconnect();
  }

  private async pollSqs() {
    while (this.isPollingS3EventSqs) {
      const command: ReceiveMessageCommandInput = {
        QueueUrl: process.env.AWS_S3_EVENT_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
      };

      const { Messages } = await this.sqsS3.send(
        new ReceiveMessageCommand(command),
      );

      if (Messages?.length)
        for (let i = 0; i < Messages.length; i++) {
          await this.processMessage(Messages[i]);
        }
    }
  }

  private async processMessage(sqsMessage: Message) {
    const body = JSON.parse(sqsMessage.Body);

    // S3 Event Structure is inside 'Records'
    if (body.Records) {
      for (const record of body.Records) {
        const s3Key = record.s3.object.key;
        console.log(`🚀 Relaying Upload Event: ${s3Key}`);

        // Push to Kafka
        await this.producer.send({
          topic: 'file-uploaded', // Your Kafka Topic
          messages: [
            {
              value: JSON.stringify({
                s3Key,
                bucket: process.env.AWS_BUCKET_NAME,
              }),
            },
          ],
        });
      }
    }

    // Delete from SQS so we don't process it again
    await this.sqsS3.send(
      new DeleteMessageCommand({
        QueueUrl: process.env.AWS_S3_EVENT_QUEUE_URL,
        ReceiptHandle: sqsMessage.ReceiptHandle,
      }),
    );
  }
}
