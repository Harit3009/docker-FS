import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { FileSystemModule } from './file-system/file-system.module';
import { S3ModuleModule } from './s3-module/s3-module.module';
import { BridgeModule } from './bridge/bridge.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import {
  PrometheusModule,
  makeCounterProvider,
} from '@willsoto/nestjs-prometheus';
import { DocumentMetricService } from './document-metric/document-metric.service';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    ConfigModule.forRoot({ isGlobal: true }),
    FileSystemModule,
    S3ModuleModule,
    BridgeModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrometheusModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    /*
     custom service to store a custom count metric
      in prometheus has to be manually called within app
      just something extra pertaining to business logic
      apart from the standard telemetry
      Check document metric service for implementation detail
    */
    makeCounterProvider({
      name: 'pdfs_processed_total',
      help: 'Total number of PDFs successfully processed',
      labelNames: ['document_type', 'chunks'],
    }),
    DocumentMetricService,
  ],
})
export class AppModule {}
