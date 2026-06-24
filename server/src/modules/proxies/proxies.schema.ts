import { z } from 'zod';

const proxyTypeSchema = z.enum(['http', 'https', 'socks5']);
const proxyStatusSchema = z.enum(['active', 'failed', 'slow', 'expired', 'in_use']);

export const createProxySchema = z.object({
  name: z.string().trim().min(1),
  type: proxyTypeSchema,
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  location: z.string().optional(),
  countryCode: z.string().optional(),
  provider: z.string().optional(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().optional(),
});

export const updateProxySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: proxyTypeSchema.optional(),
    host: z.string().trim().min(1).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    username: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    tags: z.array(z.string()).optional(),
    status: proxyStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field is required' });

export const listProxiesQuerySchema = z.object({
  status: proxyStatusSchema.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const exportProxiesQuerySchema = z.object({
  status: proxyStatusSchema.optional(),
  q: z.string().optional(),
  ids: z.string().optional(),
});
