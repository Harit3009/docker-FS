import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Prisma, User } from '@prisma/client';
import { PASSPORT_STRATEGIES } from '../../constants';
import { ReqUser } from 'src/decorators/param-decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3-module/s3-service.service';
import { v4 as uuidV4 } from 'uuid';
import {
  CompleteMultipartUploadDto,
  CreateFolderBodyDto,
  DeleteFileRequestParamsDto,
  DeleteFolderRequestParamsDto,
  GetMultipartURLsBodyDto,
  GetPutSignedURLBodyDto,
  GetSignedUrlParamsDTO,
  InitiateFolderUploadDTO,
  ListRecordDto,
  ListRecordResponseDto,
  RenameRecordDTO,
} from './Dto';
import { plainToInstance } from 'class-transformer';
import { KafkaDeleteConsumerService } from 'src/bridge/kafka-delete-consumer/kafka-delete-consumer.service';
import path from 'path';

@UseGuards(AuthGuard([PASSPORT_STRATEGIES.INCOMING_JWT_VERIFICATION]))
@Controller('file-system')
export class FileSystemController {
  private logger = new Logger('file system controller');
  constructor(
    private s3Service: S3Service,
    private prisma: PrismaService,
    private kafkaDelPublisher: KafkaDeleteConsumerService,
  ) {}

  @Get('list-directories-by-parent')
  async getDirectoryListingByParentId(
    @Query() params: ListRecordDto,
    @ReqUser() user: User,
  ) {
    const { limit = 10, parentFolderId, cursor } = params;
    const folder = this.prisma.extended.folder.findFirst({
      where: {
        id: params.parentFolderId,
        createdById: user.id,
      },
    });

    if (!folder) {
      throw new UnauthorizedException('Unauthorised to access folder');
    }

    const args: Prisma.FolderFindManyArgs = {
      where: {
        parentId: parentFolderId,
      },
      take: limit + 1,
    };

    if (cursor) {
      args.cursor = { id: cursor };
    }

    const data = await this.prisma.extended.folder.findMany(args);
    let cursorId;
    const serializedData = plainToInstance(ListRecordResponseDto, data);
    if (serializedData.length === limit + 1) {
      const { id } = serializedData.pop();
      cursorId = id;
    }
    return {
      data: serializedData,
      cursorId,
    };
  }

  @Get('list-files-by-parent')
  async getFileListingByParentId(
    @Query() params: ListRecordDto,
    @ReqUser() user: User,
  ) {
    const { limit = 10, parentFolderId, cursor } = params;

    const folder = this.prisma.extended.folder.findFirst({
      where: {
        id: params.parentFolderId,
        createdById: user.id,
      },
    });

    if (!folder) {
      throw new UnauthorizedException('No Folder found!');
    }

    const args: Prisma.FileFindManyArgs = {
      where: {
        parentId: parentFolderId,
      },
      take: limit + 1,
    };

    if (cursor) {
      args.cursor = { id: cursor };
    }

    const data = await this.prisma.extended.file.findMany(args);
    let cursorId;
    const serializedData = plainToInstance(ListRecordResponseDto, data);

    if (serializedData.length === limit + 1) {
      const { id } = serializedData.pop();
      cursorId = id;
    }

    return {
      data: serializedData,
      cursorId,
    };
  }

  @Post('put-signed-url')
  async getPutSignedUrl(
    @ReqUser() user: User,
    @Body() body: GetPutSignedURLBodyDto,
  ) {
    const folder = await this.prisma.getFolderById(body.parentFolderId);

    if (folder.createdById !== user.id) {
      throw new UnauthorizedException('Does not exist');
    }

    const existing = await this.prisma.extended.file.findFirst({
      where: {
        createdById: user.id,
        fileSystemPath: `${folder.fileSystemPath}${body.filename}`,
      },
    });

    if (!body.overwriteIfExisting && existing) {
      throw new HttpException({ message: 'duplicate' }, HttpStatus.CONFLICT);
    }

    const url = await this.s3Service.getPutSignedUrlForFile(folder, {
      fileName: body.filename,
      createdBy: { email: user.email, id: user.id },
      contentType: body.contentType,
      overWrite: body.overwriteIfExisting,
    });
    return { url };
  }

