import { AUDIO_FORMATS, type AudioFormatExt } from '@rrn/shared';

/** Identifica o formato pelos primeiros bytes (a extensão e o Content-Type enviados pelo cliente não são confiáveis). */
export function sniffAudioFormat(head: Buffer): AudioFormatExt | null {
  if (head.length < 4) return null;
  const ascii = (a: number, b: number) => head.toString('latin1', a, b);
  if (ascii(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3';
  if (ascii(0, 4) === 'RIFF' && head.length >= 12 && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (head.length >= 8 && ascii(4, 8) === 'ftyp') return 'm4a';
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm';
  return null;
}

export const mimeFor = (ext: AudioFormatExt): string => AUDIO_FORMATS.find((f) => f.ext === ext)!.mime;

export function extForMime(mime: string): AudioFormatExt | null {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (base === 'audio/x-wav' || base === 'audio/wave') return 'wav';
  if (base === 'audio/x-m4a' || base === 'audio/aac') return 'm4a';
  return AUDIO_FORMATS.find((f) => f.mime === base)?.ext ?? null;
}
