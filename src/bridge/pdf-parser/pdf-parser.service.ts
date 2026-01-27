import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as tmp from 'tmp-promise';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { S3Service } from 'src/s3-module/s3-service.service';
import { spawn } from 'child_process';
import { StreamingChunker } from './chunker';

@Injectable()
export class PdfParserService {
  constructor(private s3: S3Service) {}
  private readonly logger = new Logger(PdfParserService.name);

  async parseS3PdfAsTextStream(s3Key: string): Promise<Readable> {
    this.logger.log(`Parsing PDF from S3 Key: ${s3Key}`);
    const s3Stream: Readable = await this.s3.getObjectStream(s3Key);
    return this.parseStream(s3Stream, ` S3 Key: ${s3Key}`);
  }

  async parseStream(
    inputStream: Readable,
    identifier?: string,
  ): Promise<Readable> {
    // 1. Create a temporary file on disk (cleans up automatically)
    const { path, cleanup } = await tmp.file({ postfix: '.pdf' });

    try {
      // 2. Stream S3 -> Disk (Low RAM usage)
      const writeStream = fs.createWriteStream(path);
      await pipeline(inputStream, writeStream);
    } catch (error) {
      this.logger.error(
        `Error parsing PDF from identifier : ${identifier}: ${error}`,
      );
    }

    let cleaned = false;
    const performCleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      try {
        await cleanup();
        this.logger.log(`Cleaned up temp file: ${path}`);
      } catch (e) {
        this.logger.error(`Failed to cleanup ${path}`, e);
      }
    };

    // 3. Spawn `pdftotext` process to extract text from the PDF file
    const pdftotext = spawn('pdftotext', ['-layout', path, '-']);

    const chunker = new StreamingChunker({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    pdftotext.stdout.pipe(chunker);
    chunker.on('end', performCleanup);
    chunker.on('error', async (err) => {
      this.logger.error(`Error in chunker stream for ${identifier}: ${err}`);
      await performCleanup();
    });

    return chunker;
  }
}