  @Get('get-signed-url/:fileId')
  async getSignedUrl(
    @ReqUser() user: User,
    @Param() param: GetSignedUrlParamsDTO,
  ) {
    const file = await this.prisma.extended.file.findUnique({
      where: { id: param.fileId, createdById: user.id },
    });
    if (!file) {
      throw new UnauthorizedException('404');
    }
    const url = await this.s3Service.getSignedUrlForDownload(file.s3Key);
    return { url };
  }

  @Post('create-folder')
  async createFolder(@Body() body: CreateFolderBodyDto, @ReqUser() user: User) {
    const parenFolder = await this.prisma.extended.folder.findUnique({
      where: {
        id: body.parentFolderId,
        createdById: user.id,
      },
    });

    if (!parenFolder) {
      throw new UnauthorizedException('Folder access unauthorized');
    }

    const createdFolderId = uuidV4();

    const data = await this.prisma.folder.create({
      data: {
        fileSystemPath: parenFolder.fileSystemPath + body.folderName + '/',
        createdBy: { connect: { id: user.id } },
        id: createdFolderId,
        parent: { connect: { id: parenFolder.id } },
      },
    });
    return data;
  }

  @Put('rename-folder')
  async RenameFolder(@Body() body: RenameRecordDTO, @ReqUser() user: User) {
    const folder = await this.prisma.extended.folder.findUnique({
      where: {
        id: body.folderToRenameId,
        createdById: user.id,
      },
    });
    if (!folder) {
      throw new UnauthorizedException('Unauthorized');
    }

    const oldPath = folder.fileSystemPath;
    const split = folder.fileSystemPath.split('/');
    split[split.length - 2] = body.newName;
    const newPath = split.join('/') + '/';

    await this.prisma.$transaction(async (tx) => {
      await tx.folder.update({
        where: { id: folder.id },
        data: {
          fileSystemPath: newPath,
        },
      });

      await tx.$executeRaw`
    UPDATE "Folder"
    SET "fileSystemPath" = REPLACE("fileSystemPath", ${oldPath}, ${newPath})
    WHERE "fileSystemPath" LIKE ${oldPath + '%'}
  `;

      await tx.$executeRaw`
    UPDATE "File"
    SET "fileSystemPath" = REPLACE("fileSystemPath", ${oldPath}, ${newPath})
    WHERE "fileSystemPath" LIKE ${oldPath + '%'}
  `;
    });

    return {
      message: `renamed ${oldPath} to ${newPath}`,
    };
  }

  @Delete('folder/:folderId')
  async deleteFolder(
    @ReqUser() user: User,
    @Param() param: DeleteFolderRequestParamsDto,
  ) {
    const folderToDelete = await this.prisma.extended.folder.findUnique({
      where: {
        id: param.folderId,
        createdById: user.id,
      },
    });

    if (!folderToDelete) {
      throw new UnauthorizedException('Unknown Folder');
    }

    await this.prisma.$transaction(async (tx) => {
      const { size, parentId } = await tx.folder.update({
        where: {
          id: param.folderId,
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
        select: {
          size: true,
          parentId: true,
        },
      });
      await this.prisma.updateSize(tx, size * BigInt(-1), parentId);
    });

    await this.kafkaDelPublisher.publishDeleteFolderRoot(folderToDelete);

    return {
      deletedFolder: param.folderId,
    };
  }

  @Delete('file/:fileId')
  async deleteFile(
    @ReqUser() user: User,
    @Param() param: DeleteFileRequestParamsDto,
  ) {
    const fileToDelete = await this.prisma.extended.file.findUnique({
      where: {
        id: param.fileId,
        createdById: user.id,
      },
    });

    if (!fileToDelete) {
      throw new UnauthorizedException('Unknown Folder');
    }

    await this.prisma.$transaction(async (tx) => {
      const { parentId, size } = await tx.file.update({
        where: {
          id: param.fileId,
        },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
        },
        select: {
          parentId: true,
          size: true,
        },
      });

      await this.prisma.updateSize(tx, size * BigInt(-1), parentId);
    });

    return {
      deletedFile: param.fileId,
    };
  }

