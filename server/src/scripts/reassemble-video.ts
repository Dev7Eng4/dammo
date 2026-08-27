import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, resolveYoutubeChannelVideoDir } from '../config/paths.js';
import {
  attachSceneImagePaths,
  redistributeMissingSceneTimes,
  resolveAiScenePromptsFilePath,
  scenesWithImagePaths,
} from '../modules/video-production/shared/ai-video/index.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from '../modules/video-production/shared/ai-video/ai-video.types.js';
import { OUTPUT_VIDEO_BASENAME } from '../modules/video-production/shared/render-core/output-artifacts.constants.js';
import { sanitizeVideoOutputBasename } from '../modules/video-production/shared/render-core/video-output-file.js';
import { createYoutubeProductionDestination } from '../modules/video-production/adapters/youtube-production-destination.adapter.js';
import {
  resolveVideoTypeStrategy,
  type VisualAssets,
} from '../modules/video-production/pipelines/reup-audio/strategies/index.js';
import { createConsoleTaskLogger } from '../modules/video-production/pipelines/reup-audio/task-logger.js';
import type { AssembleContext } from '../modules/video-production/pipelines/reup-audio/video-task.context.js';
import { assertMediaFileComplete } from '../infrastructure/ffmpeg/ffmpeg-probe.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import { resolveChannelAvatarForVideoAssembly } from '../modules/youtube-channels/resolve-channel-avatar.js';
import { formatElapsedMs } from '../shared/timing/step-timer.js';

const AUDIO_FILE = 'audio.mp3';
const SUBTITLE_FILES = ['transcript.srt', 'transcript-updated.srt'];
const CENTER_IMAGE_FILE = 'background.jpg';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const flagIndex = process.argv.indexOf(`--${name}`);
  if (flagIndex !== -1) return process.argv[flagIndex + 1];

  return undefined;
}

async function findFirstExisting(...paths: string[]): Promise<string | null> {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // không tồn tại, thử tiếp
    }
  }
  return null;
}

/** Match the name the pipeline gave the mp4 so the rerun overwrites it in place. */
async function resolveOutputBasename(workDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(workDir, 'video-meta.json'), 'utf8');
    const parsed = JSON.parse(raw) as { metadata?: { title?: string } };
    return sanitizeVideoOutputBasename(parsed.metadata?.title ?? '');
  } catch {
    return OUTPUT_VIDEO_BASENAME;
  }
}

async function loadAiScenes(workDir: string): Promise<AiVideoScenePrompt[]> {
  const raw = await fs.readFile(resolveAiScenePromptsFilePath(workDir), 'utf8');
  const parsed = JSON.parse(raw) as AiVideoScenePromptsFile;
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error('ai-scene-prompts.json không có scene nào');
  }
  const withPaths = await attachSceneImagePaths(parsed.scenes, workDir);
  return scenesWithImagePaths(redistributeMissingSceneTimes(withPaths));
}

async function main() {
  ensureDataDirs();

  const channelId = readArg('channel');
  const videoId = readArg('video');

  if (!channelId || !videoId) {
    throw new Error('Usage: npm run reassemble-video -- --channel <channelId> --video <videoId>');
  }

  const channel = youtubeChannelsRepository.findAll().find(c => c.id === channelId);
  if (!channel) {
    throw new Error(`Không tìm thấy channel ${channelId}`);
  }

  const videoType = channel.type === 'reup_audio' ? channel.reupAudioVideoType : 'si';
  if (!videoType) {
    throw new Error(`Channel ${channel.name} là reup_audio nhưng thiếu reupAudioVideoType`);
  }

  const workDir = resolveYoutubeChannelVideoDir(channelId, videoId);
  if (!workDir) {
    throw new Error(`Không tìm thấy thư mục video: ${videoId}`);
  }

  const audioPath = path.join(workDir, AUDIO_FILE);
  await assertMediaFileComplete(audioPath, { label: AUDIO_FILE });

  const subtitlePath = await findFirstExisting(...SUBTITLE_FILES.map(f => path.join(workDir, f)));
  if (!subtitlePath) {
    throw new Error(`Thiếu file phụ đề: ${SUBTITLE_FILES.join(' hoặc ')}`);
  }

  const destination = await createYoutubeProductionDestination(channel);
  const strategy = resolveVideoTypeStrategy(videoType);
  const backgroundImage = destination.reupAudioBackgroundImage ?? 'one_image';

  const assets: VisualAssets = {};
  if (videoType === 'ai') {
    assets.aiScenePrompts = await loadAiScenes(workDir);
  } else if (backgroundImage === 'one_image') {
    const heroImagePath = path.join(workDir, CENTER_IMAGE_FILE);
    await fs.access(heroImagePath);
    assets.heroImagePath = heroImagePath;
  }

  const log = createConsoleTaskLogger();
  const channelAvatarPath = await resolveChannelAvatarForVideoAssembly(channelId, {
    enabled: channel.showChannelAvatar,
    onLog: msg => log.info(msg),
  });
  const disclaimerText = channel.disclaimerText?.trim();

  const assembleCtx: AssembleContext = {
    destination,
    videoType,
    workDir,
    audioPath,
    subtitlePath,
    outputBasename: await resolveOutputBasename(workDir),
    ...(channelAvatarPath ? { channelAvatarPath } : {}),
    showDisclaim: channel.showDisclaimer === true && Boolean(disclaimerText),
    ...(disclaimerText ? { disclaimerText } : {}),
    log,
    stepTimer: { prefix: `[reassemble] ${videoId}`, onLog: msg => log.info(msg) },
  };

  const readiness = await strategy.canAssemble(assembleCtx, assets);
  if (!readiness.ready) {
    throw new Error(readiness.reason);
  }

  console.log(`Ghép lại ${videoId} (${videoType}) trong ${workDir}...`);
  const startedAt = performance.now();
  const outputPath = await strategy.assemble(assembleCtx, assets);
  console.log(`Xong: ${outputPath} (${formatElapsedMs(performance.now() - startedAt)})`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
