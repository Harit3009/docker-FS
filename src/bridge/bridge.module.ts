import { Module } from '@nestjs/common';
import { KafkaSqsService } from './kafka-sqs/kafka-sqs.service';

@Module({
  providers: [KafkaSqsService],
  exports: [KafkaSqsService],
})
export class BridgeModule {}
