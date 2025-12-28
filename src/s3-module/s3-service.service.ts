import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectsCommand,
  DeleteObjectsCommandInput,
  GetObjectCommand,
  GetObjectCommandInput,
  HeadObjectCommand,
  HeadObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Folder } from '@prisma/client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly logger = new Logger('s3Service');
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async getPutSignedUrlForFile(
    parentFolder: Folder,
    {
      fileName,
      createdBy,
      contentType,
      overWrite = false,
    }: {
      fileName: string;
      createdBy: { email: string; id: string };
      contentType: string;
      overWrite: boolean;
    },
  ) {
    const fileId = uuidv4();

    const command: PutObjectCommandInput = {
      Key: path.join(parentFolder.createdById, fileId),
      Bucket: process.env.AWS_BUCKET_NAME,
      ContentType: contentType,
      Metadata: {
        createdbyemail: encodeURIComponent(createdBy.email),
        filesystempath: encodeURIComponent(
          `${parentFolder.fileSystemPath}${fileName}`,
        ),
        createdbyid: createdBy.id,
        fileid: fileId,
        parentid: parentFolder.id,
        overwrite: overWrite ? 'true' : 'false',
      },
    };
    return getSignedUrl(this.s3Client, new PutObjectCommand(command));
  }

  async getHeadObjectCommand(
    s3Key: string,
    bucketName: string = process.env.AWS_BUCKET_NAME,
  ) {
    try {
      this.logger.log(
        'S3key Head object requested for >>>>',
        s3Key,
        bucketName,
      );

      const command: HeadObjectCommandInput = {
        Key: s3Key,
        Bucket: bucketName,
      };

      return this.s3Client.send(new HeadObjectCommand(command));
    } catch (error) {
      this.logger.error(error);
      throw Error(error?.message || 'head object failed');
    }
  }

  async getSignedUrlForDownload(
    s3Key: string,
    bucketName: string = process.env.AWS_BUCKET_NAME,
  ) {
    const command: GetObjectCommandInput = {
      Bucket: bucketName,
      Key: s3Key,
    };

    return getSignedUrl(this.s3Client, new GetObjectCommand(command));
  }

  async batchDeleteS3Objects(
    s3Keys: string[],
    bucketName: string = process.env.AWS_BUCKET_NAME,
  ) {
    this.logger.log('s3Keys>>>>>>>>>>>', s3Keys);
    const command: DeleteObjectsCommandInput = {
      Bucket: bucketName,
      Delete: { Objects: s3Keys.map((Key) => ({ Key })) },
    };

    return this.s3Client.send(new DeleteObjectsCommand(command));
  }
}
