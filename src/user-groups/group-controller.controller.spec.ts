import { Test, TestingModule } from '@nestjs/testing';
import { GroupControllerController } from './group-controller.controller';

describe('GroupControllerController', () => {
  let controller: GroupControllerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupControllerController],
    }).compile();

    controller = module.get<GroupControllerController>(
      GroupControllerController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
