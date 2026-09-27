import { Body } from '@nestjs/common';
import { ZodType } from 'zod';
import { ZodValidationPipe, ZodValidationPipeOptions } from '../pipes/zod-validation.pipe';

export function ZodBody<T>(schema: ZodType<T>, options?: ZodValidationPipeOptions) {
  return Body(new ZodValidationPipe(schema, options));
}
