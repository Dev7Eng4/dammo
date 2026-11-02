import { AppError } from '../../shared/http/errors.js';

export interface PcmWav {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Buffer;
}

/** Minimal RIFF/WAVE reader for the uncompressed PCM files TTS engines return. */
export function parseWav(buffer: Buffer): PcmWav {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new AppError('Not a RIFF/WAVE file', 500, 'WAV_INVALID');
  }

  let offset = 12;
  let format: Omit<PcmWav, 'data'> | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      format = {
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!format) throw new AppError('WAV data chunk before fmt chunk', 500, 'WAV_INVALID');
      return { ...format, data: buffer.subarray(body, Math.min(body + size, buffer.length)) };
    }
    offset = body + size + (size % 2);
  }
  throw new AppError('WAV has no data chunk', 500, 'WAV_INVALID');
}

export function wavDurationSec(wav: PcmWav): number {
  const bytesPerSecond = wav.sampleRate * wav.channels * (wav.bitsPerSample / 8);
  return bytesPerSecond > 0 ? wav.data.length / bytesPerSecond : 0;
}

export function silencePcm(like: PcmWav, seconds: number): Buffer {
  const frameBytes = like.channels * (like.bitsPerSample / 8);
  return Buffer.alloc(Math.max(0, Math.round(seconds * like.sampleRate)) * frameBytes);
}

/** Concatenates PCM chunks that share the format of `like` into one WAV file. */
export function encodeWav(like: Omit<PcmWav, 'data'>, chunks: Buffer[]): Buffer {
  const data = Buffer.concat(chunks);
  const header = Buffer.alloc(44);
  const byteRate = like.sampleRate * like.channels * (like.bitsPerSample / 8);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(like.channels, 22);
  header.writeUInt32LE(like.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(like.channels * (like.bitsPerSample / 8), 32);
  header.writeUInt16LE(like.bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
