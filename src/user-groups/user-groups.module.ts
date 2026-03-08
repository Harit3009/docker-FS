import { Module } from '@nestjs/common';
import { GroupControllerController } from './group-controller.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  controllers: [GroupControllerController],
  imports: [PrismaModule],
})
export class UserGroupsModule {}
