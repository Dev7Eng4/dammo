import { mailAccountsRepository } from '../mail-accounts/mail-accounts.repository.js';
import { sourceChannelsRepository } from '../source-channels/source-channels.repository.js';
import { youtubeChannelsRepository } from '../youtube-channels/youtube-channels.repository.js';

export type SearchResultType =
  | 'mail_account'
  | 'youtube_channel'
  | 'source_channel'
  | 'project'
  | 'account'
  | 'render';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  label: string;
  path: string;
}

const SEARCH_LIMIT = 20;

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query);
}

export class SearchService {
  search(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) {
      return { query: q, results: [] as SearchResult[] };
    }

    const results: SearchResult[] = [];

    for (const account of mailAccountsRepository.findAll()) {
      if (matchesQuery(account.email, q)) {
        results.push({
          id: account.id,
          type: 'mail_account',
          label: account.email,
          path: '/mail-accounts',
        });
      }
    }

    for (const channel of youtubeChannelsRepository.findAll()) {
      const haystack = `${channel.name} ${channel.handle} ${channel.linkedEmail} ${channel.niche}`;
      if (matchesQuery(haystack, q)) {
        results.push({
          id: channel.id,
          type: 'youtube_channel',
          label: `${channel.name} (${channel.handle})`,
          path: `/youtube-channels/${channel.id}`,
        });
      }
    }

    for (const source of sourceChannelsRepository.findAll()) {
      const haystack = `${source.name} ${source.url} ${source.fullUrl} ${source.niche}`;
      if (matchesQuery(haystack, q)) {
        results.push({
          id: source.id,
          type: 'source_channel',
          label: `${source.name} (${source.url})`,
          path: `/source-channels/${source.id}`,
        });
      }
    }

    return { query: q, results: results.slice(0, SEARCH_LIMIT) };
  }
}

export const searchService = new SearchService();
