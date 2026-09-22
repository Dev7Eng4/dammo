import { z } from 'zod';

export const createMailAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).or(z.literal('')).optional(),
  twoFactorAuth: z.string().optional(),
  recoveryEmail: z.string().email().or(z.literal('')).optional(),
  phone: z.string().optional(),
});

export const updateMailAccountSchema = createMailAccountSchema;

export const importMailAccountsSchema = z.object({
  rows: z.array(createMailAccountSchema).min(1),
});

export const previewMailAccountsTextSchema = z.object({
  text: z.string().min(1),
});

export const listMailAccountsQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const exportMailAccountsQuerySchema = z.object({
  q: z.string().optional(),
  ids: z.string().optional(),
});
