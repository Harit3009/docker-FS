import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { logLevel } from 'kafkajs';
import { Kafka, Producer } from 'kafkajs';

// Custom Logger Function
const PrettyLogCreator = (logger: Logger) => {
  return ({ namespace, level, label, log }: any) => {
    const { message, ...extra } = log;

    // Maps Kafka levels to Console colors (optional but nice)
    const prefix = `[${namespace}] ${label}:`;

    // 1. Print the Main Message
    console.log(`${prefix} ${message}`);

    // 2. Pretty Print the details (if any exist)
    if (Object.keys(extra).length > 0) {
      logger.log(JSON.stringify(extra, null, 2)); // <--- The Magic: Indentation
    }
  };
};

@Injectable()
export class KafkaService {
  public kafka: Kafka;
  producer: Producer;
  isKafkaConnected: boolean = false;

  connectionReadyEventEmitter = new EventEmitter2({
    maxListeners: Infinity,
  });
  constructor() {
    this.kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKERS],
      clientId: process.env.KAFKA_CLIENT_ID,
      logCreator: (logLevel: logLevel) =>
        PrettyLogCreator(new Logger('General Kafka Logger')),
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit() {
    this.initializeKafkaConnection();
  }

  private async initializeKafkaConnection() {
    await this.producer.connect();
    this.connectionReadyEventEmitter.addListener('producer connected', () => {
      this.isKafkaConnected = true;
    });
    this.connectionReadyEventEmitter.emit('producer connected');
  }
}
