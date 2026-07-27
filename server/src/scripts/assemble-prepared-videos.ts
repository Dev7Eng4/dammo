import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, resolveYoutubeChannelVideoDir } from '../config/paths.js';
import {
  assembleReupAiSlideshowVideo,
  attachSceneImagePaths,
  redistributeMissingSceneTimes,
  resolveAiScenePromptsFilePath,
  scenesWithImagePaths,
} from '../modules/video-production/shared/ai-video/index.js';
import { AI_SLIDES_DIRNAME } from '../modules/video-production/shared/ai-video/ai-video.constants.js';
import type { AiVideoScenePrompt, AiVideoScenePromptsFile } from '../modules/video-production/shared/ai-video/ai-video.types.js';
import { assembleReupSiVideo } from '../modules/video-production/shared/si-video/si-video-assembler.js';
import { listSiMultiImagePaths } from '../modules/video-production/shared/si-video/si-multi-image.js';
import { SI_MULTI_IMAGE_DIRNAME } from '../modules/video-production/shared/si-video/si.constants.js';
import { videoPrepareRepository } from '../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import { resolveChannelAvatarForVideoAssembly } from '../modules/youtube-channels/resolve-channel-avatar.js';
import type { StoredYoutubeChannelType, YoutubeChannel } from '../modules/youtube-channels/youtube-channels.types.js';
import { formatElapsedMs } from '../shared/timing/step-timer.js';
import { pickReupChannels } from './lib/reup-channel-picker.js';

const ASSEMBLE_VIDEOS_PER_RUN = 1;

const AUDIO_FILE = 'audio.mp3';
/** Thử transcript đã qua LLM trước, fallback về cleaned SRT */
const SUBTITLE_FILES = ['transcript.srt', 'transcript-updated.srt'];
const CENTER_IMAGE_FILE = 'background.jpg';
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

function isReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

