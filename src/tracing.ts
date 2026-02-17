// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Jaeger's OTLP HTTP receiver runs on port 4318
const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
  traceExporter,
  serviceName: 'fs-backend-api', // This is how your app will appear in the Jaeger UI
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

// Ensure graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => console.log('Tracing terminated'));
});
