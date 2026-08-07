import { z } from 'zod';

const addSourcePayloadSchema = z.object({
  url: z.string().min(1),
  purpose: z.enum([
    'trend_tracking',
    'idea_reference',
    'licensed_source',
    'competitor_tracking',
    'reup',
    'background_footage',
  ]),
  niche: z.string().min(1).optional(),
});

const createVideoPayloadSchema = z
  .object({
    channelId: z.string().min(1).optional(),
    channelIds: z.array(z.string().min(1)).min(1).optional(),
    allReupChannels: z.boolean().optional(),
    channelName: z.string().optional(),
    channelHandle: z.string().optional(),
    videoCount: z.number().int().min(1).max(50).optional(),
    prepareOnly: z.boolean().optional(),
    videoIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine(
    (data) => {
      const modes = [
        data.allReupChannels === true,
        Boolean(data.channelId),
        Boolean(data.channelIds?.length),
      ].filter(Boolean).length;
      return modes === 1;
    },
    { message: 'Provide exactly one of channelId, channelIds, or allReupChannels' },
  );

const uploadVideoPayloadSchema = z
  .object({
    channelId: z.string().min(1).optional(),
    channelIds: z.array(z.string().min(1)).min(1).optional(),
    allReupChannels: z.boolean().optional(),
    maxUploads: z.number().int().min(1).optional(),
    videoIds: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (data) => {
      const modes = [
        data.allReupChannels === true,
        Boolean(data.channelId),
        Boolean(data.channelIds?.length),
      ].filter(Boolean).length;
      return modes === 1;
    },
    { message: 'Provide exactly one of channelId, channelIds, or allReupChannels' },
  );

const downloadSourcePayloadSchema = z
  .object({
    sourceId: z.string().min(1).optional(),
    sourceIds: z.array(z.string().min(1)).min(1).optional(),
    allSources: z.boolean().optional(),
    sourceName: z.string().optional(),
  })
  .refine(
    (data) => {
      const modes = [
        data.allSources === true,
        Boolean(data.sourceId),
        Boolean(data.sourceIds?.length),
      ].filter(Boolean).length;
      return modes === 1;
    },
    { message: 'Provide exactly one of sourceId, sourceIds, or allSources' },
  );

export const enqueueTaskSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('add_source'),
    title: z.string().min(1).optional(),
    subtitle: z.string().optional(),
    payload: addSourcePayloadSchema,
  }),
  z.object({
    type: z.literal('create_video'),
    title: z.string().min(1).optional(),
    subtitle: z.string().optional(),
    payload: createVideoPayloadSchema,
  }),
  z.object({
    type: z.literal('upload_video'),
    title: z.string().min(1).optional(),
    subtitle: z.string().optional(),
    payload: uploadVideoPayloadSchema,
  }),
  z.object({
    type: z.literal('download_source'),
    title: z.string().min(1).optional(),
    subtitle: z.string().optional(),
    payload: downloadSourcePayloadSchema,
  }),
]);