  @Post('multipart-upload/get-upload-id')
  async multiPartUploadId(
    @Body() body: GetPutSignedURLBodyDto,
    @ReqUser() user: User,
  ) {
    const parentFolder = await this.prisma.extended.folder.findUnique({
      where: {
        id: body.parentFolderId,
      },
    });

    if (parentFolder.createdById !== user.id) {
      throw new UnauthorizedException('Does not exist');
    }

    const existing = await this.prisma.extended.file.findFirst({
      where: {
        createdById: user.id,
        fileSystemPath: `${parentFolder.fileSystemPath}${body.filename}`,
      },
    });

    if (!body.overwriteIfExisting && existing) {
      throw new HttpException({ message: 'duplicate' }, HttpStatus.CONFLICT);
    }

    const { UploadId, s3Key } = await this.s3Service.getMultiPartUploadId(
      parentFolder,
      {
        contentType: body.contentType,
        fileName: body.filename,
        overWrite: body.overwriteIfExisting,
        createdBy: {
          id: user.id,
          email: user.email,
        },
      },
    );

    return {
      UploadId,
      s3Key,
    };
  }

  @Post('multipart-upload/get-upload-urls')
  async multiPartUploadUrls(
    @Body() body: GetMultipartURLsBodyDto,
    @ReqUser() user: User,
  ) {
    const { s3Key, uploadId, parentFolderId, partCount } = body;

    const parentFolder = await this.prisma.extended.folder.findUnique({
      where: { id: parentFolderId },
    });

    if (parentFolder.createdById !== user.id) {
      throw new UnauthorizedException('Does not exist');
    }

    const promises = [];
    for (let i = 1; i <= partCount; i++) {
      promises.push(this.s3Service.getMultiPartUploadUrl(s3Key, uploadId, i));
    }
    const urls = await Promise.all(promises);

    return {
      urls,
    };
  }

  @Post('multipart-upload/complete-upload')
  async completeMultipartUpload(
    @Body() body: CompleteMultipartUploadDto,
    @ReqUser() user: User,
  ) {
    const { s3Key, uploadId, parentFolderId, parts } = body;
    const parentFolder = await this.prisma.extended.folder.findUnique({
      where: { id: parentFolderId },
    });
    if (parentFolder.createdById !== user.id) {
      throw new UnauthorizedException('Does not exist');
    }

    await this.s3Service.completeMultipartUpload(s3Key, uploadId, parts);

    return {
      message: 'sucessfully uploaded the records',
    };
  }

  @Post('folder-upload/initiate')
  async folderUploadInitiation(
    @Body() body: InitiateFolderUploadDTO,
    @ReqUser() user: User,
  ) {
    const { folderName, parentFolderId, overWrite } = body;

    const parentFolder = await this.prisma.extended.folder.findUnique({
      where: { id: parentFolderId, createdById: user.id },
    });

    if (!parentFolder) {
      throw new UnauthorizedException('Does not exist');
    }

    const existing = await this.prisma.extended.folder.findFirst({
      where: {
        createdById: user.id,
        fileSystemPath: `${parentFolder.fileSystemPath}${body.folderName}`,
      },
    });

    if (!body.overWrite && existing) {
      throw new HttpException({ message: 'duplicate' }, HttpStatus.CONFLICT);
    }

    const { UploadId, s3Key } = await this.s3Service.getMultiPartUploadId(
      parentFolder,
      {
        overWrite,
        fileName: folderName,
        createdBy: { id: user.id, email: user.email },
        contentType: 'application/x-zip-compressed',
        isZippedFolder: true,
      },
    );

    return { s3Key, UploadId };
  }
}
