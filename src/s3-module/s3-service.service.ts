import { Injectable } from '@nestjs/common';
import {
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { Folder } from '@prisma/client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
      forcePathStyle: true,
    });
  }

  async getPutSignedUrlForFile(
    parentFolder: Folder,
    {
      fileName,
      createdBy,
      contentType,
    }: {
      fileName: string;
      createdBy: { email: string; id: string };
      contentType: string;
    },
  ) {
    const fileId = uuidv4();
    const command: PutObjectCommandInput = {
      Key: `${parentFolder.s3Key}/${fileId}`,
      Bucket: process.env.AWS_BUCKET_NAME,
      ContentType: contentType,
      Metadata: {
        createdbyemail: createdBy.email,
        filesystempath: `${parentFolder.fileSystemPath}${fileName}`,
        createdbyid: createdBy.id,
        fileid: fileId, // '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'
      },
    };

    return getSignedUrl(this.s3Client, new PutObjectCommand(command));
  }
}
