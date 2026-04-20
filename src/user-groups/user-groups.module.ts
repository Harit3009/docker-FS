import { Module } from '@nestjs/common';
import { GroupControllerController } from './group-controller.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { GroupsHandlingService } from './groups-handling.service';

@Module({
  controllers: [GroupControllerController],
  imports: [PrismaModule],
  providers: [GroupsHandlingService],
})
export class UserGroupsModule {}
