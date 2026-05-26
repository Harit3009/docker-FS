import { Test, TestingModule } from '@nestjs/testing';
import { KafkaExtractZipService } from './kafka-extract-zip.service';

describe('KafkaExtractZipService', () => {
  let service: KafkaExtractZipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaExtractZipService],
    }).compile();

    service = module.get<KafkaExtractZipService>(KafkaExtractZipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
