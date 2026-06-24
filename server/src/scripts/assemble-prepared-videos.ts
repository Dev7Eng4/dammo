import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, resolveYoutubeChannelVideoDir } from '../config/paths.js';
import { assembleReupSiVideo } from '../modules/video-production/shared/si-video/si-video-assembler.js';
import { videoPrepareRepository } from '../modules/youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import type { StoredYoutubeChannelType } from '../modules/youtube-channels/youtube-channels.types.js';

const AUDIO_FILE = 'audio.mp3';
/** Thử transcript đã qua LLM trước, fallback về cleaned SRT */
const SUBTITLE_FILES = ['transcript.srt', 'transcript-updated.srt'];
const CENTER_IMAGE_FILE = 'background.jpg';

function isReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
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

interface AssembleResult {
  channelName: string;
  videoId: string;
  status: 'created' | 'skipped' | 'failed';
  reason?: string;
  outputPath?: string;
}

async function main() {
  ensureDataDirs();

  const reupChannels = youtubeChannelsRepository
    .findAll()
    .filter(channel => isReupChannelType(channel.type));

  if (reupChannels.length === 0) {
    console.log('Không có reup channel nào trong hệ thống.');
    return;
  }

  console.log(`Kiểm tra ${reupChannels.length} reup channel(s) để tìm video đang ở status Prepared...\n`);

  const results: AssembleResult[] = [];

  for (const channel of reupChannels) {
    const preparedItems = videoPrepareRepository.listByStatus(channel.id, 'Prepared');

    if (preparedItems.length === 0) {
      console.log(`  [skip] ${channel.name}: không có video Prepared`);
      continue;
    }

    if (!channel.backgroundFootageSources?.length) {
      for (const item of preparedItems) {
        console.log(`  [skip] ${channel.name} / ${item.videoId}: không có backgroundFootageSources`);
        results.push({
          channelName: channel.name,
          videoId: item.videoId,
          status: 'skipped',
          reason: 'Channel không có backgroundFootageSources',
        });
      }
      continue;
    }

    console.log(`  ${channel.name}: ${preparedItems.length} video(s) Prepared → bắt đầu ghép...`);

    for (const item of preparedItems) {
      const workDir = resolveYoutubeChannelVideoDir(channel.id, item.videoId);
      if (!workDir) {
        const reason = `Không tìm thấy thư mục video: ${item.videoId}`;
        console.log(`    [fail] ${item.videoId}: ${reason}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'failed', reason });
        continue;
      }

      const audioPath = path.join(workDir, AUDIO_FILE);
      const subtitlePath = await findFirstExisting(
        ...SUBTITLE_FILES.map(f => path.join(workDir, f)),
      );
      const centerImagePath = path.join(workDir, CENTER_IMAGE_FILE);

      // Kiểm tra các file cần thiết
      const missingFiles: string[] = [];
      try { await fs.access(audioPath); } catch { missingFiles.push(AUDIO_FILE); }
      if (!subtitlePath) missingFiles.push(SUBTITLE_FILES.join(' or '));
      try { await fs.access(centerImagePath); } catch { missingFiles.push(CENTER_IMAGE_FILE); }

      if (missingFiles.length > 0) {
        const reason = `Thiếu file: ${missingFiles.join(', ')}`;
        console.log(`    [fail] ${item.videoId}: ${reason}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'failed', reason });
        continue;
      }

      try {
        console.log(`    [ghép] ${item.videoId}...`);
        const outputPath = await assembleReupSiVideo({
          workDir,
          audioPath,
          subtitlePath: subtitlePath!,
          centerImagePath,
          backgroundFootageSourceIds: channel.backgroundFootageSources,
          language: channel.language,
          onLog: msg => console.log(`      ${msg}`),
        });

        videoPrepareRepository.markCreated(channel.id, item.videoId);
        console.log(`    [ok]   ${item.videoId} → ${outputPath}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'created', outputPath });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Lỗi không xác định';
        console.log(`    [fail] ${item.videoId}: ${reason}`);
        results.push({ channelName: channel.name, videoId: item.videoId, status: 'failed', reason });
      }
    }
  }

  // Tổng kết
  const created = results.filter(r => r.status === 'created').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log('');
  console.log(`Hoàn tất: ${created} created, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
