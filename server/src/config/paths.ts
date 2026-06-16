import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export const paths = {
  dataDir: env.dataDir,
  mailAccounts: path.join(env.dataDir, 'mail-accounts.json'),
  dashboard: path.join(env.dataDir, 'dashboard.json'),
  renderJobsDir: path.join(env.dataDir, 'renders', 'jobs'),
  renderOutputDir: path.join(env.dataDir, 'renders', 'output'),
  importsDir: path.join(env.dataDir, 'imports'),
  youtubeChannels: path.join(env.dataDir, 'youtube-channels.json'),
  sourceChannels: path.join(env.dataDir, 'source-channels.json'),
  sourcesDir: path.join(env.dataDir, 'sources'),
};

export function sourceVideosFile(sourceId: string): string {
  return path.join(paths.sourcesDir, `${sourceId}.json`);
}

export function ensureDataDirs(): void {
  const dirs = [
    paths.dataDir,
    paths.renderJobsDir,
    paths.renderOutputDir,
    paths.importsDir,
    paths.sourcesDir,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}
