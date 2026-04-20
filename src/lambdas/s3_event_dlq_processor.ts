import { SQSEvent, SQSHandler } from 'aws-lambda';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Kafka } from 'kafkajs';
import { KAFKA_TOPIC_NAMES } from '../../constants';
import { S3FileMetaData } from '../../types/file-metadata';

// 1. Initialize Clients outside the handler for container reuse
const s3Client = new S3Client({
  endpoint: process.env.LAMBDA_AWS_ENDPOINT,
  region: process.env.AWS_REGION || 'us-east-1',
  forcePathStyle: true,
});

const kafka = new Kafka({
  brokers: [process.env.LAMBDA_KAFKA_BROKERS as string],
  clientId: process.env.KAFKA_CLIENT_ID,
});

const producer = kafka.producer();
let isProducerConnected = false;

export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log(`Processing >> ${event.Records.length} SQS messages...`);
  console.log(`broker is >> ${process.env.LAMBDA_KAFKA_BROKERS},
     clientId is >> ${process.env.KAFKA_CLIENT_ID}`);

  try {
    // 2. Ensure Kafka is connected before processing
    if (!isProducerConnected) {
      await producer.connect();
      isProducerConnected = true;
    }

    // 3. Iterate over the SQS batch
    for (const sqsRecord of event.Records) {
      const body = JSON.parse(sqsRecord.body);

      if (body.Event === 's3:TestEvent') {
        console.log('Received S3 TestEvent, safely ignoring.');
        continue; // Skip processing, but let Lambda exit successfully
      }

      // S3 Event Structure is inside 'Records'
      if (body.Records) {
        for (const s3Record of body.Records) {
          const s3Key = s3Record.s3.object.key;
          const bucket = s3Record.s3.bucket.name;

          console.log(`🚀 Relaying Upload Event: ${s3Key}`);

          // 4. Fetch Metadata using the AWS SDK
          const { Metadata } = await s3Client.send(
            new HeadObjectCommand({
              Bucket: bucket,
              Key: s3Key,
            }),
          );

          const fileMeta = Metadata as unknown as S3FileMetaData;
          const needsExtraction = fileMeta.needsextraction === 'true';

          console.log(
            `File needs extraction: ${needsExtraction}, filesystempath: ${fileMeta.filesystempath}, fileMeta: ${JSON.stringify(Metadata)} `,
          );

          // 5. Select Topic using your imported constants
          const topic = needsExtraction
            ? KAFKA_TOPIC_NAMES.FOLDER_ZIP_UPLOADED
            : KAFKA_TOPIC_NAMES.FILE_UPLOADED;

          // 6. Push to Kafka
          await producer.send({
            topic,
            messages: [
              {
                value: JSON.stringify({
                  s3Key,
                  bucket: process.env.AWS_BUCKET_NAME || bucket,
                  FileSystemPath: decodeURIComponent(fileMeta.filesystempath),
                }),
                headers: {
                  FileSystemPath: decodeURIComponent(fileMeta.filesystempath),
                  createdById: fileMeta.createdbyid,
                },
              },
            ],
          });

          console.log(`Kafka publish finished for topic: ${topic}`);
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Error processing SQS event: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
