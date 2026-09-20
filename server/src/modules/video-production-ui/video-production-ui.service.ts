import fs from 'node:fs';
import path from 'node:path';
import { resolveYoutubeChannelVideoDir } from '../../config/paths.js';
import { parseSrt } from '../../infrastructure/subtitle/srt-utils.js';
import { readJson } from '../../infrastructure/storage/json-store.js';
import { AppError } from '../../shared/http/errors.js';
import { parseVideoMetaContent } from '../video-production/shared/meta/metadata.types.js';
import {
  IMAGE_REFERENCES_DIRNAME,
  findOverlappingScenes,
  generateAiSceneSlideImages,
  resolveAiScenePromptsFilePath,
  resolveCharacterReferencesFilePath,
  sanitizeCharacterId,
  sceneDurationSec,
} from '../video-production/shared/ai-video/index.js';
import type {
  AiVideoCharacterReferencesFile,
  AiVideoScenePromptsFile,
} from '../video-production/shared/ai-video/ai-video.types.js';
import { findThumbnailPath } from '../youtube-upload/upload-assets.js';
import { videoPrepareRepository } from '../youtube-channels/video-prepare.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';
import type {
  ProductionCharacterItem,
  ProductionCharactersResponse,
  ProductionMetadataResponse,
  ProductionSceneImageAsset,
  ProductionSceneItem,
  ProductionScenesResponse,
  ProductionTranscriptCue,
  ProductionTranscriptResponse,
  ProductionTranscriptSource,
  ProductionVideoListItem,
  ProductionVideoStatus,
} from './video-production-ui.types.js';

const TRANSCRIPT_CANDIDATES = ['transcript-updated.srt', 'transcript.srt'] as const;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;
const VIDEO_META_FILENAME = 'video-meta.json';

function assertSafeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes('..') || normalized.includes('/') || normalized.includes('\\')) {
    throw new AppError(`Invalid ${label}`, 400, 'INVALID_ID');
  }
  return normalized;
}

function imageContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'image/jpeg';
  }
}

function isProductionStatus(status: string): status is ProductionVideoStatus {
  return status === 'Prepared' || status === 'Created';
}

function resolveProductionVideoFolder(channelId: string, videoId: string): string {
  const safeChannelId = assertSafeId(channelId, 'channel id');
  const safeVideoId = assertSafeId(videoId, 'video id');

  if (!youtubeChannelsRepository.findById(safeChannelId)) {
    throw new AppError('Channel not found', 404, 'NOT_FOUND');
  }

  const prepareItem = videoPrepareRepository
    .read(safeChannelId)
    .find(
      (item) =>
        item.videoId.trim() === safeVideoId && isProductionStatus(item.status),
    );

  if (!prepareItem) {
    throw new AppError(
      'Video is not in Prepared or Created status',
      409,
      'VIDEO_NOT_IN_PRODUCTION',
    );
  }

  const folderPath = resolveYoutubeChannelVideoDir(safeChannelId, safeVideoId);
  if (!folderPath) {
    throw new AppError('Video folder not found', 404, 'VIDEO_FOLDER_NOT_FOUND');
  }

  return folderPath;
}

function readScenePromptsFile(workDir: string): AiVideoScenePromptsFile | null {
  const filePath = resolveAiScenePromptsFilePath(workDir);
  if (!fs.existsSync(filePath)) return null;

  const raw = readJson<AiVideoScenePromptsFile>(filePath);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenes)) {
    return null;
  }

  const overlaps = findOverlappingScenes(raw.scenes);
  if (overlaps.length > 0) {
    console.warn(
      `[video-production-ui] ${filePath}: ${overlaps.length} scene overlap — possible duplicate prompts (scene #${overlaps[0].index + 1} starts ${overlaps[0].startTime} < ${overlaps[0].previousEndTime})`,
    );
  }

  return raw;
}

function readCharacterReferencesFile(workDir: string): AiVideoCharacterReferencesFile | null {
  const filePath = resolveCharacterReferencesFilePath(workDir);
  if (!fs.existsSync(filePath)) return null;

  const raw = readJson<AiVideoCharacterReferencesFile>(filePath);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.characters)) {
    return null;
  }
  return raw;
}

