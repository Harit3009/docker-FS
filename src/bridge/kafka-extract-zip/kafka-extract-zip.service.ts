import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from 'src/s3-module/s3-service.service';
import { KafkaService } from '../kafka/kafka.service';
import { Consumer } from 'kafkajs';
import { KAFKA_TOPIC_NAMES } from '../../../constants';
import { Parse } from 'unzipper';
import { S3FileMetaData } from 'types/file-metadata';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { UnzipEntry } from 'types/unzipper';
import { PrismaService } from 'src/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import { Folder } from '@prisma/client';

@Injectable()
export class KafkaExtractZipService {
  private consumer: Consumer;
  private readonly logger = new Logger('KafkaExtractZipService');
  constructor(
    private s3: S3Service,
    private kafkaService: KafkaService,
    private prismaService: PrismaService,
  ) {
    this.kafkaService.connectionReadyEventEmitter.addListener(
      this.kafkaService.producerConnectedEventName,
      () => {
        this.initializeConsumer();
      },
    );
    if (this.kafkaService.isKafkaConnected) {
      this.initializeConsumer();
    }
  }

  private initializeConsumer = async () => {
    this.consumer = this.kafkaService.kafka.consumer({
      groupId: 'zip-extract-folder',
    });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [KAFKA_TOPIC_NAMES.FOLDER_ZIP_UPLOADED],
    });
    this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ message, heartbeat, partition }) => {
        heartbeat();
        const msgValue = message.value.toString();
        const parsedMessage = JSON.parse(msgValue);
        const { s3Key, bucket } = parsedMessage;
        this.logger.log(
          `Received message to extract zip: ${s3Key} from bucket: ${bucket}`,
        );
        const { Metadata } = await this.s3.getHeadObjectCommand(s3Key);
        const meta = Metadata as unknown as S3FileMetaData;
        const { createdbyid, fileid, filesystempath: fspath, parentid } = meta;
        const filesystempath = decodeURIComponent(fspath);
        this.logger.log(
          `Metadata - createdById: ${createdbyid}, fileId: ${fileid}, fileSystemPath: ${filesystempath}, parentId: ${parentid}`,
        );
        const createdPaths: Record<string, string> = {};
        const inputZipStream = await this.s3.getObjectStream(s3Key);
        await pipeline(
          inputZipStream,
          Parse(),
          new Transform({
            objectMode: true,
            transform: async (entry: UnzipEntry, encoding, callback) => {
              heartbeat();
              const fileName = entry.path;
              const type = entry.type; // 'Directory' or 'File'
              const size = entry.vars.uncompressedSize;

              this.logger.log(
                `Processing entry: ${fileName}, type: ${type}, size: ${size}, encoding: ${encoding}`,
              );

              const segments = fileName.split('/');
              const fileBaseName = segments.pop();
              let currentParentId = parentid;
              let currentPath = filesystempath;
              for (const segment of segments) {
                currentPath += `${segment}/`;
                if (!createdPaths[currentPath]) {
                  let folderRecord: Folder;
                  folderRecord =
                    await this.prismaService.extended.folder.findFirst({
                      where: {
                        fileSystemPath: currentPath,
                        createdById: createdbyid,
                      },
                    });

                  if (!folderRecord) {
                    folderRecord =
                      await this.prismaService.extended.folder.create({
                        data: {
                          fileSystemPath: currentPath,
                          createdBy: { connect: { id: createdbyid } },
                          parent: { connect: { id: currentParentId } },
                        },
                      });
                  }
                  createdPaths[currentPath] = folderRecord.id;
                }
                currentParentId = createdPaths[currentPath];
              }

              if (type === 'Directory') {
                entry.autodrain();
              }

              if (type === 'File') {
                const contentType = mime.lookup(fileBaseName);
                const fileId = uuidv4();
                const newMeta: S3FileMetaData = {
                  createdbyemail: meta.createdbyemail,
                  filesystempath: encodeURIComponent(
                    currentPath + fileBaseName,
                  ),
                  createdbyid: meta.createdbyid,
                  fileid: fileId,
                  parentid: currentParentId,
                  overwrite: 'true',
                  needsextraction: 'false',
                };

                this.logger.log(
                  'uncopressed size: ',
                  entry.vars.uncompressedSize,
                );

                await this.s3.uploadObjectStream(
                  entry,
                  fileId,
                  newMeta as unknown as Record<string, string>,
                  contentType || 'application/octet-stream',
                  entry.vars.uncompressedSize,
                );
              }

              callback();
            },
          }),
        );

        await this.consumer.commitOffsets([
          {
            topic: KAFKA_TOPIC_NAMES.FOLDER_ZIP_UPLOADED,
            partition,
            offset: (BigInt(message.offset) + BigInt(1)).toString(),
          },
        ]);
      },
    });
  };
}
