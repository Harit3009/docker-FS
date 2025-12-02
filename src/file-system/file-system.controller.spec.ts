import { Test, TestingModule } from '@nestjs/testing';
import { FileSystemController } from './file-system.controller';

describe('FileSystemController', () => {
  let controller: FileSystemController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileSystemController],
    }).compile();

    controller = module.get<FileSystemController>(FileSystemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
