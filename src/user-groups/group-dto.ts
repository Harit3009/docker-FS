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

export class AddMemberToGroupReqDTO {
  @IsUUID()
  groupId: string;
  @IsString()
  @IsNotEmpty()
  email: string;
}
