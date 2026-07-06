import fs from 'node:fs/promises';
import path from 'node:path';
import { resizeImageInPlace } from '../../../../infrastructure/ffmpeg/image-resize.js';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { flowBrowserService } from '../../../llm-browser/flow-browser.service.js';
import { SI_CANVAS_H, SI_CANVAS_W } from '../si-video/si.constants.js';
import {
  AI_SLIDES_DIRNAME,
  AI_VIDEO_DEFAULT_SLIDES,
  AI_VIDEO_MAX_SLIDES,
  AI_VIDEO_MIN_SLIDES,
} from './ai-video.constants.js';
import type { GenerateAiVideoImagesInput } from './ai-video.types.js';

const MAX_RETRIES = 3;

function clampSlideCount(count: number): number {
  return Math.min(AI_VIDEO_MAX_SLIDES, Math.max(AI_VIDEO_MIN_SLIDES, count));
}

function resolveSlideCount(input: GenerateAiVideoImagesInput): number {
  if (input.slideCount !== undefined) {
    return clampSlideCount(input.slideCount);
  }
  return AI_VIDEO_DEFAULT_SLIDES;
}

function buildScenePrompt(input: GenerateAiVideoImagesInput, slideIndex: number, totalSlides: number): string {
  const { visualStyle, videoMetaOutput, metaStep3Output } = input;
  const meta = videoMetaOutput ?? metaStep3Output;
  const basePrompt =
    typeof meta?.hero_image_prompt?.prompt === 'string' &&
    meta.hero_image_prompt.prompt.trim()
      ? meta.hero_image_prompt.prompt.trim()
      : `Scene illustration for ${visualStyle.niche}`;

  const negative =
    typeof meta?.hero_image_prompt?.negative_prompt === 'string'
      ? meta.hero_image_prompt.negative_prompt.trim()
      : '';

  const parts = [
    basePrompt,
    `Visual style: ${visualStyle.name}`,
    visualStyle.rule,
    `Scene ${slideIndex + 1} of ${totalSlides}`,
    'cinematic 16:9 composition, no text, no watermark',
  ];

  const prompt = parts.filter(Boolean).join('. ');
  if (negative) {
    return `${prompt}\n\nNegative prompt: ${negative}`;
  }
  return prompt;
}

export async function generateAiVideoImages(input: GenerateAiVideoImagesInput): Promise<string[]> {
  const log = (msg: string) => {
    console.log(msg);
    input.onLog?.(msg);
  };

  const slidesDir = path.join(input.workDir, AI_SLIDES_DIRNAME);
  await fs.mkdir(slidesDir, { recursive: true });

  const totalSlides = resolveSlideCount(input);
  const profile = chromeProfilesService.requireMainProfile();
  const imagePaths: string[] = [];

  log(`[ai-video] Generating ${totalSlides} slide image(s) with visual style "${input.visualStyle.name}"...`);

  try {
    for (let slideIndex = 0; slideIndex < totalSlides; slideIndex += 1) {
      const fileName = `slide_${String(slideIndex + 1).padStart(2, '0')}.jpg`;
      const prompt = buildScenePrompt(input, slideIndex, totalSlides);
      let saved = false;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        input.onProgress?.({ slideIndex, totalSlides, attempt });

        try {
          const response = await flowBrowserService.generateImage(profile.id, prompt, {
            outputDir: slidesDir,
            fileName,
            timeoutMs: 300_000,
          });

          const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
          if (!savedPath) {
            log(`[ai-video] slide ${slideIndex + 1}: no image returned (attempt ${attempt})`);
            continue;
          }

          await resizeImageInPlace(savedPath, SI_CANVAS_W, SI_CANVAS_H, input.onLog);
          imagePaths.push(savedPath);
          log(
            `[ai-video] slide ${slideIndex + 1}/${totalSlides} saved + resized ${SI_CANVAS_W}x${SI_CANVAS_H} → ${path.basename(savedPath)}`,
          );
          saved = true;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error';
          log(`[ai-video] slide ${slideIndex + 1} attempt ${attempt} failed: ${message}`);
        }
      }

      if (!saved) {
        throw new AppError(
          `Failed to generate slide image ${slideIndex + 1} after ${MAX_RETRIES} attempts`,
          502,
          'AI_IMAGE_GENERATION_FAILED',
        );
      }
    }
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }

  return imagePaths;
}
