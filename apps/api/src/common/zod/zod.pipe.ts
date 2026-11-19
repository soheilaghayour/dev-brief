import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ApiException } from '../errors/api.exception.js';

/** Parses a param, query or body with a shared schema; unknown keys are stripped. */
export class ZodPipe<Schema extends z.ZodTypeAny> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new ApiException('VALIDATION_FAILED', 'The request is invalid.', {
      details: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
}
