import { z } from 'zod';

export const createVideoAgentRunSchema = z.object({
  sourceUrls: z.array(z.string().min(1)).min(1).max(5),
  channelId: z.string().min(1),
  notes: z.string().max(4000).optional(),
  voicevoxSpeaker: z.number().int().min(0).optional(),
  speedScale: z.number().min(0.7).max(1.5).optional(),
  requireApproval: z.boolean().optional(),
});

export type CreateVideoAgentRunInput = z.infer<typeof createVideoAgentRunSchema>;

export const approvalSchema = z.object({
  feedback: z.string().max(4000).optional(),
});

export const rejectSchema = z.object({
  feedback: z.string().min(1).max(4000),
});
