import { GROUP_MEMBER_STATUS, GROUP_ROLE } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateGroupRequestDTO {
  @IsString()
  @IsNotEmpty()
  groupName: string;
}

export class CreateInviteForMemberDTO {
  @IsUUID()
  groupId: string;
  @IsString()
  @IsNotEmpty()
  email: string;
  @IsString()
  @IsNotEmpty()
  role: GROUP_ROLE;
  @IsString()
  @IsNotEmpty()
  status: GROUP_MEMBER_STATUS;
  @IsString()
  message: string;
  @IsBoolean()
  @IsOptional()
  override: string;
}

export class BlockUserFromGroupDTO {
  @IsUUID()
  groupId: string;
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class BlockInvitesByInviteeDTO {
  @IsUUID()
  groupId: string;
  @IsString()
  @IsNotEmpty()
  inviteeEmail: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
