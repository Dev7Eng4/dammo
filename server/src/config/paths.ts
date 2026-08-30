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
  gpmGroups: path.join(env.dataDir, 'gpm-groups.json'),
  reupVideoDownloadsDir: path.join(env.dataDir, 'renders', 'downloads'),
  reupVideoOutputDir: path.join(env.dataDir, 'renders', 'reup'),
  taskQueueDir: path.join(env.dataDir, 'task-queue'),
  mediaDownloadsDir: path.join(env.dataDir, 'media-downloads'),
  prompts: path.join(env.dataDir, 'prompts.json'),
  promptsSettings: path.join(env.dataDir, 'prompts-settings.json'),
  appSettings: path.join(env.dataDir, 'app-settings.json'),

  visualStyles: path.join(env.dataDir, 'visual-styles.json'),
  niches: path.join(env.dataDir, 'niches.json'),
  celebrities: path.join(env.dataDir, 'celebrities.json'),
  celebritiesDir: path.join(env.dataDir, 'celebrities'),
  smallVideoGroups: path.join(env.dataDir, 'small-video-groups.json'),
  promptsDir: path.join(env.dataDir, 'prompts'),
  playgroundDir: path.join(env.dataDir, 'playground'),
  reupSiAssetsDir: path.join(env.dataDir, 'assets'),
  siLocalStockDir: path.join(env.dataDir, 'assets', 'si-local-stock'),
  siAudioBarDir: path.join(env.dataDir, 'assets', 'audioBar'),
  siSmallVideoDir: path.join(env.dataDir, 'assets', 'small-video'),
  siSubscribeDir: path.join(env.dataDir, 'assets', 'subscribe'),
  siTempStockDir: path.join(env.dataDir, 'assets', 'temp_stock'),
};

export function celebrityDir(celebrityId: string): string {
  return path.join(paths.celebritiesDir, celebrityId);
}

export function smallVideoGroupDir(groupId: string): string {
  return path.join(paths.siSmallVideoDir, groupId);
}

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

export function recreateMetadataDir(): string {
  return path.join(paths.mediaDownloadsDir, 'youtube', 'recreate-metadata');
}

export function promptTemplateFile(language: string, key: string): string {
  const stepMatch = key.match(/^(.+)_step_(\d+)$/);
  if (stepMatch) {
    const base = stepMatch[1]!;
    const step = stepMatch[2]!;
    return path.join(paths.promptsDir, language, base, `step-${step}.js`);
  }
  return path.join(paths.promptsDir, language, key, 'step-1.js');
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

/** Returns `uploads/{videoId}/` when the post-upload archive folder exists. */
export function resolveYoutubeChannelUploadedVideoDir(
  channelId: string,
  youtubeVideoId: string,
): string | null {
  const candidate = youtubeChannelUploadedVideoDir(channelId, youtubeVideoId);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }
  return null;
}

export function youtubeChannelThumbnailBackgroundsDir(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), 'thumbnail-backgrounds');
}

export function youtubeChannelThumbnailBackgroundsTempDir(sessionId: string): string {
  return path.join(paths.youtubeChannelsDir, '_temp', sessionId, 'thumbnail-backgrounds');
}

export function youtubeChannelAvatarTempDir(sessionId: string): string {
  return path.join(paths.youtubeChannelsDir, '_temp', sessionId, 'avatar');
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

const MOVE_RETRY_DELAYS_MS = [200, 400, 800];
const RETRIABLE_MOVE_ERROR_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetriableMoveError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    RETRIABLE_MOVE_ERROR_CODES.has(String((err as NodeJS.ErrnoException).code))
  );
}

/**
 * Move a prepared video folder into `uploads/{videoId}` after YouTube upload.
 * Never throws; returns true when the folder is (or already was) in uploads.
 * Retries rename on Windows file locks (EPERM/EBUSY) and falls back to copy+delete.
 */
export async function moveYoutubeChannelVideoToUploads(
  channelId: string,
  videoId: string,
  sourceFolderPath?: string,
): Promise<boolean> {
  const normalizedVideoId = videoId.trim();
  if (!normalizedVideoId) return false;

  const uploadsDir = youtubeChannelUploadsDir(channelId);
  const dest = youtubeChannelUploadedVideoDir(channelId, normalizedVideoId);

  let source =
    sourceFolderPath?.trim() && isDirectory(sourceFolderPath.trim())
      ? path.resolve(sourceFolderPath.trim())
      : resolveYoutubeChannelVideoDir(channelId, normalizedVideoId);

  if (!source) {
    if (isDirectory(dest)) return true;
    console.warn(
      `[youtube-upload] move to uploads: source folder not found for videoId «${normalizedVideoId}»`,
    );
    return false;
  }

  source = path.resolve(source);
  const resolvedUploadsDir = path.resolve(uploadsDir);
  if (source === dest || source.startsWith(resolvedUploadsDir + path.sep)) {
    return true;
  }

  if (isDirectory(dest)) {
    console.warn(
      `[youtube-upload] move to uploads: destination already exists for videoId «${normalizedVideoId}»`,
    );
    return true;
  }

  fs.mkdirSync(uploadsDir, { recursive: true });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MOVE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      fs.renameSync(source, dest);
      console.log(`[youtube-upload] moved ${normalizedVideoId} → uploads/`);
      return true;
    } catch (err) {
      lastError = err;
      if (!isRetriableMoveError(err)) break;
      if (attempt < MOVE_RETRY_DELAYS_MS.length) {
        await sleep(MOVE_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  // Fallback: copy then delete (works even when a directory handle blocks rename)
  try {
    fs.cpSync(source, dest, { recursive: true });
    fs.rmSync(source, { recursive: true, force: true });
    console.log(`[youtube-upload] moved (copy+delete) ${normalizedVideoId} → uploads/`);
    return true;
  } catch (err) {
    fs.rmSync(dest, { recursive: true, force: true });
    const message = err instanceof Error ? err.message : String(err);
    const renameMessage = lastError instanceof Error ? lastError.message : String(lastError);
    console.warn(
      `[youtube-upload] move to uploads failed for «${normalizedVideoId}»: rename: ${renameMessage}; copy: ${message}`,
    );
    return false;
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
    path.join(paths.mediaDownloadsDir, 'youtube', 'recreate-metadata'),
    paths.youtubeChannelsDir,
    paths.promptsDir,
    paths.playgroundDir,
    paths.reupSiAssetsDir,
    path.join(paths.reupSiAssetsDir, 'noise'),
    path.join(paths.reupSiAssetsDir, 'overlay'),
    path.join(paths.reupSiAssetsDir, 'fonts'),
    paths.siLocalStockDir,
    paths.siAudioBarDir,
    paths.siSmallVideoDir,
    paths.siSubscribeDir,
    paths.siTempStockDir,
    paths.celebritiesDir,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
