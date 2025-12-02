import { Injectable } from '@nestjs/common';
import { Consumer, Kafka, Producer } from 'kafkajs';
import {
  DeleteMessageCommand,
  Message,
  ReceiveMessageCommand,
  ReceiveMessageCommandInput,
  SQSClient,
} from '@aws-sdk/client-sqs';

@Injectable()
export class KafkaSqsService {
  kafka: Kafka;
  producer: Producer;
  dbCreateConsumer: Consumer;
  sqsS3: SQSClient;
  isPolling: Boolean = false;

  constructor() {
    this.kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKERS],
      clientId: process.env.KAFKA_CLIENT_ID,
    });
    this.producer = this.kafka.producer();
    this.dbCreateConsumer = this.kafka.consumer({
      groupId: 'db-record-creator',
    });

    this.producer.connect();
    this.dbCreateConsumer.connect();

    this.sqsS3 = new SQSClient({
      endpoint: process.env.AWS_ENDPOINT,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.isPolling = true;
    this.pollSqs();
  }

  async pollSqs() {
    while (this.isPolling) {
      const command: ReceiveMessageCommandInput = {
        QueueUrl: process.env.AWS_S3_EVENT_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
      };

      const { Messages } = await this.sqsS3.send(
        new ReceiveMessageCommand(command),
      );
      if (Messages?.length)
        for (let i = 0; i < Messages.length; i++) {
          await this.processMessage(Messages[i]);
        }
    }
  }

  async processMessage(sqsMessage: Message) {
    const body = JSON.parse(sqsMessage.Body);

    // S3 Event Structure is inside 'Records'
    if (body.Records) {
      for (const record of body.Records) {
        const s3Key = record.s3.object.key;
        console.log(`🚀 Relaying Upload Event: ${s3Key}`);

        // Push to Kafka
        await this.producer.send({
          topic: 'file-uploaded', // Your Kafka Topic
          messages: [
            {
              value: JSON.stringify({
                s3Key,
                bucket: process.env.AWS_BUCKET_NAME,
              }),
            },
          ],
        });
      }
    }

    // Delete from SQS so we don't process it again
    await this.sqsS3.send(
      new DeleteMessageCommand({
        QueueUrl: process.env.AWS_S3_EVENT_QUEUE_URL,
        ReceiptHandle: sqsMessage.ReceiptHandle,
      }),
    );
  }
}
