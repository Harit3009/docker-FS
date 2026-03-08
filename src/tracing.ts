// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { IncomingMessage } from 'http';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';

// Jaeger's OTLP HTTP receiver runs on port 4318
const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

const sdk = new NodeSDK({
  traceExporter,
  serviceName: 'fs-backend-api', // This is how your app will appear in the Jaeger UI
  instrumentations: [
    getNodeAutoInstrumentations({
      // Target the HTTP instrumentation specifically
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, request) => {
          // Check if the incoming request has an authorization header
          if (
            (request as IncomingMessage).headers &&
            (request as IncomingMessage).headers['authorization']
          ) {
            // Overwrite the attribute with a safe string
            span.setAttribute(
              'http.request.header.authorization',
              '[REDACTED]',
            );
          }

          // You can also redact other sensitive fields here like cookies or passwords
          if (
            (request as IncomingMessage).headers &&
            (request as IncomingMessage).headers['cookie']
          ) {
            span.setAttribute('http.request.header.cookie', '[REDACTED]');
          }
        },
      },
      '@opentelemetry/instrumentation-express': {
        ignoreLayersType: [ExpressLayerType.MIDDLEWARE], // This also hides those noisy "request handler" spans we discussed!
      },
    }),
  ],
});

sdk.start();

// Ensure graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => console.log('Tracing terminated'));
});
