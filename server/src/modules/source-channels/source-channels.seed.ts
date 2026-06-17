import { generateId } from '../../shared/id.js';
import type { SourceChannel, SourceChannelsStore, SourcePlatform, SourcePurpose, SourceRiskLevel } from './source-channels.types.js';

const platforms: SourcePlatform[] = ['youtube', 'tiktok', 'facebook'];
const purposes: SourcePurpose[] = [
  'trend_tracking',
  'idea_reference',
  'licensed_source',
  'competitor_tracking',
  'reup',
  'background_footage',
];
const riskLevels: SourceRiskLevel[] = ['low', 'medium', 'high'];
const niches = ['Consumer Electronics', 'Gadget Reviews', 'Life Hacks', 'Finance News', 'Fitness', 'Travel Vlogs', 'Cooking', 'Gaming'];

const featuredSources: Omit<SourceChannel, 'id'>[] = [
  {
    platform: 'youtube',
    name: 'TechTrends Daily',
    url: '@techtrendsdaily',
    fullUrl: 'https://youtube.com/@techtrendsdaily',
    niche: 'Consumer Electronics',
    purpose: 'trend_tracking',
    riskLevel: 'low',
    mappedOwnedChannels: [
      { id: generateId(), name: 'Gadget Guru YT' },
      { id: generateId(), name: 'TechTok Shorts' },
    ],
    activeProjects: [
      {
        id: 'PRJ-402',
        name: 'Top 10 CES Gadgets 2024',
        status: 'In Production',
        statusDetail: 'Due Tomorrow',
      },
      {
        id: 'PRJ-398',
        name: 'Apple Vision Pro Review Breakdown',
        status: 'Completed',
        statusDetail: '2 days ago',
      },
    ],
  },
  {
    platform: 'tiktok',
    name: 'ViralGadgets_Official',
    url: '@viralgadgets',
    fullUrl: 'https://tiktok.com/@viralgadgets',
    niche: 'Gadget Reviews',
    purpose: 'idea_reference',
    riskLevel: 'medium',
    mappedOwnedChannels: [],
    activeProjects: [],
  },
  {
    platform: 'facebook',
    name: 'Awesome Inventions Hub',
    url: '/awesomeinventions',
    fullUrl: 'https://facebook.com/awesomeinventions',
    niche: 'Life Hacks',
    purpose: 'licensed_source',
    riskLevel: 'low',
    mappedOwnedChannels: [],
    activeProjects: [],
  },
  {
    platform: 'youtube',
    name: 'Crypto Whales Daily',
    url: '@cryptowhales',
    fullUrl: 'https://youtube.com/@cryptowhales',
    niche: 'Finance News',
    purpose: 'competitor_tracking',
    riskLevel: 'high',
    mappedOwnedChannels: [],
    activeProjects: [],
  },
];

export function generateSeedSources(): SourceChannelsStore {
  const sources: SourceChannel[] = featuredSources.map(source => ({
    ...source,
    id: generateId(),
  }));

  for (let i = 5; i <= 52; i++) {
    const platform = platforms[i % platforms.length];
    const purpose = purposes[i % purposes.length];
    const riskLevel = riskLevels[i % riskLevels.length];
    const niche = niches[i % niches.length];
    const slug = `source${i}`;

    let url: string;
    let fullUrl: string;
    if (platform === 'youtube') {
      url = `@${slug}`;
      fullUrl = `https://youtube.com/@${slug}`;
    } else if (platform === 'tiktok') {
      url = `@${slug}`;
      fullUrl = `https://tiktok.com/@${slug}`;
    } else {
      url = `/${slug}`;
      fullUrl = `https://facebook.com/${slug}`;
    }

    sources.push({
      id: generateId(),
      platform,
      name: `${niche} Source ${i}`,
      url,
      fullUrl,
      niche,
      purpose,
      riskLevel,
      mappedOwnedChannels: i % 5 === 0 ? [{ id: generateId(), name: `Owned Channel ${i}` }] : [],
      activeProjects:
        i % 7 === 0
          ? [
              {
                id: `PRJ-${400 + i}`,
                name: `${niche} Compilation ${i}`,
                status: i % 2 === 0 ? 'In Production' : 'Completed',
                statusDetail: i % 2 === 0 ? 'Due this week' : '1 week ago',
              },
            ]
          : [],
    });
  }

  return { sources: [] };
}
