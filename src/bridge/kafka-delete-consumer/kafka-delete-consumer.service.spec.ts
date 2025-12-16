import { Test, TestingModule } from '@nestjs/testing';
import { KafkaDeleteConsumerService } from './kafka-delete-consumer.service';

describe('KafkaDeleteConsumerService', () => {
  let service: KafkaDeleteConsumerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaDeleteConsumerService],
    }).compile();

    service = module.get<KafkaDeleteConsumerService>(KafkaDeleteConsumerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
