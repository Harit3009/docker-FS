import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as client from 'prom-client';

// This sits in the worker's global memory and auto-links to the default registry
const httpRequestsCounter = new client.Counter({
  name: 'nestjs_http_requests_total',
  help: 'Total number of HTTP requests processed by workers',
  labelNames: ['method', 'status', 'path'],
});

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        // Standardize dynamic IDs to mitigate Prometheus high cardinality memory crashes
        const sanitizedPath = url.replace(
          /\/file-system\/.+/g,
          '/file-system/:id',
        );

        httpRequestsCounter.inc({
          method,
          status: res.statusCode,
          path: sanitizedPath,
        });
      }),
    );
  }
}
