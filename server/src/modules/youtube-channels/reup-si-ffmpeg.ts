import { spawn } from 'node:child_process';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

export async function runFfmpegFilterComplex(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new AppError(`FFmpeg SI merge failed with code ${code}: ${stderr.slice(-800)}`, 502, 'SI_FFMPEG_FAILED'),
      );
    });

    proc.on('error', err => {
      reject(new AppError(`FFmpeg not available: ${err.message}`, 502, 'SI_FFMPEG_FAILED'));
    });
  });
}
