import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  audioGenerationRequestSchema,
  audioListQuerySchema,
  audioUpdateSchema,
  audioUploadCompleteSchema,
  audioUploadInitSchema,
  type AudioGenerationRequest,
  type AudioListQuery,
  type AudioUpdateInput,
  type AudioUploadComplete,
  type AudioUploadInit,
} from '@rrn/shared';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { AudioGenerationService } from './audio-generation.service';
import { AudiosService } from './audios.service';

const estimateSchema = z.object({ scriptId: z.string().min(1), voiceId: z.string().min(1) });
const retrySchema = z.object({ approvedMaxCostUsd: z.number().min(0).optional() }).default({});

@Controller('audios')
export class AudiosController {
  constructor(
    private readonly audios: AudiosService,
    private readonly generation: AudioGenerationService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(audioListQuerySchema)) query: AudioListQuery) {
    return this.audios.list(query);
  }

  @Get('generation/status')
  generationStatus() {
    return this.generation.status();
  }

  @Get('voices')
  voices(@Query('language') language?: string) {
    return this.generation.voices(language);
  }

  /** Envio em 2 etapas: (1) pede uma URL assinada, (2) o navegador envia o arquivo e a API confere e cadastra. */
  @Post('uploads')
  initUpload(@Body(new ZodValidationPipe(audioUploadInitSchema)) body: AudioUploadInit) {
    return this.audios.initUpload(body);
  }

  @Post('uploads/complete')
  @HttpCode(201)
  completeUpload(@Body(new ZodValidationPipe(audioUploadCompleteSchema)) body: AudioUploadComplete) {
    return this.audios.completeUpload(body.uploadToken);
  }

  @Post('generation/estimate')
  @HttpCode(200)
  estimate(@Body(new ZodValidationPipe(estimateSchema)) body: { scriptId: string; voiceId: string }) {
    return this.generation.estimate(body.scriptId, body.voiceId);
  }

  /** Sem provedor TTS responde 501; nunca cria um áudio simulado. */
  @Post('generate')
  @HttpCode(202)
  generate(@Body(new ZodValidationPipe(audioGenerationRequestSchema)) body: AudioGenerationRequest) {
    return this.generation.start(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.audios.get(id);
  }

  /** Arquivo de áudio: redirecionamento assinado (S3/R2) ou streaming local com Range. `?download=1` baixa. */
  @Get(':id/file')
  async file(@Param('id') id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    const file = await this.audios.fileFor(id, !!download);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.target.kind === 'redirect') {
      res.setHeader('Cache-Control', 'private, no-store');
      res.redirect(302, file.target.url);
      return;
    }
    res.setHeader('Content-Type', file.mimeType);
    if (download) res.attachment(file.downloadName);
    await new Promise<void>((done) => {
      res.sendFile((file.target as { path: string }).path, { dotfiles: 'allow', acceptRanges: true }, (err) => {
        if (err && !res.headersSent) res.status(404).json({ message: 'Arquivo de áudio não encontrado no armazenamento' });
        done();
      });
    });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(audioUpdateSchema)) body: AudioUpdateInput) {
    return this.audios.update(id, body);
  }

  @Post(':id/retry')
  @HttpCode(202)
  retry(@Param('id') id: string, @Body(new ZodValidationPipe(retrySchema)) body: { approvedMaxCostUsd?: number }) {
    return this.generation.retry(id, body.approvedMaxCostUsd);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.audios.remove(id);
  }
}
