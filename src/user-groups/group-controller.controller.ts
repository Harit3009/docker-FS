import { Controller, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PASSPORT_STRATEGIES } from '../../constants';
import { ReqUser } from 'src/decorators/param-decorators/user.decorator';
import { CreateGroupRequestDTO } from './group-dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { User } from '@prisma/client';

@Controller('group')
@UseGuards(AuthGuard(PASSPORT_STRATEGIES.INCOMING_JWT_VERIFICATION))
export class GroupControllerController {
  constructor(private prisma: PrismaService) {}

  @Post('create')
  async createGroup(@ReqUser() user: User, body: CreateGroupRequestDTO) {
    const { groupName } = body;
    const { id } = await this.prisma.group.create({
      data: {
        name: groupName,
        Owner: { connect: { id: user.id } },
      },
      select: {
        id: true,
      },
    });

    return {
      id,
    };
  }

  @Put('add-member')
  async addMemberToGroup() {}
}
