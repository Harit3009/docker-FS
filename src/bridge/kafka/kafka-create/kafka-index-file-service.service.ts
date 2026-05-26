import { Injectable, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka.service';
import { Consumer } from 'kafkajs';
import { KAFKA_CONSUMER_NAMES, KAFKA_TOPIC_NAMES } from '../../../../constants';

import { S3Service } from 'src/s3-module/s3-service.service';
import { FileUploadMessage } from 'types/kafka-messages';
import { OpensearchService } from '../../open-search/open-search.service';
import { PdfParserService } from '../../pdf-parser/pdf-parser.service';
import { pipeline } from 'stream/promises';
import { EmbeddingService } from '../../embedding/embedding.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3FileMetaData } from 'types/file-metadata';
import * as chrono from 'chrono-node';
import { DocumentMetadata } from 'types/opensearch-index';

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
      sessionTimeout: 60000,
      heartbeatInterval: 20000,
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

  async storeSemanticAnchor(
    textChunk: string,
    s3FileMeta: S3FileMetaData,
    chunkIndex: number,
    embedding: number[],
    heartbeat?: Function,
  ) {
    const heartbeatTimeOut = setTimeout(() => {
      heartbeat();
    }, 3000);
    return this.embeddingService
      .generateJSONBDescriptionFromPrologue(textChunk, true)
      .then((res: any) => {
        const parsedjson = JSON.parse(res.message.content) as DocumentMetadata;

        this.logger.log('The parsed json from AI is >>>>');
        this.logger.log(parsedjson);
        parsedjson.all_relevant_dates = parsedjson.all_relevant_dates.map(
          (str) => this.cleanDateToISO(str),
        );
        parsedjson.most_relevant_date = parsedjson.most_relevant_date
          ? this.cleanDateToISO(parsedjson.most_relevant_date)
          : null;
        parsedjson.dates_and_times = parsedjson.dates_and_times.map((obj) => ({
          ...obj,
          date: this.cleanDateToISO(obj.date),
        }));

        const dbPromise = this.prisma.fileMetadata.create({
          data: {
            fileId: s3FileMeta.fileid,
            chunkIndex,
            semanticMetadata: JSON.stringify({
              ...parsedjson,
              embedding,
            }),
          },
        });

        const indexingPromise = this.oss.indexOverviewDocument({
          id: `${s3FileMeta.fileid}`,
          ...parsedjson,
          embedding,
        });

        return Promise.allSettled([dbPromise, indexingPromise]);
      })
      .then(([dbRes, ossres]) => {
        this.logger.log('db response after storing metdata :---', dbRes.status);
        this.logger.log(
          'opensearch response after storing metdata :---',
          ossres.status,
        );
        clearTimeout(heartbeatTimeOut);
      })
      .catch((err) => {
        this.logger.debug('error while generating sementic anchor');
        this.logger.debug(err);
        clearTimeout(heartbeatTimeOut);
        throw err;
      });
  }

  cleanDateToISO(dateString: string) {
    this.logger.log(`ate fixed from ${dateString}`);
    const date = chrono.parseDate(dateString).toISOString();
    this.logger.log(`date fixed from ${dateString} to ${date}`);
    return date;
  }

  async initializeConsumer() {
    this.logger.log('Initializing Kafka Index File Service Consumer');
    // Consumer initialization logic goes here
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [KAFKA_TOPIC_NAMES.FILE_UPLOADED],
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
            let overviewChunksObj: { embedding: number[]; text: string } = {
              embedding: [],
              text: '',
            };

            for await (const chunk of stream) {
              heartbeat();
              index++;
              const textChunk = chunk.toString();
              // initial context

              const chunkEmbedding =
                await this.embeddingService.generateEmbeddings(textChunk);

              if (index <= 2) {
                overviewChunksObj.text += textChunk;
              }

              if (index === 2) {
                // call generate the json
                const anchorEmbeddings =
                  await this.embeddingService.generateEmbeddings(
                    overviewChunksObj.text,
                  );
                overviewChunksObj.embedding = anchorEmbeddings;
              }

              this.logger.log(
                `Indexing chunk ${index} for file ${fileMeta.fileid}`,
              );

              await this.oss.indexChunkDocument({
                id: `${fileMeta.fileid}-chunk-${index}`,
                createdById: fileMeta.createdbyid,
                embedding: chunkEmbedding,
                text: textChunk,
                fileSystemPath: decodeURIComponent(fileMeta.filesystempath),
                s3Key: parsedMessage.s3Key,
                mimeType: 'application/pdf',
                size: ContentLength,
              });
            }

            const { text, embedding } = overviewChunksObj;
            heartbeat();
            await this.storeSemanticAnchor(
              text,
              fileMeta,
              0,
              embedding,
              heartbeat,
            );
          });
        }

        await this.consumer.commitOffsets([
          {
            topic: KAFKA_TOPIC_NAMES.FILE_UPLOADED,
            partition,
            offset: (BigInt(message.offset) + BigInt(1)).toString(),
          },
        ]);
      },
    });
  }
}
