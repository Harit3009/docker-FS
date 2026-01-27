import { Test, TestingModule } from '@nestjs/testing';
import { OpensearchService } from './open-search.service';

describe('OpenSearchService', () => {
  let service: OpensearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpensearchService],
    }).compile();

    service = module.get<OpensearchService>(OpensearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
