import { Injectable, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { Consumer } from 'kafkajs';
import { KAFKA_CONSUMER_NAMES, KAFKA_TOPIC_NAMES } from '../../../constants';

import { S3Service } from 'src/s3-module/s3-service.service';
import { FileUploadMessage } from 'types/kafka-messages';
import { OpensearchService } from '../open-search/open-search.service';
import { PdfParserService } from '../pdf-parser/pdf-parser.service';
import { pipeline } from 'stream/promises';
import { EmbeddingService } from '../embedding/embedding.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3FileMetaData } from 'types/file-metadata';

@Injectable()
export class KafkaIndexFileServiceService {
  private readonly logger = new Logger('KafkaIndexFileServiceService');
  private consumer: Consumer;

  constructor(
    private kafkaOrigin: KafkaService,
    private s3: S3Service,
    private oss: OpensearchService,
    private pdfParser: PdfParserService,
    private embeddingService: EmbeddingService,
    private prisma: PrismaService,
  ) {
    this.consumer = this.kafkaOrigin.kafka.consumer({
      groupId: KAFKA_CONSUMER_NAMES.VECTOR_INDEXING_CONSUMER,
    });

    if (this.kafkaOrigin.isKafkaConnected) {
      this.initializeConsumer();
    } else {
      this.kafkaOrigin.connectionReadyEventEmitter.addListener(
        this.kafkaOrigin.producerConnectedEventName,
        () => {
          this.initializeConsumer();
        },
      );
    }
  }

  async storeSementicMetaDataToDB(
    textChunk: string,
    s3FileMeta: S3FileMetaData,
  ) {
    this.embeddingService
      .generateJSONBDescriptionFromPrologue(textChunk)
      .then((res: any) => {
        this.logger.log(
          '>>>>>>>>>>>prisma handler response block',
          JSON.parse(res.message.content),
        );
        return this.prisma.fileMetadata.create({
          data: {
            fileId: s3FileMeta.fileid,
            semanticMetadata: res.message.content,
          },
        });
      })
      .then((dbRes) => {
        this.logger.log('db response after storing metdata :---', dbRes);
      });
  }

  async initializeConsumer() {
    this.logger.log('Initializing Kafka Index File Service Consumer');
    // Consumer initialization logic goes here
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [KAFKA_TOPIC_NAMES.FILE_UPLOADED],
      fromBeginning: true,
    });

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ message, heartbeat, partition }) => {
        heartbeat();
        const msgValue = message.value.toString();
        const parsedMessage: FileUploadMessage = JSON.parse(msgValue);
        this.logger.log(`Received message in Index File Service: ${msgValue}`);
        // Add indexing logic here
        const { Metadata, ContentType, ContentLength } =
          await this.s3.getHeadObjectCommand(parsedMessage.s3Key);

        const fileMeta = this.s3.parseFileMetaData(
          Metadata as unknown as Record<string, string>,
        );

        this.logger.log(
          'File Metadata for Indexing:',
          JSON.stringify(fileMeta),
          ContentType,
        );

        heartbeat();

        if (ContentType === 'application/pdf') {
          this.logger.log(
            `Indexing PDF file: ${fileMeta.filesystempath} from S3 Key: ${parsedMessage.s3Key}`,
          );
          const chunkTextStream = await this.pdfParser.parseS3PdfAsTextStream(
            parsedMessage.s3Key,
          );
          await pipeline(chunkTextStream, async (stream) => {
            let index = -1;
            let overviewChunk = '';
            for await (const chunk of stream) {
              heartbeat();
              index++;
              const textChunk = chunk.toString();
              if (index <= 2) {
                overviewChunk += textChunk;
                if (index === 2) {
                  // call generate the json
                  this.storeSementicMetaDataToDB(overviewChunk, fileMeta);
                }
              }

              const embedding =
                await this.embeddingService.generateEmbeddings(textChunk);

              this.logger.log(
                `Indexing chunk ${index} for file ${fileMeta.fileid}`,
              );

              await this.oss.indexDocument({
                id: `${fileMeta.fileid}-chunk-${index}`,
                createdById: fileMeta.createdbyid,
                embedding,
                text: textChunk,
                fileSystemPath: decodeURIComponent(fileMeta.filesystempath),
                s3Key: parsedMessage.s3Key,
                mimeType: 'application/pdf',
                size: ContentLength,
              });
            }

            // in case document was fully consumable (had length less than minimum chunksize)
            // then the above condition of taking first 2 chunks failed and meta never created
            // create jsonb meta in postgres as index never reached 2 after all for of iterations
            if (index < 2) {
              heartbeat();
              await this.storeSementicMetaDataToDB(overviewChunk, fileMeta);
            }
          });
        }

        await this.consumer.commitOffsets([
          {
            topic: KAFKA_TOPIC_NAMES.FILE_UPLOADED,
            partition,
            offset: (Number(message.offset) + 1).toString(),
          },
        ]);
      },
    });
  }
}
