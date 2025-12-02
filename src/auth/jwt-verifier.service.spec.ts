import { Test, TestingModule } from '@nestjs/testing';
import { JwtVerifierService } from './jwt-verifier.strategy';

describe('JwtVerifierService', () => {
  let service: JwtVerifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtVerifierService],
    }).compile();

    service = module.get<JwtVerifierService>(JwtVerifierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
