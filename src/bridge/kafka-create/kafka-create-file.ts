import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'kafkajs';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  ReceiveMessageCommandInput,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { PrismaService, TransactionClient } from 'src/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { S3Service } from 'src/s3-module/s3-service.service';
import { S3FileMetaData } from 'types/file-metadata';
import { Prisma } from '@prisma/client';
import { KafkaService } from '../kafka/kafka.service';

interface FileUploadMessage {
  s3Key: string;
  bucket: string;
}

@Injectable()
export class KafkaCreateFileConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private dbCreateConsumer: Consumer;
  private sqsS3: SQSClient;
  private isPollingS3EventSqs: Boolean = false;
  private _uploadFileTopicName = 'file-uploaded';

  private readonly logger = new Logger('KafkaCreateFileConsumerService');

  constructor(
    private prismaService: PrismaService,
    private s3Service: S3Service,
    private kafkaOrigin: KafkaService,
  ) {
    this.dbCreateConsumer = this.kafkaOrigin.kafka.consumer({
      groupId: 'db-record-creator',
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
    this.initialiseConsumerConnection();
  }

  private async initialiseConsumerConnection() {
    await this.dbCreateConsumer.connect();
    await this.dbCreateConsumer.subscribe({
      topics: [this._uploadFileTopicName],
    });

    await this.dbCreateConsumer.run({
      eachMessage: async ({ message: _message }) => {
        try {
          const message = JSON.parse(
            _message.value.toString(),
          ) as FileUploadMessage;
          this.logger.log(message);

          const { Metadata, ContentLength, ContentType } =
            await this.s3Service.getHeadObjectCommand(
              message.s3Key,
              message.bucket,
            );

          const fileMeta: S3FileMetaData =
            Metadata as unknown as S3FileMetaData;

          const createEntry = async (tx: TransactionClient) => {
            const dbFileInput: Prisma.FileCreateInput = {
              id: fileMeta.fileid,
              parentFolder: { connect: { id: fileMeta.parentid } },
              createdBy: { connect: { id: fileMeta.createdbyid } },
              s3Key: message.s3Key,
              fileSystemPath: decodeURIComponent(fileMeta.filesystempath),
              mimeType: ContentType,
              size: ContentLength,
            };

            await tx.file.create({ data: dbFileInput });
          };

          if (fileMeta.overwrite === 'false') {
            this.prismaService.$transaction(async (tx) => {
              await createEntry(tx);
              await this.prismaService.updateSize(
                tx,
                BigInt(ContentLength),
                fileMeta.parentid,
              );
            });
          } else if (fileMeta.overwrite === 'true') {
            this.prismaService.$transaction(async (tx) => {
              // the partial index exists on fileSystemPath
              const [deleted] = await tx.file.updateManyAndReturn({
                where: {
                  fileSystemPath: decodeURIComponent(fileMeta.filesystempath),
                  createdById: fileMeta.createdbyid,
                  isDeleted: false,
                },
                data: {
                  isDeleted: true,
                  deletedAt: new Date(),
                },
                select: { size: true, id: true },
              });
              const deltaSize = BigInt(ContentLength) - BigInt(deleted.size);
              await createEntry(tx);
              await this.prismaService.updateSize(
                tx,
                deltaSize,
                fileMeta.parentid,
              );
            });
          }
          this.logger.log('metadata');
          this.logger.log(Metadata);
        } catch (error) {
          this.logger.error(error);
          this.kafkaOrigin.producer.send({
            topic: 'error-while-file-upload-processing',
            messages: [{ value: JSON.stringify({ stack: error.stack }) }],
          });
        }
      },
    });

    this.isPollingS3EventSqs = true;
    this.pollSqs();
  }

  async onModuleDestroy() {
    await this.kafkaOrigin.producer.disconnect();
    await this.dbCreateConsumer.disconnect();
  }

  private async pollSqs() {
    this.logger.log('poll sqs called>>>>>>>>>>>>>>>>>>>>>>>>>');
    while (this.isPollingS3EventSqs) {
      const command: ReceiveMessageCommandInput = {
        QueueUrl: process.env.AWS_S3_EVENT_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2,
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
    this.logger.log('body >>>>>>>>>');
    this.logger.log(body);
    this.logger.log('record >>>>>>>>>');
    this.logger.log(body.Records);
    // S3 Event Structure is inside 'Records'
    if (body.Records) {
      for (const record of body.Records) {
        const s3Key = record.s3.object.key;

        this.logger.log(`🚀 Relaying Upload Event: ${s3Key}`);

        const { Metadata } = await this.s3Service.getHeadObjectCommand(s3Key);
        const fileMeta = Metadata as unknown as S3FileMetaData;
        // Push to Kafka
        this.logger.log('kaafka publish called');
        await this.kafkaOrigin.producer.send({
          topic: this._uploadFileTopicName, // Your Kafka Topic
          messages: [
            {
              value: JSON.stringify({
                s3Key,
                bucket: process.env.AWS_BUCKET_NAME,
              }),
              headers: {
                FileSystemPath: decodeURIComponent(fileMeta.filesystempath),
                createdById: fileMeta.createdbyid,
              },
            },
          ],
        });
        this.logger.log('kaafka publish finished');
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
