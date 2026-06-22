import { z } from 'zod';

export const createProxyProviderSchema = z.object({
  name: z.string().trim().min(1),
  loginUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\/.+/i.test(value), {
      message: 'URL must start with http:// or https://',
    }),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  notes: z.string().optional(),
});

export const updateProxyProviderSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    loginUrl: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^https?:\/\/.+/i.test(value), {
        message: 'URL must start with http:// or https://',
      }),
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });
