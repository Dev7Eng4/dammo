import { z } from 'zod';
import { CAPTION_STYLE_KEYS } from '../video-production/shared/render-core/caption-styles.js';
import { getPublishTimeSlotCount } from './upload-schedule.js';

const uploadFrequencySchema = z.enum([
  'every_5_days',
  'every_3_days',
  'every_2_days',
  'daily_1',
  'daily_2',
  'daily_3',
]);

const publishTimeSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format');

const youtubeChannelTypeSchema = z.enum(['content', 'reup_audio', 'reup_video', 'content_sale']);

const channelLanguageSchema = z.enum(['en', 'ko', 'ja', 'es']);

const channelConfigFields = {
  mailAccountId: z.string().min(1),
  type: youtubeChannelTypeSchema,
  language: channelLanguageSchema,
  niche: z.string().default(''),
  sourceChannels: z.array(z.string().min(1)).optional(),
  videoCreationOrder: z
    .enum(['oldest_first', 'newest_first', 'lowest_views_first', 'shortest_duration_first'])
    .optional(),
  backgroundFootageSources: z.array(z.string().min(1)).optional(),
  thumbnailStyleKey: z.string().optional(),
  thumbnailBackgroundFile: z.string().optional(),
  captionStyleKey: z.enum(CAPTION_STYLE_KEYS).optional(),
  reupAudioVideoType: z.enum(['si', 'ai']).optional(),
  reupAudioVisualStyleId: z.string().min(1).optional(),
  reupAudioBackgroundImage: z
    .enum(['no_image', 'local_image', 'one_image', 'multi_image', 'celebrity'])
    .optional(),
  celebrityId: z.string().uuid().optional(),
  aiSceneDensityMaxSec: z
    .object({
      high: z.number().int().min(1).max(300),
      medium: z.number().int().min(1).max(300),
      low: z.number().int().min(1).max(300),
    })
    .optional(),
  useReferenceImage: z.boolean().optional(),
  showAudioBar: z.boolean().optional(),
  audioBarFile: z.string().optional(),
  showChannelAvatar: z.boolean().optional(),
  showSubscribe: z.boolean().optional(),
  showSmallVideo: z.boolean().optional(),
  smallVideoFile: z.string().optional(),
  subscribeFile: z.string().optional(),
  showDisclaimer: z.boolean().optional(),
  disclaimerText: z.string().max(2000).optional(),
  descriptionDisclaimerText: z.string().max(2000).optional(),
  uploadFrequency: uploadFrequencySchema,
  publishTimes: z.array(publishTimeSchema),
};

function isReupChannelType(type: z.infer<typeof youtubeChannelTypeSchema>): boolean {
  return type === 'reup_audio' || type === 'reup_video';
}

function applyChannelConfigRefine(
  data: {
    type: z.infer<typeof youtubeChannelTypeSchema>;
    sourceChannels?: string[];
    thumbnailStyleKey?: string;
    reupAudioVideoType?: z.infer<typeof channelConfigFields.reupAudioVideoType>;
    reupAudioVisualStyleId?: string;
    reupAudioBackgroundImage?: z.infer<typeof channelConfigFields.reupAudioBackgroundImage>;
    celebrityId?: string;
    useReferenceImage?: boolean;
    uploadFrequency: z.infer<typeof uploadFrequencySchema>;
    publishTimes: string[];
  },
  ctx: z.RefinementCtx,
) {
  if (isReupChannelType(data.type)) {
    if (!data.sourceChannels?.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Source channels are required for reup channels',
        path: ['sourceChannels'],
      });
    }
  }

  if (data.type === 'reup_audio') {
    if (!data.reupAudioVideoType) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video type is required for Reup Audio channels',
        path: ['reupAudioVideoType'],
      });
    }
    if (data.reupAudioVideoType === 'ai' && !data.reupAudioVisualStyleId?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video style is required for Animate Images (AI)',
        path: ['reupAudioVisualStyleId'],
      });
    }
    if (data.reupAudioVideoType === 'si' && !data.reupAudioBackgroundImage) {
      ctx.addIssue({
        code: 'custom',
        message: 'Background image is required for Stock Video + Image',
        path: ['reupAudioBackgroundImage'],
      });
    }
    if (
      data.reupAudioVideoType === 'si' &&
      data.reupAudioBackgroundImage === 'celebrity' &&
      !data.celebrityId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Celebrity is required when background image mode is celebrity',
        path: ['celebrityId'],
      });
    }
    if (
      data.reupAudioVideoType === 'si' &&
      data.reupAudioBackgroundImage === 'multi_image' &&
      !data.reupAudioVisualStyleId?.trim()
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video style is required for Stock Video + multi image',
        path: ['reupAudioVisualStyleId'],
      });
    }
    if (data.useReferenceImage === true && !data.reupAudioVisualStyleId?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video style is required when using reference images',
        path: ['reupAudioVisualStyleId'],
      });
    }
  }

  const expectedSlots = getPublishTimeSlotCount(data.uploadFrequency);
  if (data.publishTimes.length !== expectedSlots) {
    ctx.addIssue({
      code: 'custom',
      message: `Expected ${expectedSlots} publish time(s)`,
      path: ['publishTimes'],
    });
  }
}

export const createYoutubeChannelSchema = z
  .object({
    ...channelConfigFields,
    channelUrl: z.string().optional(),
    thumbnailBackgroundTempSessionId: z.string().min(8).max(64).optional(),
    avatarTempSessionId: z.string().min(8).max(64).optional(),
  })
  .superRefine(applyChannelConfigRefine);

export const updateYoutubeChannelSchema = z
  .object({
    ...channelConfigFields,
    channelUrl: z.string().optional(),
  })
  .superRefine(applyChannelConfigRefine);

export const listYoutubeChannelsQuerySchema = z.object({
  type: youtubeChannelTypeSchema.optional(),
  monetization: z.enum(['monetized', 'in_review', 'demonetized', 'limited']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createVideosBatchSchema = z.object({
  channelIds: z.array(z.string().min(1)).min(1).optional(),
});

export const updateYoutubeVideoContentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000),
  tags: z.array(z.string().trim().min(1).max(100)).max(100),
});

export const deleteYoutubeVideosSchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1),
});

export const deleteUploadedVideosSchema = z.object({
  deletePreparedVideos: z.boolean().optional().default(false),
});
