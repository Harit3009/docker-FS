import { Test, TestingModule } from '@nestjs/testing';
import { DeleteTrashSchedulerService } from './delete-trash-scheduler.service';

describe('DeleteTrashSchedulerService', () => {
  let service: DeleteTrashSchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeleteTrashSchedulerService],
    }).compile();

    service = module.get<DeleteTrashSchedulerService>(DeleteTrashSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