function countScenes(workDir: string | null): number {
  if (!workDir) return 0;
  const file = readScenePromptsFile(workDir);
  if (!file) return 0;
  if (typeof file.sceneCount === 'number' && Number.isFinite(file.sceneCount)) {
    return Math.max(0, Math.floor(file.sceneCount));
  }
  return file.scenes.length;
}

function resolveWorkDirFilePath(workDir: string, relativePath: string): string | null {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed.includes('\0')) return null;

  const absoluteWorkDir = path.resolve(workDir);
  const absolutePath = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(absoluteWorkDir, trimmed);

  const relative = path.relative(absoluteWorkDir, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return null;
  }

  return absolutePath;
}

function findCharacterImagePath(
  workDir: string,
  characterId: string,
  relativePath?: string,
): string | null {
  if (relativePath) {
    const fromPath = resolveWorkDirFilePath(workDir, relativePath);
    if (fromPath) return fromPath;
  }

  const base = sanitizeCharacterId(characterId);
  const imageDir = path.join(workDir, IMAGE_REFERENCES_DIRNAME);
  for (const ext of IMAGE_EXTENSIONS) {
    const candidate = path.join(imageDir, `${base}${ext}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function statusRank(status: ProductionVideoStatus): number {
  return status === 'Prepared' ? 0 : 1;
}

function normalizeMetaText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeMetaTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return [...new Set(values.map((tag) => normalizeMetaText(tag).trim()).filter(Boolean))];
}

function readVideoMetadataFields(workDir: string): {
  title: string;
  description: string;
  tags: string[];
} {
  const filePath = path.join(workDir, VIDEO_META_FILENAME);
  if (!fs.existsSync(filePath)) {
    return { title: '', description: '', tags: [] };
  }

  try {
    const raw = readJson<unknown>(filePath);
    const parsed = parseVideoMetaContent(raw);
    return {
      title: normalizeMetaText(parsed.metadata?.title),
      description: normalizeMetaText(parsed.metadata?.description),
      tags: normalizeMetaTags(parsed.metadata?.tags),
    };
  } catch {
    return { title: '', description: '', tags: [] };
  }
}

export class VideoProductionUiService {
  listVideos(videosBasePath: string): ProductionVideoListItem[] {
    const channels = youtubeChannelsRepository.findAll();
    const items: ProductionVideoListItem[] = [];

    for (const channel of channels) {
      const prepareItems = videoPrepareRepository.read(channel.id);
      for (const item of prepareItems) {
        if (!isProductionStatus(item.status)) continue;

        const videoId = item.videoId.trim();
        if (!videoId) continue;

        const workDir = resolveYoutubeChannelVideoDir(channel.id, videoId);
        const sceneCount = countScenes(workDir);
        const hasThumbnail = Boolean(workDir && findThumbnailPath(workDir));

        items.push({
          channelId: channel.id,
          channelName: channel.name,
          videoId,
          title: item.title?.trim() || videoId,
          status: item.status,
          sceneCount,
          hasScenes: sceneCount > 0,
          thumbnailUrl: hasThumbnail
            ? `${videosBasePath}/${encodeURIComponent(channel.id)}/${encodeURIComponent(videoId)}/thumbnail`
            : null,
        });
      }
    }

    items.sort((a, b) => {
      const byStatus = statusRank(a.status) - statusRank(b.status);
      if (byStatus !== 0) return byStatus;
      const byChannel = a.channelName.localeCompare(b.channelName, undefined, {
        sensitivity: 'base',
      });
      if (byChannel !== 0) return byChannel;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    return items;
  }

  getScenes(channelId: string, videoId: string, basePath: string): ProductionScenesResponse {
    const safeChannelId = assertSafeId(channelId, 'channel id');
    const safeVideoId = assertSafeId(videoId, 'video id');
    const workDir = resolveProductionVideoFolder(safeChannelId, safeVideoId);

    const prepareItem = videoPrepareRepository
      .read(safeChannelId)
      .find((item) => item.videoId.trim() === safeVideoId && isProductionStatus(item.status));

    if (!prepareItem || !isProductionStatus(prepareItem.status)) {
      throw new AppError(
        'Video is not in Prepared or Created status',
        409,
        'VIDEO_NOT_IN_PRODUCTION',
      );
    }

    const file = readScenePromptsFile(workDir);
    const scenesSource = file?.scenes ?? [];
    const scenes: ProductionSceneItem[] = scenesSource.map((scene, index) => {
      const imagePath =
        typeof scene.path === 'string' ? resolveWorkDirFilePath(workDir, scene.path) : null;

      return {
        index,
        prompt: typeof scene.prompt === 'string' ? scene.prompt : '',
        startTime: scene.startTime,
        endTime: scene.endTime,
        durationSec: sceneDurationSec(scene),
        imageUrl: imagePath ? `${basePath}/${index}/image` : null,
        ...(Array.isArray(scene.references) && scene.references.length > 0
          ? { references: scene.references.filter((ref) => typeof ref === 'string') }
          : {}),
      };
    });

    return {
      channelId: safeChannelId,
      videoId: safeVideoId,
      title: prepareItem.title?.trim() || safeVideoId,
      status: prepareItem.status,
      generatedAt: file?.generatedAt ?? null,
      sceneCount: scenes.length,
      scenes,
    };
  }

  getSceneImage(
    channelId: string,
    videoId: string,
    sceneIndex: number,
  ): ProductionSceneImageAsset {
    if (!Number.isInteger(sceneIndex) || sceneIndex < 0) {
      throw new AppError('Invalid scene index', 400, 'INVALID_SCENE_INDEX');
    }

    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const file = readScenePromptsFile(workDir);
    if (!file) {
      throw new AppError('Scene prompts not found', 404, 'SCENES_NOT_FOUND');
    }

    const scene = file.scenes[sceneIndex];
    if (!scene) {
      throw new AppError('Scene not found', 404, 'SCENE_NOT_FOUND');
    }

    if (typeof scene.path !== 'string' || !scene.path.trim()) {
      throw new AppError('Scene image not found', 404, 'SCENE_IMAGE_NOT_FOUND');
    }

    const filePath = resolveWorkDirFilePath(workDir, scene.path);
    if (!filePath) {
      throw new AppError('Scene image not found', 404, 'SCENE_IMAGE_NOT_FOUND');
    }

    return {
      filePath,
      contentType: imageContentType(filePath),
      size: fs.statSync(filePath).size,
    };
  }

  async regenerateSceneImage(
    channelId: string,
    videoId: string,
    sceneIndex: number,
    basePath: string,
  ): Promise<ProductionScenesResponse> {
    if (!Number.isInteger(sceneIndex) || sceneIndex < 0) {
      throw new AppError('Invalid scene index', 400, 'INVALID_SCENE_INDEX');
    }

    const safeChannelId = assertSafeId(channelId, 'channel id');
    const safeVideoId = assertSafeId(videoId, 'video id');
    const workDir = resolveProductionVideoFolder(safeChannelId, safeVideoId);
    const file = readScenePromptsFile(workDir);
    if (!file || file.scenes.length === 0) {
      throw new AppError('Scene prompts not found', 404, 'SCENES_NOT_FOUND');
    }

    const scene = file.scenes[sceneIndex];
    if (!scene) {
      throw new AppError('Scene not found', 404, 'SCENE_NOT_FOUND');
    }

    const prompt = typeof scene.prompt === 'string' ? scene.prompt.trim() : '';
    if (!prompt) {
      throw new AppError('Scene has an empty prompt', 400, 'AI_SCENE_IMAGE_EMPTY_PROMPT');
    }

    const result = await generateAiSceneSlideImages({
      workDir,
      youtubeVideoId: safeVideoId,
      scenes: file.scenes,
      forceIndexes: [sceneIndex],
    });

    const regenerated = result.scenes[sceneIndex];
    const hasImage =
      regenerated &&
      typeof regenerated.path === 'string' &&
      regenerated.path.trim().length > 0 &&
      Boolean(resolveWorkDirFilePath(workDir, regenerated.path));

    if (result.generatedCount === 0 || !hasImage) {
      throw new AppError(
        'Scene image regeneration failed',
        502,
        'AI_SCENE_IMAGE_REGENERATE_FAILED',
      );
    }

    const scenesBasePath = basePath.replace(/\/scenes\/\d+\/regenerate$/, '/scenes');
    return this.getScenes(safeChannelId, safeVideoId, scenesBasePath);
  }

  getTranscript(channelId: string, videoId: string): ProductionTranscriptResponse {
    const safeChannelId = assertSafeId(channelId, 'channel id');
    const safeVideoId = assertSafeId(videoId, 'video id');
    const workDir = resolveProductionVideoFolder(safeChannelId, safeVideoId);

    let source: ProductionTranscriptSource | null = null;
    let cues: ProductionTranscriptCue[] = [];

    for (const candidate of TRANSCRIPT_CANDIDATES) {
      const filePath = path.join(workDir, candidate);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const blocks = parseSrt(content);
        source = candidate;
        cues = blocks.map((block, index) => ({
          index,
          startTime: block.start,
          endTime: block.end,
          text: block.text,
        }));
      } catch {
        source = candidate;
        cues = [];
      }
      break;
    }

    return {
      channelId: safeChannelId,
      videoId: safeVideoId,
      source,
      cues,
    };
  }

  getCharacters(
    channelId: string,
    videoId: string,
    basePath: string,
  ): ProductionCharactersResponse {
    const safeChannelId = assertSafeId(channelId, 'channel id');
    const safeVideoId = assertSafeId(videoId, 'video id');
    const workDir = resolveProductionVideoFolder(safeChannelId, safeVideoId);
    const file = readCharacterReferencesFile(workDir);

    const characters: ProductionCharacterItem[] = (file?.characters ?? [])
      .map((character) => {
        const id = typeof character.id === 'string' ? character.id.trim() : '';
        const imagePath = id
          ? findCharacterImagePath(
              workDir,
              id,
              typeof character.path === 'string' ? character.path : undefined,
            )
          : null;

        return {
          id,
          name: typeof character.name === 'string' ? character.name : id,
          description: typeof character.description === 'string' ? character.description : '',
          prompt: typeof character.prompt === 'string' ? character.prompt : '',
          imageUrl: imagePath && id ? `${basePath}/${encodeURIComponent(id)}/image` : null,
        };
      })
      .filter((character) => character.id.length > 0);

    return {
      channelId: safeChannelId,
      videoId: safeVideoId,
      generatedAt: file?.generatedAt ?? null,
      characters,
    };
  }

  getCharacterImage(
    channelId: string,
    videoId: string,
    characterId: string,
  ): ProductionSceneImageAsset {
    const safeCharacterId = assertSafeId(characterId, 'character id');
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const file = readCharacterReferencesFile(workDir);
    const character = file?.characters.find(
      (item) => typeof item.id === 'string' && item.id.trim() === safeCharacterId,
    );

    const filePath = findCharacterImagePath(
      workDir,
      safeCharacterId,
      typeof character?.path === 'string' ? character.path : undefined,
    );

    if (!filePath) {
      throw new AppError('Character image not found', 404, 'CHARACTER_IMAGE_NOT_FOUND');
    }

    return {
      filePath,
      contentType: imageContentType(filePath),
      size: fs.statSync(filePath).size,
    };
  }

  getThumbnail(channelId: string, videoId: string): ProductionSceneImageAsset {
    const workDir = resolveProductionVideoFolder(channelId, videoId);
    const filePath = findThumbnailPath(workDir);
    if (!filePath) {
      throw new AppError('Thumbnail not found', 404, 'THUMBNAIL_NOT_FOUND');
    }

    return {
      filePath,
      contentType: imageContentType(filePath),
      size: fs.statSync(filePath).size,
    };
  }

  getMetadata(
    channelId: string,
    videoId: string,
    videoBasePath: string,
  ): ProductionMetadataResponse {
    const safeChannelId = assertSafeId(channelId, 'channel id');
    const safeVideoId = assertSafeId(videoId, 'video id');
    const workDir = resolveProductionVideoFolder(safeChannelId, safeVideoId);
    const fields = readVideoMetadataFields(workDir);
    const hasThumbnail = Boolean(findThumbnailPath(workDir));

    return {
      channelId: safeChannelId,
      videoId: safeVideoId,
      title: fields.title,
      description: fields.description,
      tags: fields.tags,
      thumbnailUrl: hasThumbnail ? `${videoBasePath}/thumbnail` : null,
    };
  }
}

export const videoProductionUiService = new VideoProductionUiService();
