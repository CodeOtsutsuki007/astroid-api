import { Param } from '@nestjs/common';
import { ZodType } from 'zod';
import { ZodValidationPipe, ZodValidationPipeOptions } from '../pipes/zod-validation.pipe';

export function ZodParam<T>(schema: ZodType<T>, options?: ZodValidationPipeOptions) {
  return Param(new ZodValidationPipe(schema, options));
}
