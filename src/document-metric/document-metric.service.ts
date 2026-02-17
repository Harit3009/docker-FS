import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';

@Injectable()
export class DocumentMetricService {
  constructor(
    @InjectMetric('pdfs_processed_total')
    private readonly pdfCounter: Counter<string>,
  ) {}

  async processBankStatement(file: Buffer, bankName: string) {
    // 1. Your extraction logic executes here (e.g., LlamaParse)

    // 2. Increment the metric upon success
    this.pdfCounter.inc({
      document_type: 'bank_statement',
      bank_name: bankName,
    });
  }
}
