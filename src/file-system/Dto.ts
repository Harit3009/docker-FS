import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CursorWithId {
  @IsString()
  id: string;
}

export class GetPutSignedURLBodyDto {
  @IsString()
  parentFolderId: string;
  @IsString()
  filename: string;
  @IsString()
  @IsOptional()
  contentType?: string;
  @IsBoolean()
  @IsOptional()
  overwriteIfExisting;
}

export class CreateFolderBodyDto {
  @IsString()
  parentFolderId: string;
  @IsString()
  folderName: string;
}

export class ListRecordDto {
  @IsString()
  parentFolderId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit: number;

  @IsOptional()
  @Type(() => String)
  cursor: string;
}

export class RenameRecordDTO {
  @IsString()
  folderToRenameId: string;

  @IsString()
  newName: string;
}

export class WithBigIntSize {
  // Logic for 'size' lives here once
  @Transform(({ value }) => value.toString())
  size: bigint;
}

export class ListRecordResponseDto extends WithBigIntSize {
  @IsUUID()
  id: string;
  @IsString()
  fileSystemPath: string;
}

export class DeleteFolderRequestParamsDto {
  @IsString()
  @IsUUID()
  folderId: string;
}

export class DeleteFileRequestParamsDto {
  @IsString()
  @IsUUID()
  fileId: string;
}

export class GetSignedUrlParamsDTO {
  @IsString()
  @IsUUID()
  fileId: string;
}
