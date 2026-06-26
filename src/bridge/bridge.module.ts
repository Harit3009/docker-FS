import { Module } from '@nestjs/common';
import { KafkaCreateFileConsumerService } from './kafka/kafka-create/kafka-create-file';
import { PrismaModule } from 'src/prisma/prisma.module';
import { S3ModuleModule } from 'src/s3-module/s3-module.module';
import { DeleteTrashSchedulerService } from './delete-trash-scheduler/delete-trash-scheduler.service';
import { KafkaService } from './kafka/kafka.service';
import { KafkaIndexFileServiceService } from './kafka/kafka-create/kafka-index-file-service.service';
import { OpensearchService } from './open-search/open-search.service';
import { PdfParserService } from './pdf-parser/pdf-parser.service';
import { EmbeddingService } from './embedding/embedding.service';
import { HttpModule } from '@nestjs/axios';
import { AiRetrievalService } from './ai-retrieval/ai-retrieval.service';
import { LangraphChatService } from './ai-retrieval/langraph-chat.service';
import * as http from 'http';
import * as https from 'https';
import { KafkaDeleteConsumerService } from './kafka/kafka-delete-consumer/kafka-delete-consumer.service';
import { KafkaExtractZipService } from './kafka/kafka-extract-zip/kafka-extract-zip.service';
import { IndexMarkDeleteService } from './kafka/kafka-delete-consumer/index-mark-delete.service';

@Module({
  providers: [
    KafkaService,
    KafkaCreateFileConsumerService,
    KafkaDeleteConsumerService,
    DeleteTrashSchedulerService,
    KafkaExtractZipService,
    KafkaIndexFileServiceService,
    OpensearchService,
    PdfParserService,
    EmbeddingService,
    AiRetrievalService,
    LangraphChatService,
    IndexMarkDeleteService,
  ],
  exports: [
    KafkaCreateFileConsumerService,
    KafkaDeleteConsumerService,
    OpensearchService,
    EmbeddingService,
    AiRetrievalService,
  ],
  imports: [
    PrismaModule,
    S3ModuleModule,
    HttpModule.register({
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
      timeout: 60000,
    }),
  ],
})
export class BridgeModule {
  constructor() {}
}
