import { Controller, Post, Body } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { createUserSchema, CreateUserDto } from './example.dto';

@Controller('example')
export class ExampleController {
  @Post()
  createUser(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto): CreateUserDto {
    return dto;
  }
}
