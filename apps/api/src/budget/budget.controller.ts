import { Body, Controller, Get, Put } from '@nestjs/common';
import { budgetUpdateSchema, type BudgetUpdate } from '@rrn/shared';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { BudgetService } from './budget.service';

@Controller('budget')
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  @Get()
  status() {
    return this.budget.status();
  }

  @Put()
  update(@Body(new ZodValidationPipe(budgetUpdateSchema)) body: BudgetUpdate) {
    return this.budget.setLimit(body);
  }

  @Get('events')
  events() {
    return this.budget.events();
  }
}
