import { generateId } from '../../shared/id.js';
import type {
  HealthScore,
  MonetizationStatus,
  YoutubeChannel,
  YoutubeChannelsStore,
  YoutubeChannelStatus,
  YoutubeChannelType,
} from './youtube-channels.types.js';

const STALE_DAYS = 8;
const WEEK_DAYS = 3;

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function typeLabel(type: YoutubeChannelType): string {
  switch (type) {
    case 'content':
      return 'Content';
    case 'reup':
      return 'Reup';
    case 'content_sale':
      return 'Content Sale';
  }
}

const featuredChannels: Omit<YoutubeChannel, 'id' | 'createdAt'>[] = [
  {
    name: 'Tech Nexus Daily',
    handle: '@technexusdaily',
    youtubeUrl: 'https://youtube.com/@technexusdaily',
    type: 'content',
    niche: 'Technology',
    language: 'EN-US',
    monetizationStatus: 'monetized',
    healthScore: 'high',
    status: 'active',
    linkedEmail: 'ops.tech1@company.com',
    uploadSchedule: '3x / Week',
    sourceMapping: '/mnt/nas/tech_raw/',
    contentProjectId: 'PRJ-TND-09',
    notes: 'Recent B-roll flagged. Adjusted source folder exclusion rules. Monitor next upload.',
    recentActivity: [{ at: daysAgo(0).slice(11, 16), message: 'Automated upload successful' }],
    lastUploadAt: daysAgo(1),
  },
  {
    name: 'Crypto Insights Pro',
    handle: '@cryptoinsights',
    youtubeUrl: 'https://youtube.com/@cryptoinsights',
    type: 'reup',
    niche: 'Finance',
    language: 'EN-UK',
    monetizationStatus: 'in_review',
    healthScore: 'medium',
    status: 'active',
    linkedEmail: 'finance.ops@company.com',
    uploadSchedule: '2x / Week',
    sourceMapping: '/mnt/nas/finance_raw/',
    contentProjectId: 'PRJ-CIP-04',
    recentActivity: [{ at: daysAgo(2).slice(11, 16), message: 'Monetization review submitted' }],
    lastUploadAt: daysAgo(3),
  },
  {
    name: 'Gaming Highlights V2',
    handle: '@gamingv2_archive',
    youtubeUrl: 'https://youtube.com/@gamingv2_archive',
    type: 'content_sale',
    niche: 'Gaming',
    language: 'ES-ES',
    monetizationStatus: 'demonetized',
    healthScore: 'low',
    status: 'suspended',
    linkedEmail: 'gaming.archive@company.com',
    uploadSchedule: '1x / Week',
    sourceMapping: '/mnt/nas/gaming_archive/',
    contentProjectId: 'PRJ-GHV2-01',
    notes: 'Channel suspended pending appeal. Do not schedule uploads.',
    recentActivity: [{ at: daysAgo(14).slice(11, 16), message: 'Channel suspended by YouTube' }],
    lastUploadAt: daysAgo(30),
  },
];

const niches = ['Technology', 'Finance', 'Gaming', 'Lifestyle', 'Education', 'Sports', 'Music', 'Travel'];
const languages = ['EN-US', 'EN-UK', 'ES-ES', 'FR-FR', 'DE-DE', 'PT-BR', 'JA-JP'];
const types: YoutubeChannelType[] = ['content', 'reup', 'content_sale'];
const healthScores: HealthScore[] = ['high', 'medium', 'low'];
const statuses: YoutubeChannelStatus[] = ['active', 'suspended'];

function buildMonetizationDistribution(index: number): MonetizationStatus {
  if (index < 86) return 'monetized';
  if (index < 98) return 'in_review';
  if (index < 103) return 'limited';
  return 'demonetized';
}

export function generateSeedChannels(): YoutubeChannelsStore {
  const channels: YoutubeChannel[] = featuredChannels.map((c, i) => ({
    ...c,
    id: generateId(),
    createdAt: daysAgo(i < 3 ? WEEK_DAYS : 30 + i),
  }));

  for (let i = 4; i <= 124; i++) {
    const idx = i - 1;
    const monetization = buildMonetizationDistribution(idx);
    const type = types[i % types.length];
    const niche = niches[i % niches.length];
    const language = languages[i % languages.length];
    const slug = `${niche.toLowerCase().replace(/\s/g, '')}${i}`;
    const isStale = idx >= 106 && idx < 124;
    const isRecent = idx >= 121;

    channels.push({
      id: generateId(),
      name: `${niche} Channel ${i}`,
      handle: `@${slug}`,
      youtubeUrl: `https://youtube.com/@${slug}`,
      type,
      niche,
      language,
      monetizationStatus: monetization,
      healthScore: healthScores[i % healthScores.length],
      status: i % 17 === 0 ? 'suspended' : statuses[0],
      linkedEmail: `ops.${slug}@company.com`,
      uploadSchedule: `${(i % 5) + 1}x / Week`,
      sourceMapping: `/mnt/nas/${slug}/`,
      contentProjectId: `PRJ-${slug.toUpperCase().slice(0, 8)}`,
      recentActivity: [
        {
          at: daysAgo(isStale ? 10 : 1).slice(11, 16),
          message: isStale ? 'No uploads scheduled' : `${typeLabel(type)} upload completed`,
        },
      ],
      lastUploadAt: isStale ? daysAgo(STALE_DAYS + (i % 5)) : daysAgo(i % 6),
      createdAt: isRecent ? daysAgo(i % WEEK_DAYS) : daysAgo(30 + (i % 60)),
    });
  }

  return { channels };
}
