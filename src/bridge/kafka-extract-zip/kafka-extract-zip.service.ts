import { Injectable } from '@nestjs/common';
import { S3Service } from 'src/s3-module/s3-service.service';
import { KafkaService } from '../kafka/kafka.service';
import { KafkaCreateFileConsumerService } from '../kafka-create/kafka-create-file';

@Injectable()
export class KafkaExtractZipService {
  private uploadTopicName;
  constructor(
    private s3: S3Service,
    private kafkaService: KafkaService,
    private k: KafkaCreateFileConsumerService,
  ) {
    this.uploadTopicName = k._folderZipUploadedTopicName;
    this.kafkaService.connectionReadyEventEmitter.addListener(
      this.kafkaService.producerConnectedEventName,
      () => {},
    );
  }
}
