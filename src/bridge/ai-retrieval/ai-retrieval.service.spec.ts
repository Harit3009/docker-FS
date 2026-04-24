import { Test, TestingModule } from '@nestjs/testing';
import { AiRetrievalService } from './ai-retrieval.service';

describe('AiRetrievalService', () => {
  let service: AiRetrievalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiRetrievalService],
    }).compile();

    service = module.get<AiRetrievalService>(AiRetrievalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
