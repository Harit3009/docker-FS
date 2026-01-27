import { Test, TestingModule } from '@nestjs/testing';
import { KafkaIndexFileServiceService } from './kafka-index-file-service.service';

describe('KafkaIndexFileServiceService', () => {
  let service: KafkaIndexFileServiceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaIndexFileServiceService],
    }).compile();

    service = module.get<KafkaIndexFileServiceService>(KafkaIndexFileServiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