function resolveChannelsFromPick(
  pick: { mode: 'all' } | { mode: 'selected'; channelIds: string[] },
): YoutubeChannel[] {
  const reupChannels = youtubeChannelsRepository.findAll().filter(channel => isReupChannelType(channel.type));

  if (pick.mode === 'all') {
    return reupChannels;
  }

  const selectedIds = new Set(pick.channelIds);
  return reupChannels.filter(channel => selectedIds.has(channel.id));
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

async function listAiSlideImages(slidesDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(slidesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map(entry => path.join(slidesDir, entry.name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  } catch {
    return [];
  }
}

function msToSrt(totalMs: number): string {
  const ms = Math.max(0, Math.round(totalMs));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

async function loadAiScenesForAssemble(workDir: string): Promise<AiVideoScenePrompt[]> {
  const promptsPath = resolveAiScenePromptsFilePath(workDir);
  try {
    const raw = await fs.readFile(promptsPath, 'utf8');
    const parsed = JSON.parse(raw) as AiVideoScenePromptsFile;
    if (Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
      const withPaths = await attachSceneImagePaths(parsed.scenes, workDir);
      return redistributeMissingSceneTimes(withPaths);
    }
  } catch {
    // fall through to folder-only fallback
  }

  const imagePaths = await listAiSlideImages(path.join(workDir, AI_SLIDES_DIRNAME));
  const slideSec = 5;
  return imagePaths.map((imagePath, index) => {
    const startMs = index * slideSec * 1_000;
    const endMs = (index + 1) * slideSec * 1_000;
    return {
      prompt: '',
      startTime: msToSrt(startMs),
      endTime: msToSrt(endMs),
      path: path.relative(workDir, imagePath).split(path.sep).join('/'),
    };
  });
}

interface AssembleResult {
  channelName: string;
  videoId: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
  outputPath?: string;
}

async function main() {
  ensureDataDirs();

  const pick = await pickReupChannels({ message: 'Chọn kênh để ghép video Prepared' });
  if (pick.mode === 'cancelled') {
    console.log('Đã hủy.');
    return;
  }

  const channels = resolveChannelsFromPick(pick);
  if (channels.length === 0) {
    console.log('Không có reup channel nào được chọn.');
    return;
  }

  console.log(
    `Ghép tối đa ${ASSEMBLE_VIDEOS_PER_RUN} video trên ${channels.length} channel(s) đã chọn...\n`,
  );

  const results: AssembleResult[] = [];
  let processedCount = 0;

  for (const channel of channels) {
    if (processedCount >= ASSEMBLE_VIDEOS_PER_RUN) break;

    const preparedItems = videoPrepareRepository.listByStatus(channel.id, 'Prepared');

    if (preparedItems.length === 0) {
      console.log(`  [skip] ${channel.name}: không có video Prepared`);
      continue;
    }

    if (channel.type === 'reup_audio' && !channel.reupAudioVideoType) {
      console.log(`  [skip] ${channel.name}: channel reup_audio thiếu reupAudioVideoType`);
      continue;
    }

    const videoType = channel.type === 'reup_audio' ? channel.reupAudioVideoType : 'si';

    if (videoType === 'si' && channel.backgroundFootageMode !== 'local' && !channel.backgroundFootageSources?.length) {
      console.log(`  [skip] ${channel.name}: không có backgroundFootageSources`);
      continue;
    }

    for (const item of preparedItems) {
      if (processedCount >= ASSEMBLE_VIDEOS_PER_RUN) break;

      processedCount++;
      console.log(`  [xử lý] ${channel.name} / ${item.videoId} (${videoType})...`);

      const workDir = resolveYoutubeChannelVideoDir(channel.id, item.videoId);
      if (!workDir) {
        const reason = `Không tìm thấy thư mục video: ${item.videoId}`;
        console.log(`    [fail] ${item.videoId}: ${reason}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'failed', reason });
        continue;
      }

      const audioPath = path.join(workDir, AUDIO_FILE);
      const subtitlePath = await findFirstExisting(...SUBTITLE_FILES.map(f => path.join(workDir, f)));

      const missingFiles: string[] = [];
      try {
        await fs.access(audioPath);
      } catch {
        missingFiles.push(AUDIO_FILE);
      }
      if (!subtitlePath) missingFiles.push(SUBTITLE_FILES.join(' or '));

      if (videoType === 'si') {
        const siBackgroundImage = channel.reupAudioBackgroundImage ?? 'one_image';
        if (siBackgroundImage === 'one_image') {
          const centerImagePath = path.join(workDir, CENTER_IMAGE_FILE);
          try {
            await fs.access(centerImagePath);
          } catch {
            missingFiles.push(CENTER_IMAGE_FILE);
          }
        } else if (siBackgroundImage === 'multi_image') {
          const multiImagePaths = await listSiMultiImagePaths(workDir);
          if (multiImagePaths.length === 0) {
            missingFiles.push(`${SI_MULTI_IMAGE_DIRNAME}/*`);
          }
        }
      }

      let aiScenes: AiVideoScenePrompt[] = [];
      if (videoType === 'ai') {
        aiScenes = scenesWithImagePaths(await loadAiScenesForAssemble(workDir));
        if (aiScenes.length === 0) {
          missingFiles.push(`${AI_SLIDES_DIRNAME}/*.jpg`);
        }
      }

      if (missingFiles.length > 0) {
        const reason = `Thiếu file: ${missingFiles.join(', ')}`;
        console.log(`    [fail] ${item.videoId}: ${reason}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'failed', reason });
        continue;
      }

      try {
        console.log(`    [ghép] ${item.videoId} (${videoType})...`);
        const startedAt = performance.now();
        let outputPath: string;
        const disclaimerText = channel.disclaimerText?.trim();
        const showDisclaim = channel.showDisclaimer === true && Boolean(disclaimerText);
        const channelAvatarPath = await resolveChannelAvatarForVideoAssembly(channel.id, {
          enabled: channel.showChannelAvatar,
          onLog: msg => console.log(`      ${msg}`),
        });

        if (videoType === 'ai') {
          outputPath = await assembleReupAiSlideshowVideo({
            workDir,
            scenes: aiScenes,
            audioPath,
            subtitlePath: subtitlePath!,
            language: channel.language,
            captionStyleKey: channel.captionStyleKey,
            showDisclaim,
            disclaimerText,
            ...(channelAvatarPath ? { channelAvatarPath } : {}),
            onLog: msg => console.log(`      ${msg}`),
          });
        } else {
          const siBackgroundImage = channel.reupAudioBackgroundImage ?? 'one_image';
          const multiImagePaths =
            siBackgroundImage === 'multi_image' ? await listSiMultiImagePaths(workDir) : [];

          outputPath = await assembleReupSiVideo({
            workDir,
            audioPath,
            subtitlePath: subtitlePath!,
            ...(siBackgroundImage === 'one_image'
              ? { centerImagePath: path.join(workDir, CENTER_IMAGE_FILE) }
              : {}),
            ...(siBackgroundImage === 'multi_image' ? { centerImagePaths: multiImagePaths } : {}),
            backgroundFootageMode: channel.backgroundFootageMode ?? 'source',
            backgroundFootageSourceIds: channel.backgroundFootageSources,
            language: channel.language,
            captionStyleKey: channel.captionStyleKey,
            showAudioBar: channel.showAudioBar === true,
            showSmallVideo: channel.showSmallVideo === true,
            showDisclaim,
            disclaimerText,
            ...(channelAvatarPath ? { channelAvatarPath } : {}),
            onLog: msg => console.log(`      ${msg}`),
          });
        }

        videoPrepareRepository.markCreated(channel.id, item.videoId);
        console.log(`    [ok]   ${item.videoId} → ${outputPath} (tổng ${formatElapsedMs(performance.now() - startedAt)})`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'created', outputPath });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Lỗi không xác định';
        console.log(`    [fail] ${item.videoId}: ${reason}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'failed', reason });
      }
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log('');
  if (processedCount === 0) {
    console.log('Không tìm thấy video Prepared nào để ghép trên các channel đã chọn.');
  }
  console.log(`Hoàn tất: ${created} created, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
