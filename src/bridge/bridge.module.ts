import { Module } from '@nestjs/common';
import { KafkaSqsService } from './kafka-sqs/kafka-sqs.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { S3ModuleModule } from 'src/s3-module/s3-module.module';
import { KafkaDeleteConsumerService } from './kafka-delete-consumer/kafka-delete-consumer.service';

@Module({
  providers: [KafkaSqsService, KafkaDeleteConsumerService],
  exports: [KafkaSqsService, KafkaDeleteConsumerService],
  imports: [PrismaModule, S3ModuleModule],
})
export class BridgeModule {}
