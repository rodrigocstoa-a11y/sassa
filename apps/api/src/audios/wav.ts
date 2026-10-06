export interface WavInfo {
  fmt: Buffer;
  data: Buffer;
  byteRate: number;
}

export function parseWav(buf: Buffer): WavInfo {
  if (buf.length < 12 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') {
    throw new Error('Arquivo WAV inválido');
  }
  let fmt: Buffer | undefined;
  let data: Buffer | undefined;
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    const body = o + 8;
    // Em WAV "em streaming" o tamanho do chunk data pode ser 0 ou 0xFFFFFFFF: usa o resto do arquivo.
    const end = id === 'data' && (size === 0 || size === 0xffffffff) ? buf.length : Math.min(body + size, buf.length);
    if (id === 'fmt ') fmt = buf.subarray(body, end);
    if (id === 'data') {
      data = buf.subarray(body, end);
      break;
    }
    o = body + size + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data) throw new Error('WAV sem chunks fmt/data');
  return { fmt, data, byteRate: fmt.readUInt32LE(8) };
}

/** Junta WAVs com o mesmo formato (taxa, canais, bits) em um único arquivo. */
export function joinWavs(parts: Buffer[]): { buffer: Buffer; durationMs: number } {
  if (parts.length === 0) throw new Error('Nenhuma parte para juntar');
  const infos = parts.map(parseWav);
  const { fmt, byteRate } = infos[0];
  if (infos.some((i) => !i.fmt.equals(fmt))) throw new Error('As partes WAV têm formatos diferentes e não podem ser juntadas');
  const dataLen = infos.reduce((n, i) => n + i.data.length, 0);
  const fmtPad = fmt.length % 2;
  const riffSize = 4 + 8 + fmt.length + fmtPad + 8 + dataLen + (dataLen % 2);
  if (riffSize > 0xffffffff) throw new Error('O WAV resultante excede 4 GB');
  const header = Buffer.alloc(12 + 8 + fmt.length + fmtPad + 8);
  let o = 0;
  header.write('RIFF', o, 'latin1'); o += 4;
  header.writeUInt32LE(riffSize, o); o += 4;
  header.write('WAVE', o, 'latin1'); o += 4;
  header.write('fmt ', o, 'latin1'); o += 4;
  header.writeUInt32LE(fmt.length, o); o += 4;
  fmt.copy(header, o); o += fmt.length + fmtPad;
  header.write('data', o, 'latin1'); o += 4;
  header.writeUInt32LE(dataLen, o);
  const pad = dataLen % 2 ? [Buffer.alloc(1)] : [];
  return {
    buffer: Buffer.concat([header, ...infos.map((i) => i.data), ...pad]),
    durationMs: byteRate > 0 ? Math.round((dataLen / byteRate) * 1000) : 0,
  };
}
