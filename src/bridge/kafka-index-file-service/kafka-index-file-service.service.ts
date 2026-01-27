import { Injectable, Logger } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { Consumer } from 'kafkajs';
import { KAFKA_TOPIC_NAMES } from '../../../constants';

import { S3Service } from 'src/s3-module/s3-service.service';
import { FileUploadMessage } from 'types/kafka-messages';
import { OpensearchService } from '../open-search/open-search.service';
import { PdfParserService } from '../pdf-parser/pdf-parser.service';
import { pipeline } from 'stream/promises';
import { EmbeddingService } from '../embedding/embedding.service';

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
  ) {
    this.consumer = this.kafkaOrigin.kafka.consumer({
      groupId: 'file-indexer-group',
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
            `Indexing PDF file: ${fileMeta.fileid} from S3 Key: ${parsedMessage.s3Key}`,
          );
          const chunkTextStream = await this.pdfParser.parseS3PdfAsTextStream(
            parsedMessage.s3Key,
          );
          await pipeline(chunkTextStream, async (stream) => {
            let index = -1;
            for await (const chunk of stream) {
              heartbeat();
              index++;
              const textChunk = chunk.toString();
              const [embedding] =
                await this.embeddingService.generateEmbeddings([textChunk]);

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
