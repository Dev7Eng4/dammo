import fs from 'node:fs';
import { create as createYoutubeDl, youtubeDl as defaultYoutubeDl } from 'youtube-dl-exec';
import { env } from '../../config/env.js';

type YoutubeDlClient = typeof defaultYoutubeDl;

type ResolvedYoutubeDl = {
  client: YoutubeDlClient;
  source: 'custom' | 'bundled';
  path: string | null;
};

function resolveYoutubeDl(): ResolvedYoutubeDl {
  const customPath = env.ytDlpPath.trim();
  if (customPath && fs.existsSync(customPath)) {
    return { client: createYoutubeDl(customPath) as YoutubeDlClient, source: 'custom', path: customPath };
  }
  return { client: defaultYoutubeDl, source: 'bundled', path: null };
}

const resolved = resolveYoutubeDl();

export const youtubeDl = resolved.client;

export function getResolvedYtDlpInfo(): Readonly<ResolvedYoutubeDl> {
  return resolved;
}
