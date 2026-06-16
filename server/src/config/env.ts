import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dataDir: process.env.DATA_DIR ?? path.resolve(__dirname, '../../data'),
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
};
