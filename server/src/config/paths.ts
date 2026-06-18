import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export const paths = {
  dataDir: env.dataDir,
  mailAccounts: path.join(env.dataDir, 'mail-accounts.json'),
  dashboard: path.join(env.dataDir, 'dashboard.json'),
  renderJobsDir: path.join(env.dataDir, 'renders', 'jobs'),
  renderOutputDir: path.join(env.dataDir, 'renders', 'output'),
  importsDir: path.join(env.dataDir, 'imports'),
  youtubeChannels: path.join(env.dataDir, 'youtube-channels.json'),
  sourceChannels: path.join(env.dataDir, 'source-channels.json'),
  sourcesDir: path.join(env.dataDir, 'sources'),
  chromeProfiles: path.join(env.dataDir, 'chrome-profiles.json'),
  chromeProfilesDir: path.join(env.dataDir, 'chrome-profiles'),
  reupVideoHistory: path.join(env.dataDir, 'reup-video-history.json'),
  reupVideoDownloadsDir: path.join(env.dataDir, 'renders', 'downloads'),
  reupVideoOutputDir: path.join(env.dataDir, 'renders', 'reup'),
  taskQueueDir: path.join(env.dataDir, 'task-queue'),
  mediaDownloadsDir: path.join(env.dataDir, 'media-downloads'),
  prompts: path.join(env.dataDir, 'prompts.json'),
  promptsSettings: path.join(env.dataDir, 'prompts-settings.json'),
  promptsDir: path.join(env.dataDir, 'prompts'),
};

export function sourceVideosFile(sourceId: string): string {
  return path.join(paths.sourcesDir, `${sourceId}.json`);
}

export function mediaDownloadDir(platform: string, mediaId: string): string {
  return path.join(paths.mediaDownloadsDir, platform, mediaId);
}

export function promptTemplateFile(language: string, key: string): string {
  return path.join(paths.promptsDir, language, `${key}.js`);
}

export function chromeProfileDir(profileId: string): string {
  return path.join(paths.chromeProfilesDir, profileId);
}

export function ensureDataDirs(): void {
  const dirs = [
    paths.dataDir,
    paths.renderJobsDir,
    paths.renderOutputDir,
    paths.importsDir,
    paths.sourcesDir,
    paths.chromeProfilesDir,
    paths.reupVideoDownloadsDir,
    paths.reupVideoOutputDir,
    paths.taskQueueDir,
    paths.mediaDownloadsDir,
    paths.promptsDir,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
