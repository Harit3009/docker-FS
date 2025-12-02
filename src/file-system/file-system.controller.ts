import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { User } from '@prisma/client';
import { AUTHGUARD_KEYS } from 'src/constants';
import { ReqUser } from 'src/decorators/param-decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from 'src/s3-module/s3-service.service';

interface GetPutSignedURLBody {
  parentFolderId: string;
  filename: string;
  contentType: string;
}

@Controller('file-system')
export class FileSystemController {
  constructor(
    private s3Service: S3Service,
    private prisma: PrismaService,
  ) {}

  @UseGuards(AuthGuard([AUTHGUARD_KEYS.INCOMING_JWT_VERIFICATION]))
  @Post('put-signed-url')
  async getPutSignedUrl(
    @ReqUser() user: User,
    @Body() body: GetPutSignedURLBody,
  ) {
    const folder = await this.prisma.getFolderById(body.parentFolderId);

    if (folder.createdById !== user.id) {
      throw new UnauthorizedException('Folder access denied');
    }

    const url = await this.s3Service.getPutSignedUrlForFile(folder, {
      fileName: body.filename,
      createdBy: { email: user.email, id: user.id },
      contentType: body.contentType,
    });
    return { url };
  }
}
