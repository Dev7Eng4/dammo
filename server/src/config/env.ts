import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../.env'));

export const env = {
  port: Number(process.env.PORT) || 8099,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dataDir: process.env.DATA_DIR ?? path.resolve(__dirname, '../../data'),
  ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  /** cpu | intel | amd | nvidia — selects H.264 hardware encoder when available */
  ffmpegHwEncoder: (process.env.FFMPEG_HW_ENCODER ?? 'cpu').toLowerCase(),
  /** Parallel Ken Burns clip renders for AI slideshow (1–8, default 4). Override: SLIDESHOW_CLIP_CONCURRENCY */
  slideshowClipConcurrency: Number(process.env.SLIDESHOW_CLIP_CONCURRENCY) || 4,
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
  chromeChannel: (process.env.CHROME_CHANNEL ?? 'chrome') as 'chrome' | 'chrome-beta' | 'msedge',
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH ?? '',
  /** yt-dlp: e.g. "chrome", "chrome:Profile 1", "edge" */
  youtubeCookiesFromBrowser: process.env.YOUTUBE_COOKIES_FROM_BROWSER ?? '',
  /** yt-dlp: path to Netscape cookies.txt */
  youtubeCookiesFile: process.env.YOUTUBE_COOKIES_FILE ?? '',
  /** Đường dẫn yt-dlp.exe tùy chỉnh; fallback về binary bundled nếu không tồn tại */
  ytDlpPath: process.env.YT_DLP_PATH ?? 'D:\\yt-dlp.exe',
  gpmApiBaseUrl: process.env.GPM_API_BASE_URL ?? 'http://127.0.0.1:19995/api/v3',
  /** reCAPTCHA Enterprise site key — inspect Network tab on labs.google/fx when Flow loads */
  flowRecaptchaSiteKey: process.env.FLOW_RECAPTCHA_SITE_KEY ?? '6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV',
  flowRecaptchaAction: process.env.FLOW_RECAPTCHA_ACTION ?? 'IMAGE_GENERATE',
};
