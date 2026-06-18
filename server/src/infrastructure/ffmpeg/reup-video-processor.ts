import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { buildReupVideoFilterGraph } from './reup-video-filters.js';

export interface ProcessReupVideoOptions {
  onStderrLine?: (line: string) => void;
}

function createStderrLineEmitter(onLine: (line: string) => void) {
  let buffer = '';

  return (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (line) onLine(line);
    }
  };
}

export async function processReupVideo(
  inputPath: string,
  outputPath: string,
  options?: ProcessReupVideoOptions,
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const filterGraph = buildReupVideoFilterGraph();
  const args = [
    '-y',
    '-i',
    inputPath,
    '-vf',
    filterGraph,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-c:a',
    'aac',
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args);

    let stderr = '';
    const emitStderrLine = options?.onStderrLine
      ? createStderrLineEmitter(options.onStderrLine)
      : null;

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      emitStderrLine?.(text);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new AppError(
          `FFmpeg reup processing failed with code ${code}: ${stderr.slice(-500)}`,
          502,
          'FFMPEG_REUP_FAILED',
        ),
      );
    });

    proc.on('error', (err) => {
      reject(
        new AppError(`FFmpeg not available: ${err.message}`, 502, 'FFMPEG_REUP_FAILED'),
      );
    });
  });
}

export function buildReupOutputPath(channelId: string, videoId: string, outputDir: string): string {
  return path.join(outputDir, `${channelId}_${videoId}_reup.mp4`);
}
