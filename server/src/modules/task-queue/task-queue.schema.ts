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
});

const createVideoPayloadSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string().optional(),
  channelHandle: z.string().optional(),
});

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
]);
