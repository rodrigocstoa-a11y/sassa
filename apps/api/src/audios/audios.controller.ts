import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  audioGenerationRequestSchema,
  audioListQuerySchema,
  audioUpdateSchema,
  audioUploadQuerySchema,
  type AudioGenerationRequest,
  type AudioListQuery,
  type AudioUpdateInput,
  type AudioUploadQuery,
} from '@rrn/shared';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { AudioGenerationService } from './audio-generation.service';
import { AudiosService } from './audios.service';

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

  /** O corpo da requisição é o arquivo de áudio (Content-Type audio/*); metadados vão na query. */
  @Post('upload')
  upload(@Query(new ZodValidationPipe(audioUploadQuerySchema)) query: AudioUploadQuery, @Req() req: Request) {
    const length = req.headers['content-length'];
    return this.audios.importUpload(query, req, length ? Number(length) : undefined);
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

  /** Streaming com suporte a Range (permite pausar/avançar no player). `?download=1` força o download. */
  @Get(':id/file')
  async file(@Param('id') id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    const file = this.audios.fileFor(id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (download) res.attachment(file.downloadName);
    await new Promise<void>((done) => {
      res.sendFile(file.path, { dotfiles: 'allow', acceptRanges: true }, (err) => {
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
  retry(@Param('id') id: string) {
    return this.generation.retry(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.audios.remove(id);
  }
}
