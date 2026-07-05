import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, resolveYoutubeChannelVideoDir } from '../config/paths.js';
import { assembleReupAiSlideshowVideo } from '../modules/video-production/shared/ai-video/index.js';
import { AI_SLIDES_DIRNAME } from '../modules/video-production/shared/ai-video/ai-video.constants.js';
import { assembleReupSiVideo } from '../modules/video-production/shared/si-video/si-video-assembler.js';
import { videoPrepareRepository } from '../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
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

    if (videoType === 'si' && !channel.backgroundFootageSources?.length) {
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
        const centerImagePath = path.join(workDir, CENTER_IMAGE_FILE);
        try {
          await fs.access(centerImagePath);
        } catch {
          missingFiles.push(CENTER_IMAGE_FILE);
        }
      }

      if (videoType === 'ai') {
        const slideImages = await listAiSlideImages(path.join(workDir, AI_SLIDES_DIRNAME));
        if (slideImages.length === 0) {
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

        if (videoType === 'ai') {
          const imagePaths = await listAiSlideImages(path.join(workDir, AI_SLIDES_DIRNAME));
          outputPath = await assembleReupAiSlideshowVideo({
            workDir,
            imagePaths,
            audioPath,
            subtitlePath: subtitlePath!,
            language: channel.language,
            onLog: msg => console.log(`      ${msg}`),
          });
        } else {
          outputPath = await assembleReupSiVideo({
            workDir,
            audioPath,
            subtitlePath: subtitlePath!,
            centerImagePath: path.join(workDir, CENTER_IMAGE_FILE),
            backgroundFootageSourceIds: channel.backgroundFootageSources!,
            language: channel.language,
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
