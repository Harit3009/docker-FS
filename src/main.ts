import './tracing';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception';
import { winstonLogger } from './logger/winston-logger';
import * as cluster from 'cluster';
import express from 'express';
import { AggregatorRegistry } from 'prom-client';
import { MetricsInterceptor } from './metrics.interceptor';

async function bootstrap() {
  // Handle BigInt serialization globally across all processes
  BigInt.prototype['toJSON'] = function () {
    return this.toString();
  };

  // Check if this execution frame is the Master Process
  if ((cluster as any).isMaster && !process.env.IS_STAND_ALONE) {
    const metricsApp = express();
    const aggregatorRegistry = new AggregatorRegistry();
    const METRICS_PORT = 9100;

    // The Master process exposes the unified metrics lane via internal IPC
    metricsApp.get('/metrics', async (req, res) => {
      try {
        const metrics = await aggregatorRegistry.clusterMetrics();
        res.set('Content-Type', aggregatorRegistry.contentType);
        res.send(metrics);
      } catch (err: unknown) {
        res
          .status(500)
          .send(`Error aggregating cluster metrics: ${(err as any).message}`);
      }
    });

    metricsApp.listen(METRICS_PORT, () => {
      winstonLogger.log(
        `📊 PM2 Master Cluster Aggregator listening on port ${METRICS_PORT}`,
      );
    });
  } else {
    // Inside the Worker Processes: Boot your standard NestJS Instance
    const app = await NestFactory.create(AppModule, {
      logger: winstonLogger,
    });

    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new MetricsInterceptor());

    const port = process.env.PORT ?? 4000;
    await app.listen(port);
    winstonLogger.log(
      `🚀 Worker ${process.pid} started NestJS application on port ${port}`,
    );
  }
}
bootstrap();
