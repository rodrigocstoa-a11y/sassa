import { Injectable, OnModuleInit, PayloadTooLargeException } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { storagePath } from '../config';

export interface TempUpload {
  tempKey: string;
  size: number;
  /** Primeiros bytes do arquivo, para identificar o formato. */
  head: Buffer;
}

/**
 * Armazenamento de arquivos de áudio. Hoje em disco local; um adaptador S3/R2 pode
 * substituir esta classe na nuvem. As chaves são geradas pelo servidor, nunca pelo cliente.
 */
export abstract class AudioStorage {
  abstract writeTemp(stream: Readable, maxBytes: number): Promise<TempUpload>;
  abstract commit(tempKey: string, finalKey: string): Promise<void>;
  abstract discard(tempKey: string): Promise<void>;
  abstract put(key: string, data: Uint8Array): Promise<void>;
  abstract read(key: string): Promise<Buffer>;
  abstract size(key: string): Promise<number>;
  /** Caminho local do arquivo (usado para streaming com suporte a Range). */
  abstract resolve(key: string): string;
  /** Remove um arquivo ou pasta. Idempotente. */
  abstract delete(key: string): Promise<void>;
}

@Injectable()
export class LocalAudioStorage extends AudioStorage implements OnModuleInit {
  private readonly root = resolve(storagePath());

  async onModuleInit() {
    // Uploads interrompidos deixam resíduos em .tmp: limpa na inicialização.
    await rm(join(this.root, '.tmp'), { recursive: true, force: true });
  }

  resolve(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error('Chave de armazenamento inválida');
    return full;
  }

  async writeTemp(stream: Readable, maxBytes: number): Promise<TempUpload> {
    const tempKey = `.tmp/${randomUUID()}.part`;
    const path = this.resolve(tempKey);
    await mkdir(dirname(path), { recursive: true });
    let size = 0;
    const chunks: Buffer[] = [];
    let headLen = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > maxBytes) return cb(new PayloadTooLargeException(`Arquivo maior que o limite de ${Math.floor(maxBytes / 1024 / 1024)} MB`));
        if (headLen < 16) {
          chunks.push(chunk.subarray(0, 16 - headLen));
          headLen += Math.min(chunk.length, 16 - headLen);
        }
        cb(null, chunk);
      },
    });
    try {
      await pipeline(stream, counter, createWriteStream(path));
    } catch (err) {
      await rm(path, { force: true });
      throw err;
    }
    return { tempKey, size, head: Buffer.concat(chunks) };
  }

  async commit(tempKey: string, finalKey: string) {
    const target = this.resolve(finalKey);
    await mkdir(dirname(target), { recursive: true });
    await rename(this.resolve(tempKey), target);
  }

  async discard(tempKey: string) {
    await rm(this.resolve(tempKey), { force: true });
  }

  async put(key: string, data: Uint8Array) {
    const target = this.resolve(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  read(key: string) {
    return readFile(this.resolve(key));
  }

  async size(key: string) {
    return (await stat(this.resolve(key))).size;
  }

  async delete(key: string) {
    await rm(this.resolve(key), { recursive: true, force: true });
  }
}
