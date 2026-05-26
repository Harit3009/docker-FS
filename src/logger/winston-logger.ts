import {
  WinstonModule,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

export const winstonLogger = WinstonModule.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.ms(), // Adds the timing info
        // This is the magic line that restores your colored service names
        nestWinstonModuleUtilities.format.nestLike('FS-System', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    new LokiTransport({
      host: 'http://localhost:3100',
      json: true,
      labels: { app: 'fs-distributed-system' },
      batching: false,
      replaceTimestamp: true,
    }),
  ],
});
