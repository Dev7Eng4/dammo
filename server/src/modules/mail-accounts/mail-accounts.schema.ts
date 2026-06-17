import { z } from 'zod';

export const createMailAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).or(z.literal('')).optional(),
  recoveryEmail: z.string().email().or(z.literal('')).optional(),
});

export const listMailAccountsQuerySchema = z.object({
  status: z.enum(['active', 'need_verify', 'suspended']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const exportMailAccountsQuerySchema = z.object({
  status: z.enum(['active', 'need_verify', 'suspended']).optional(),
  q: z.string().optional(),
  ids: z.string().optional(),
});
