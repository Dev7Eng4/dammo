import { z } from 'zod';
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
  sourceChannels: z.array(z.string().min(1)).optional(),
  backgroundFootageSources: z.array(z.string().min(1)).optional(),
  backgroundFootageMode: z.enum(['source', 'local']).optional(),
  thumbnailStyleKey: z.string().optional(),
  captionStyleKey: z
    .enum([
      'default',
      'bizudp_gothic',
      'zen_kaku',
      'noto_serif',
      'cyan',
      'cyan_navy',
      'yellow',
      'blue_glow',
      'green',
      'klee_one',
    ])
    .optional(),
  reupAudioVideoType: z.enum(['si', 'ai']).optional(),
  reupAudioVisualStyleId: z.string().min(1).optional(),
  reupAudioBackgroundImage: z
    .enum(['no_image', 'local_image', 'one_image', 'multi_image'])
    .optional(),
  showAudioBar: z.boolean().optional(),
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
  })
  .superRefine(applyChannelConfigRefine);

export const updateYoutubeChannelSchema = z
  .object(channelConfigFields)
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
