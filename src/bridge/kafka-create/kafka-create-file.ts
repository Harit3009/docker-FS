import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Consumer } from 'kafkajs';
import { PrismaService, TransactionClient } from 'src/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { S3Service } from 'src/s3-module/s3-service.service';
import { S3FileMetaData } from 'types/file-metadata';
import { Prisma } from '@prisma/client';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_CONSUMER_NAMES, KAFKA_TOPIC_NAMES } from './../../../constants';
import { FileUploadMessage } from 'types/kafka-messages';

@Injectable()
export class KafkaCreateFileConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private dbCreateConsumer: Consumer;

  private readonly logger = new Logger('KafkaCreateFileConsumerService');

  constructor(
    private prismaService: PrismaService,
    private s3Service: S3Service,
    private kafkaOrigin: KafkaService,
  ) {
    this.dbCreateConsumer = this.kafkaOrigin.kafka.consumer({
      groupId: KAFKA_CONSUMER_NAMES.MAKE_DB_RECORD_CONSUMER,
    });
  }

  async onModuleInit() {
    this.initialiseConsumerConnection();
  }

  private async initialiseConsumerConnection() {
    await this.dbCreateConsumer.connect();
    await this.dbCreateConsumer.subscribe({
      topics: [KAFKA_TOPIC_NAMES.FILE_UPLOADED],
    });

    await this.dbCreateConsumer.run({
      eachMessage: async ({ message: _message }) => {
        try {
          const message = JSON.parse(
            _message.value.toString(),
          ) as FileUploadMessage;
          this.logger.log(
            `Processing file upload message for s3Key: ${message.s3Key}, ${JSON.stringify(message)}`,
          );
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
              createdBy: { connect: { id: fileMeta.createdbyid } },
              s3Key: message.s3Key,
              fileSystemPath: decodeURIComponent(fileMeta.filesystempath),
              mimeType: ContentType,
              size: ContentLength,
              // conditionally connect parent folder in case file is not at root
              ...(fileMeta?.parentid !== 'root'
                ? { parentFolder: { connect: { id: fileMeta.parentid } } }
                : {}),
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
              const deltaSize =
                BigInt(ContentLength) - BigInt(deleted?.size || 0);
              if (!deleted?.size) {
                this.logger.debug(
                  'Overwrite specified but no existing file found',
                );
              }
              await createEntry(tx);
              await this.prismaService.updateSize(
                tx,
                deltaSize,
                fileMeta.parentid,
              );
            });
          }

          this.logger.log(
            `File record created successfully for s3Key: ${message.s3Key}, fileMeta: ${Metadata}`,
          );
        } catch (error: any) {
          this.logger.error(error);
          this.kafkaOrigin.producer.send({
            topic: 'error-while-file-upload-processing',
            messages: [
              { value: JSON.stringify({ stack: error.stack, error }) },
            ],
          });
        }
      },
    });
  }

  async onModuleDestroy() {
    await this.kafkaOrigin.producer.disconnect();
    await this.dbCreateConsumer.disconnect();
  }
}
