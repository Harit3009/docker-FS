import { Module } from '@nestjs/common';
import { KafkaCreateFileConsumerService } from './kafka-create/kafka-create-file';
import { PrismaModule } from 'src/prisma/prisma.module';
import { S3ModuleModule } from 'src/s3-module/s3-module.module';
import { KafkaDeleteConsumerService } from './kafka-delete-consumer/kafka-delete-consumer.service';
import { DeleteTrashSchedulerService } from './delete-trash-scheduler/delete-trash-scheduler.service';
import { KafkaService } from './kafka/kafka.service';
import { KafkaExtractZipService } from './kafka-extract-zip/kafka-extract-zip.service';
import { KafkaIndexFileServiceService } from './kafka-index-file-service/kafka-index-file-service.service';
import { OpensearchService } from './open-search/open-search.service';
import { PdfParserService } from './pdf-parser/pdf-parser.service';
import { EmbeddingService } from './embedding/embedding.service';

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
  ],
  exports: [
    KafkaCreateFileConsumerService,
    KafkaDeleteConsumerService,
    OpensearchService,
    EmbeddingService,
  ],
  imports: [PrismaModule, S3ModuleModule],
})
export class BridgeModule {
  constructor() {}
}
