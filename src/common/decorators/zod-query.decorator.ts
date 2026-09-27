import { Query } from '@nestjs/common';
import { ZodType } from 'zod';
import { ZodValidationPipe, ZodValidationPipeOptions } from '../pipes/zod-validation.pipe';

export function ZodQuery<T>(schema: ZodType<T>, options?: ZodValidationPipeOptions) {
  return Query(new ZodValidationPipe(schema, options));
}
