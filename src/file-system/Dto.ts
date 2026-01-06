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

export class GetMultipartURLsBodyDto {
  @IsString()
  uploadId: string;
  @IsInt()
  partCount: number;
  @IsString()
  s3Key: string;
  @IsString()
  parentFolderId: string;
}

export class MultipartPartArrayDto {
  @IsNumber()
  @IsNotEmpty()
  partNumber: number;

  @IsString()
  @IsNotEmpty()
  etag: string;
}

export class CompleteMultipartUploadDto {
  @IsString()
  uploadId: string;

  @IsString()
  s3Key: string;

  @IsString()
  parentFolderId: string;

  @IsArray()
  @ValidateNested({ each: true }) // <--- Validates every item in the array
  @Type(() => MultipartPartArrayDto) // <--- CRITICAL: Transforms plain objects to class instances
  parts: { partNumber: number; etag: string }[];
}

export class CreateFolderBodyDto {
  @IsString()
  parentFolderId: string;
  @IsString()
  folderName: string;
}

export class ListRecordDto {
  @IsUUID()
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
  @IsUUID()
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
  @IsUUID()
  folderId: string;
}

export class DeleteFileRequestParamsDto {
  @IsUUID()
  fileId: string;
}

export class GetSignedUrlParamsDTO {
  @IsUUID()
  fileId: string;
}

export class InitiateFolderUploadDTO {
  @IsUUID()
  parentFolderId: string;
  @IsString()
  folderName: string;
  @IsBoolean()
  @IsOptional()
  overWrite?: boolean;
}
