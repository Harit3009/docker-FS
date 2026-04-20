import {
  Body,
  Controller,
  NotAcceptableException,
  Post,
  Put,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PASSPORT_STRATEGIES } from '../../constants';
import { ReqUser } from 'src/decorators/param-decorators/user.decorator';
import {
  BlockInvitesByInviteeDTO,
  BlockUserFromGroupDTO,
  CreateGroupRequestDTO,
  CreateInviteForMemberDTO,
} from './group-dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { GROUP_MEMBER_STATUS, GROUP_ROLE, User } from '@prisma/client';

@Controller('group')
@UseGuards(AuthGuard(PASSPORT_STRATEGIES.INCOMING_JWT_VERIFICATION))
export class GroupControllerController {
  constructor(private prisma: PrismaService) {}

  @Post('create')
  async createGroup(
    @ReqUser() user: User,
    @Body() body: CreateGroupRequestDTO,
  ) {
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

  @Put('invite-member-to-group')
  async inviteMemberToGroup(
    @ReqUser() user: User,
    @Body() body: CreateInviteForMemberDTO,
  ) {
    const {
      groupId,
      email,
      role,
      status = 'INVITED',
      message,
      override,
    } = body;
    const hasPermissionPromise = this.prisma.groupMember.findFirst({
      where: {
        groupId: groupId,
        role: { in: ['ADMIN', 'OWNER'] },
      },
    });

    const inviteeGrpDetailsPromise = this.prisma.groupMember.findFirst({
      where: {
        user: { email },
      },
    });

    const [hasPermission, inviteeMember] = await Promise.all([
      hasPermissionPromise,
      inviteeGrpDetailsPromise,
    ]);

    if (!hasPermission) {
      throw new NotAcceptableException({
        message: 'unauthorised to invite user',
      });
    }

    if (inviteeMember.status === 'BLOCKED_BY_INVITEE') {
      throw new UnauthorizedException({
        message: `the invitee has blocked the invites from the group`,
      });
    }

    if (
      inviteeMember &&
      this.blockedFromGroupStatus.includes(inviteeMember.status) &&
      !override
    ) {
      const blocker = await this.prisma.user.findUnique({
        where: { id: inviteeMember.invitedById },
      });

      throw new UnauthorizedException({
        message: `invitee blocked by user`,
        remark: inviteeMember.status_remark,
        blockedBy: blocker.email,
      });
    }

    const invitee = await this.prisma.user.findUnique({ where: { email } });

    await this.prisma.groupMember.create({
      data: {
        group: { connect: { id: groupId } },
        role,
        status,
        status_remark: message,
        invitedBy: { connect: user },
        user: { connect: invitee },
      },
    });
  }

  blockStatusByRoleMap: Record<GROUP_ROLE, GROUP_MEMBER_STATUS> = {
    MEMBER: 'BLOCKED_BY_MEMBER',
    ADMIN: 'BLOCKED_BY_ADMIN',
    OWNER: 'BLOCKED_BY_OWNER',
  };

  blockedFromGroupStatus: GROUP_MEMBER_STATUS[] = [
    'BLOCKED_BY_ADMIN',
    'BLOCKED_BY_MEMBER',
    'BLOCKED_BY_OWNER',
  ];

  @Put('block-user')
  async blockUserFromGroup(
    @ReqUser() user: User,
    @Body() body: BlockUserFromGroupDTO,
  ) {
    const { groupId, message, email } = body;

    const enforcer = await this.prisma.groupMember.findUnique({
      where: {
        userId_groupId: { userId: user.id, groupId },
      },
    });

    if (!enforcer) {
      throw new UnauthorizedException({ message: 'Unauthorised' });
    }

    const blockResponse = await this.prisma.groupMember.updateMany({
      where: {
        status: { not: 'ACCEPTED' },
        user: { email },
        groupId,
      },
      data: {
        status: this.blockStatusByRoleMap[enforcer.role],
        status_remark: message,
        invitedById: user.id,
      },
    });

    return {
      message: 'block enforced successfully',
    };
  }

  @Put('block-group')
  async blockGroupInvites(
    @Body() body: BlockInvitesByInviteeDTO,
    @ReqUser() user: User,
  ) {
    const { inviteeEmail, groupId } = body;

    if (user.email !== inviteeEmail) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }
    const inviteeMemberDetails = await this.prisma.groupMember.findFirst({
      where: {
        groupId,
        user: { email: inviteeEmail },
      },
    });

    if (this.blockedFromGroupStatus.includes(inviteeMemberDetails.status)) {
      throw new UnauthorizedException({
        message: 'group has already blocked you',
      });
    }
  }
}
