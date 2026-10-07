import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  scriptGenerationRequestSchema,
  scriptInputSchema,
  scriptListQuerySchema,
  scriptTranslationInputSchema,
  type ScriptGenerationRequest,
  type ScriptInput,
  type ScriptListQuery,
  type ScriptTranslationInput,
} from '@rrn/shared';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { ScriptGenerationService } from './script-generation.service';
import { ScriptsService } from './scripts.service';

@Controller('scripts')
export class ScriptsController {
  constructor(
    private readonly scripts: ScriptsService,
    private readonly generation: ScriptGenerationService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(scriptListQuerySchema)) query: ScriptListQuery) {
    return this.scripts.list(query);
  }

  @Get('generation/status')
  generationStatus() {
    return this.generation.status();
  }

  /** Contrato futuro. Sem provedor LLM responde 501; nunca devolve texto simulado. */
  @Post('generate')
  generate(@Body(new ZodValidationPipe(scriptGenerationRequestSchema)) request: ScriptGenerationRequest) {
    return this.generation.generate(request);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.scripts.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(scriptInputSchema)) input: ScriptInput) {
    return this.scripts.create(input);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(scriptInputSchema)) input: ScriptInput) {
    return this.scripts.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.scripts.remove(id);
  }

  @Post(':id/translations')
  createTranslation(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(scriptTranslationInputSchema)) input: ScriptTranslationInput,
  ) {
    return this.scripts.createTranslation(id, input);
  }
}
