import fs from 'node:fs';
import path from 'node:path';
import { paths, resolveYoutubeChannelVideoDir } from '../config/paths.js';

interface ChannelInfo {
  id: string;
  name: string;
  handle?: string;
}

interface VideoMeta {
  metadata?: {
    title?: string;
  };
  final_summary?: any;
  hero_image_prompt?: {
    prompt?: string;
  };
}

interface VideoPrepareItem {
  id?: string;
  videoId?: string;
  title?: string;
  status?: string;
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function hasFileWithExtension(dirPath: string, ext: string): boolean {
  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return false;
    const files = fs.readdirSync(dirPath);
    return files.some(file => file.toLowerCase().endsWith(ext.toLowerCase()));
  } catch {
    return false;
  }
}

function checkVideoMeta(videoDir: string, checkPrepared: boolean): boolean {
  const metaPath = path.join(videoDir, 'video-meta.json');
  if (!fileExists(metaPath)) return false;
  try {
    const content = fs.readFileSync(metaPath, 'utf-8');
    const data: VideoMeta = JSON.parse(content);

    // Title in metadata in video-meta.json
    if (!data.metadata?.title || typeof data.metadata.title !== 'string' || !data.metadata.title.trim()) {
      return false;
    }

    if (checkPrepared) {
      // Check final_summary
      if (!data.final_summary) {
        return false;
      }
      // Check hero_image_prompt.prompt
      if (!data.hero_image_prompt?.prompt || typeof data.hero_image_prompt.prompt !== 'string' || !data.hero_image_prompt.prompt.trim()) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function main() {
  // 1. Tải danh sách channel từ cấu hình (không dùng trong log này nhưng giữ lại cấu trúc)
  let channelsList: any[] = [];
  try {
    if (fileExists(paths.youtubeChannels)) {
      const channelsContent = fs.readFileSync(paths.youtubeChannels, 'utf-8');
      const parsed = JSON.parse(channelsContent);
      channelsList = parsed.channels || [];
    }
  } catch (err) {
    // Bỏ qua lỗi đọc file cấu hình
  }

  // 2. Quét thư mục youtube-channels
  if (!fs.existsSync(paths.youtubeChannelsDir)) {
    console.error(`❌ Thư mục channels không tồn tại: ${paths.youtubeChannelsDir}`);
    process.exit(1);
  }

  const channelDirs = fs.readdirSync(paths.youtubeChannelsDir).filter(name => {
    try {
      return fs.statSync(path.join(paths.youtubeChannelsDir, name)).isDirectory();
    } catch {
      return false;
    }
  });

  if (channelDirs.length === 0) {
    console.log('📭 Không tìm thấy thư mục channel nào.');
    return;
  }

  let grandTotalCreated = 0;
  let grandTotalPrepared = 0;

  for (const dirName of channelDirs) {
    const channelId = dirName;
    const videoPreparePath = path.join(paths.youtubeChannelsDir, channelId, 'video-prepare.json');

    if (!fileExists(videoPreparePath)) {
      console.log(`[${channelId}]: 0 Created, 0 Prepared`);
      continue;
    }

    let prepareList: VideoPrepareItem[] = [];
    try {
      const content = fs.readFileSync(videoPreparePath, 'utf-8');
      prepareList = JSON.parse(content);
      if (!Array.isArray(prepareList)) {
        prepareList = [];
      }
    } catch (err) {
      // Bỏ qua lỗi parse
    }

    let createdCount = 0;
    let preparedCount = 0;

    for (const item of prepareList) {
      const videoId = item.videoId;
      const status = item.status;
      if (!videoId) continue;

      const videoDir = resolveYoutubeChannelVideoDir(channelId, videoId);
      if (!videoDir) continue;

      if (status === 'Created') {
        const hasMp4 = hasFileWithExtension(videoDir, '.mp4');
        const hasThumbnail = fileExists(path.join(videoDir, 'thumbnail.jpg'));
        const hasMetaTitle = checkVideoMeta(videoDir, false);

        if (hasMp4 && hasThumbnail && hasMetaTitle) {
          createdCount++;
        }
      } else if (status === 'Prepared') {
        const hasMp3 = hasFileWithExtension(videoDir, '.mp3');
        const hasBackground = fileExists(path.join(videoDir, 'background.jpg'));
        const hasOldThumbnail = fileExists(path.join(videoDir, 'old-thumbnail.jpg'));
        const hasTranscript = fileExists(path.join(videoDir, 'transcript.srt'));
        const hasMetaFull = checkVideoMeta(videoDir, true);

        if (hasMp3 && hasBackground && hasOldThumbnail && hasTranscript && hasMetaFull) {
          preparedCount++;
        }
      }
    }

    grandTotalCreated += createdCount;
    grandTotalPrepared += preparedCount;

    console.log(`[${channelId}]: ${createdCount} Created, ${preparedCount} Prepared`);
  }

  console.log(`Total: ${grandTotalCreated} Created, ${grandTotalPrepared} Prepared`);
}

main().catch(err => {
  console.error('❌ Đã xảy ra lỗi khi chạy script:', err);
  process.exit(1);
});
