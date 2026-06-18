import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const env = {
  port: Number(process.env.PORT) || 8099,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dataDir: process.env.DATA_DIR ?? path.resolve(__dirname, '../../data'),
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
  chromeChannel: (process.env.CHROME_CHANNEL ?? 'chrome') as 'chrome' | 'chrome-beta' | 'msedge',
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH ?? '',
};
