import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export const paths = {
  dataDir: env.dataDir,
  mailAccounts: path.join(env.dataDir, 'mail-accounts.json'),
  proxies: path.join(env.dataDir, 'proxies.json'),
  proxyProviders: path.join(env.dataDir, 'proxy-providers.json'),
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
  flowProjects: path.join(env.dataDir, 'flow-projects.json'),
  gpmProfileCapabilities: path.join(env.dataDir, 'gpm-profile-capabilities.json'),
  reupVideoDownloadsDir: path.join(env.dataDir, 'renders', 'downloads'),
  reupVideoOutputDir: path.join(env.dataDir, 'renders', 'reup'),
  taskQueueDir: path.join(env.dataDir, 'task-queue'),
  mediaDownloadsDir: path.join(env.dataDir, 'media-downloads'),
  prompts: path.join(env.dataDir, 'prompts.json'),
  promptsSettings: path.join(env.dataDir, 'prompts-settings.json'),
  visualStyles: path.join(env.dataDir, 'visual-styles.json'),
  promptsDir: path.join(env.dataDir, 'prompts'),
  playgroundDir: path.join(env.dataDir, 'playground'),
  reupSiAssetsDir: path.join(env.dataDir, 'assets'),
  siLocalStockDir: path.join(env.dataDir, 'assets', 'si-local-stock'),
  siAudioBarDir: path.join(env.dataDir, 'assets', 'audioBar'),
  siTempStockDir: path.join(env.dataDir, 'assets', 'temp_stock'),
};

export function siLocalStockUsageFile(): string {
  return path.join(paths.siLocalStockDir, 'usage.json');
}

export function sourceChannelDir(sourceId: string): string {
  return path.join(paths.sourcesDir, sourceId);
}

export function sourceChannelVideosFile(sourceId: string): string {
  return path.join(sourceChannelDir(sourceId), 'videos.json');
}

/** @deprecated Use sourceChannelVideosFile — kept for legacy flat-file migration */
export function legacySourceVideosFile(sourceId: string): string {
  return path.join(paths.sourcesDir, `${sourceId}.json`);
}

export function sourceVideosFile(sourceId: string): string {
  return sourceChannelVideosFile(sourceId);
}

export function sourceChannelVideoDir(sourceId: string, videoId: string): string {
  return path.join(sourceChannelDir(sourceId), 'videos', videoId);
}

/** Canonical `videos/{id}` under source channel dir. */
export function resolveSourceChannelVideoDir(sourceId: string, videoId: string): string | null {
  const candidate = sourceChannelVideoDir(sourceId, videoId);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }
  return null;
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

export function youtubeChannelUploadsDir(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), 'uploads');
}

export function youtubeChannelUploadedVideoDir(channelId: string, youtubeVideoId: string): string {
  return path.join(youtubeChannelUploadsDir(channelId), youtubeVideoId);
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** Move a prepared video folder into `uploads/{videoId}` after YouTube upload. Never throws. */
export function moveYoutubeChannelVideoToUploads(
  channelId: string,
  videoId: string,
  sourceFolderPath?: string,
): void {
  const normalizedVideoId = videoId.trim();
  if (!normalizedVideoId) return;

  const uploadsDir = youtubeChannelUploadsDir(channelId);
  const dest = youtubeChannelUploadedVideoDir(channelId, normalizedVideoId);

  let source =
    sourceFolderPath?.trim() && isDirectory(sourceFolderPath.trim())
      ? path.resolve(sourceFolderPath.trim())
      : resolveYoutubeChannelVideoDir(channelId, normalizedVideoId);

  if (!source) {
    if (isDirectory(dest)) return;
    console.warn(
      `[youtube-upload] move to uploads: source folder not found for videoId «${normalizedVideoId}»`,
    );
    return;
  }

  source = path.resolve(source);
  const resolvedUploadsDir = path.resolve(uploadsDir);
  if (source === dest || source.startsWith(resolvedUploadsDir + path.sep)) {
    return;
  }

  if (isDirectory(dest)) {
    console.warn(
      `[youtube-upload] move to uploads: destination already exists for videoId «${normalizedVideoId}»`,
    );
    return;
  }

  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.renameSync(source, dest);
    console.log(`[youtube-upload] moved ${normalizedVideoId} → uploads/`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[youtube-upload] move to uploads failed for «${normalizedVideoId}»: ${message}`);
  }
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
    paths.siLocalStockDir,
    paths.siAudioBarDir,
    paths.siTempStockDir,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
