const searchResults = [
  { id: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a', type: 'project' as const, label: 'TikTok_Daily_Hook_05', path: '/content-projects' },
  { id: 'd9bf9e57-1685-4c89-bafb-ff5af830be8b', type: 'account' as const, label: 'YT Channel: TechDaily', path: '/youtube-channels' },
  { id: 'e9bf9e57-1685-4c89-bafb-ff5af830be8c', type: 'project' as const, label: 'FB_Reels_Promo_Q2', path: '/content-projects' },
  { id: 'f9bf9e57-1685-4c89-bafb-ff5af830be8d', type: 'render' as const, label: 'TikTok_Daily_Hook_05.mp4', path: '/render-queue' },
];

export class SearchService {
  search(query: string) {
    const q = query.toLowerCase().trim();
    const results = q
      ? searchResults.filter((item) => item.label.toLowerCase().includes(q))
      : searchResults;
    return { query: q, results };
  }
}

export const searchService = new SearchService();
