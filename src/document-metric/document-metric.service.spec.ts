import { Test, TestingModule } from '@nestjs/testing';
import { DocumentMetricService } from './document-metric.service';

describe('DocumentMetricService', () => {
  let service: DocumentMetricService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentMetricService],
    }).compile();

    service = module.get<DocumentMetricService>(DocumentMetricService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
