import { Module } from '@nestjs/common';
import { FileSystemController } from './file-system.controller';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { S3ModuleModule } from 'src/s3-module/s3-module.module';

@Module({
  controllers: [FileSystemController],
  imports: [AuthModule, PrismaModule, S3ModuleModule],
})
export class FileSystemModule {}
