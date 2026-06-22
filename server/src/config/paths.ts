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
  youtubeChannelsDir: path.join(env.dataDir, 'youtube-channels'),
  sourceChannels: path.join(env.dataDir, 'source-channels.json'),
  sourcesDir: path.join(env.dataDir, 'sources'),
  chromeProfiles: path.join(env.dataDir, 'chrome-profiles.json'),
  chromeProfilesDir: path.join(env.dataDir, 'chrome-profiles'),
  reupVideoDownloadsDir: path.join(env.dataDir, 'renders', 'downloads'),
  reupVideoOutputDir: path.join(env.dataDir, 'renders', 'reup'),
  taskQueueDir: path.join(env.dataDir, 'task-queue'),
  mediaDownloadsDir: path.join(env.dataDir, 'media-downloads'),
  prompts: path.join(env.dataDir, 'prompts.json'),
  promptsSettings: path.join(env.dataDir, 'prompts-settings.json'),
  promptsDir: path.join(env.dataDir, 'prompts'),
  playgroundDir: path.join(env.dataDir, 'playground'),
  reupSiAssetsDir: path.join(env.dataDir, 'assets'),
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

export function youtubeChannelDir(channelId: string): string {
  return path.join(paths.youtubeChannelsDir, channelId);
}

export function youtubeChannelVideosFile(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), 'videos.json');
}

export function youtubeChannelVideoDir(channelId: string, youtubeVideoId: string): string {
  return path.join(youtubeChannelDir(channelId), 'videos', youtubeVideoId);
}

/** Canonical `videos/{id}` first, then legacy `{id}` directly under channel dir. */
export function resolveYoutubeChannelVideoDir(channelId: string, youtubeVideoId: string): string | null {
  const candidates = [
    youtubeChannelVideoDir(channelId, youtubeVideoId),
    path.join(youtubeChannelDir(channelId), youtubeVideoId),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

export function youtubeChannelVideoPrepareFile(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), 'video-prepare.json');
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
    paths.youtubeChannelsDir,
    paths.promptsDir,
    paths.playgroundDir,
    paths.reupSiAssetsDir,
    path.join(paths.reupSiAssetsDir, 'noise'),
    path.join(paths.reupSiAssetsDir, 'overlay'),
    path.join(paths.reupSiAssetsDir, 'fonts'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
