import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { paths, youtubeChannelVideoDir } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { findReadyScript } from '../script-remake/remake-ready.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import { channelVideoRemakeService, PREPARING_MARKER } from './channel-video-remake.service.js';

/** Where `npm run script -- source <link>` (jp-psy-script-remake) keeps what it downloaded for a source video. */
const SKILL_SOURCES_DIR = path.join(paths.dataDir, 'script-skill', 'sources');

/** The cleaned srt the skill read, Japanese first. */
function skillSourceTranscript(sourceVideoId: string): string | null {
  const dir = path.join(SKILL_SOURCES_DIR, sourceVideoId);
  if (!fs.existsSync(dir)) return null;
  const srts = fs.readdirSync(dir).filter(name => /^transcript\..+\.srt$/.test(name));
  const pick = srts.find(name => name === 'transcript.ja.srt') ?? srts[0];
  return pick ? path.join(dir, pick) : null;
}

/**
 * Starts a remake channel's video from the script the skill wrote ahead (remake-ready/), without
 * "Chuẩn bị video": the video folder gets script.txt and remake/ (as the pipeline would write them) and
 * source/ with the source transcript the skill already downloaded, and video-prepare.json lists it as
 * Preparing. Voice, scenes, title and thumbnail are then made in the production tabs; the video becomes
 * Prepared once they all exist. Nothing is downloaded.
 */
export async function startPreparingFromReadyScript(channelId: string, sourceVideoId: string): Promise<{ created: boolean }> {
  const channel = youtubeChannelsRepository.findById(channelId);
  if (!channel) throw new AppError('Channel not found', 404, 'NOT_FOUND');
  if (channel.type !== 'remake_video') {
    throw new AppError('Chỉ kênh Remake video có kịch bản skill viết sẵn', 400, 'NOT_REMAKE_CHANNEL');
  }
  if (videoPrepareRepository.getPreparedVideoIds(channelId).has(sourceVideoId)) return { created: false };

  const ready = findReadyScript(channelId, sourceVideoId);
  if (ready.status !== 'ready') {
    throw new AppError(
      ready.status === 'missing' ? 'Video này chưa có kịch bản skill viết sẵn' : `Kịch bản skill chưa dùng được: ${ready.reason}`,
      409,
      'READY_SCRIPT_NOT_USABLE',
    );
  }

  const workDir = youtubeChannelVideoDir(channelId, sourceVideoId);
  if (fs.existsSync(workDir) && fs.readdirSync(workDir).length > 0) {
    throw new AppError(`Thư mục video đã có dữ liệu: ${workDir}`, 409, 'VIDEO_FOLDER_EXISTS');
  }
  const sourceDir = path.join(workDir, 'source');
  await fsp.mkdir(sourceDir, { recursive: true });

  try {
    const transcript = skillSourceTranscript(sourceVideoId);
    if (transcript) await fsp.copyFile(transcript, path.join(sourceDir, 'transcript.srt'));
    const info = path.join(SKILL_SOURCES_DIR, sourceVideoId, 'info.json');
    if (fs.existsSync(info)) await fsp.copyFile(info, path.join(sourceDir, 'info.json'));
    await fsp.writeFile(
      path.join(workDir, PREPARING_MARKER),
      JSON.stringify({ startedAt: new Date().toISOString(), sourceTranscript: transcript ? path.basename(transcript) : null }, null, 2),
      'utf8',
    );

    const used = await channelVideoRemakeService.useReadyScript(workDir, () => undefined, { channelId, sourceVideoId });
    if (!used) throw new AppError('Kịch bản skill viết sẵn trống', 409, 'READY_SCRIPT_NOT_USABLE');

    videoPrepareRepository.appendItems(channelId, [
      { id: randomUUID(), videoId: sourceVideoId, title: used.outline.title, status: 'Preparing' },
    ]);
  } catch (err) {
    await fsp.rm(workDir, { recursive: true, force: true });
    throw err;
  }
  // The script now lives in this video's folder (same as after "Chuẩn bị video").
  await fsp.rm(ready.dir, { recursive: true, force: true }).catch(() => undefined);
  return { created: true };
}
