import { Test, TestingModule } from '@nestjs/testing';
import { KafkaSqsService } from './kafka-sqs.service';

describe('KafkaSqsService', () => {
  let service: KafkaSqsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KafkaSqsService],
    }).compile();

    service = module.get<KafkaSqsService>(KafkaSqsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
