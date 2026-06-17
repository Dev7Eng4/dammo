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

const channelConfigFields = {
  mailAccountId: z.string().min(1),
  type: z.enum(['content', 'reup', 'content_sale']),
  sourceChannelIds: z.array(z.string().min(1)).optional(),
  reupVideoSourceId: z.string().optional(),
  reupAudioSourceId: z.string().optional(),
  backgroundFootageSourceId: z.string().optional(),
  uploadFrequency: uploadFrequencySchema,
  publishTimes: z.array(publishTimeSchema),
};

function applyChannelConfigRefine(
  data: {
    type: 'content' | 'reup' | 'content_sale';
    reupVideoSourceId?: string;
    reupAudioSourceId?: string;
    uploadFrequency: z.infer<typeof uploadFrequencySchema>;
    publishTimes: string[];
  },
  ctx: z.RefinementCtx,
) {
  if (data.type === 'reup') {
    if (!data.reupVideoSourceId?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video source is required for reup channels',
        path: ['reupVideoSourceId'],
      });
    }
    if (!data.reupAudioSourceId?.trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Audio source is required for reup channels',
        path: ['reupAudioSourceId'],
      });
    }
    if (
      data.reupVideoSourceId?.trim() &&
      data.reupAudioSourceId?.trim() &&
      data.reupVideoSourceId === data.reupAudioSourceId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Video and audio sources must be different',
        path: ['reupAudioSourceId'],
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
    channelUrl: z.string().min(1),
  })
  .superRefine(applyChannelConfigRefine);

export const updateYoutubeChannelSchema = z
  .object(channelConfigFields)
  .superRefine(applyChannelConfigRefine);

export const listYoutubeChannelsQuerySchema = z.object({
  type: z.enum(['content', 'reup', 'content_sale']).optional(),
  monetization: z.enum(['monetized', 'in_review', 'demonetized', 'limited']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
