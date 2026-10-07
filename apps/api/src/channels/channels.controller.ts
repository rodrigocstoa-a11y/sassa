import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { channelInputSchema, type ChannelInput } from '@rrn/shared';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { ChannelsService } from './channels.service';

const body = new ZodValidationPipe(channelInputSchema);

@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list() {
    return this.channels.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.channels.get(id);
  }

  @Post()
  create(@Body(body) input: ChannelInput) {
    return this.channels.create(input);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body(body) input: ChannelInput) {
    return this.channels.update(id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.channels.remove(id);
  }
}
