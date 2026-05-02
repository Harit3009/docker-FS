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
  ) {
    this.embeddingService
      .generateJSONBDescriptionFromPrologue(textChunk, true)
      .then((res: any) => {
        this.logger.log('>>>>>>>>>>>prisma handler response block', chunkIndex);
        // const filePath = join(process.cwd(), 'example-meta');

        // writeFile(filePath, res.message.thinking, 'utf8').catch((error) => {
        //   this.logger.error('error while writing thinking tokens', error);
        // });

        const parsedjson = JSON.parse(res.message.content) as DocumentMetadata;

        parsedjson.entities.all_relevant_dates =
          parsedjson.entities.all_relevant_dates.map((str) =>
            this.cleanDateToISO(str),
          );
        parsedjson.entities.most_relevant_date = parsedjson.entities
          .most_relevant_date
          ? this.cleanDateToISO(parsedjson.entities.most_relevant_date)
          : null;
        parsedjson.entities.dates_and_times =
          parsedjson.entities.dates_and_times.map((obj) => ({
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
          id: `${s3FileMeta.fileid}-chunk-${chunkIndex}`,
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
            let overviewChunksObj: Record<
              number | string,
              { embedding: number[]; text: string }
            > = {
              0: {
                embedding: [],
                text: '',
              },
            };
            let contextAnchorChunkIndex = 0;

            const getCurrentAnchor = () =>
              overviewChunksObj[contextAnchorChunkIndex];

            const addNewAnchor = (
              chunkIndex: number,
              text: string,
              embedding: number[],
            ) => {
              contextAnchorChunkIndex = chunkIndex;
              overviewChunksObj[contextAnchorChunkIndex] = { text, embedding };
            };

            for await (const chunk of stream) {
              heartbeat();
              index++;
              const textChunk = chunk.toString();
              // initial context

              const chunkEmbedding =
                await this.embeddingService.generateEmbeddings(textChunk);

              if (index <= 2) {
                overviewChunksObj[0].text += textChunk;
              }

              if (index === 2) {
                // call generate the json
                const anchorEmbeddings =
                  await this.embeddingService.generateEmbeddings(
                    overviewChunksObj[contextAnchorChunkIndex].text,
                  );
                overviewChunksObj[0].embedding = anchorEmbeddings;
              }

              if (index > 2) {
                // compare the chunk's similarity with current anchor
                const currAnchor = getCurrentAnchor();
                const allAnchors = Object.keys(overviewChunksObj);
                const similarities = allAnchors.map((ind) =>
                  this.embeddingService.fastSimilarityBetweenUnitVectors(
                    overviewChunksObj[ind].embedding,
                    chunkEmbedding,
                  ),
                );

                const isSimilar = similarities.find((sim) => sim > 0.75);
                // create new anchor with chunk index as key and text and embedding as value
                if (!isSimilar) {
                  this.logger.log('added chunk with simlarity >>>>', {
                    similarity: Math.max(...similarities),
                    index,
                  });
                  addNewAnchor(index, textChunk, chunkEmbedding);
                }
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

            // create and add all the contexxt anchors to DB as well as opensearch
            const promises = [];
            this.logger.log(
              'length is >>>>>',
              Object.entries(overviewChunksObj).length,
            );
            Object.entries(overviewChunksObj).forEach((entry) => {
              this.logger.log(entry);
              const [chunkIndex, { embedding, text }] = entry;
              this.logger.log(
                'created following overview chunks >>>>',
                chunkIndex,
                text,
              );
              promises.push(
                this.storeSemanticAnchor(
                  text,
                  fileMeta,
                  Number(chunkIndex),
                  embedding,
                ),
              );
            });
            await Promise.all(promises);
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
