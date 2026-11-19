import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tap } from 'rxjs';
import type { z } from 'zod';
import { ENV, type Env } from '../env/env.module.js';
import { RESPONSE_SCHEMA_KEY } from './contract.decorator.js';

/** In dev and test, parses each response with the schema its route declared; a mismatch becomes a 500. */
@Injectable()
export class OutputValidationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const schema = this.reflector.get<z.ZodTypeAny | undefined>(
      RESPONSE_SCHEMA_KEY,
      context.getHandler(),
    );
    if (!schema || this.env.NODE_ENV === 'production') return next.handle();
    return next.handle().pipe(tap((body) => schema.parse(body)));
  }
}
