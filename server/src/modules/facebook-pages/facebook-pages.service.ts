import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { mailAccountsRepository } from '../mail-accounts/mail-accounts.repository.js';
import { suggestFacebookCategory } from '../facebook-automation/topic-categories.js';
import { facebookPagesRepository } from './facebook-pages.repository.js';
import type { FacebookPage, FacebookPageStats, FacebookVideoFormat } from './facebook-pages.types.js';

export interface CreateFacebookPageInput {
  name: string;
  topic: string;
  category: string;
  bio: string;
  videoFormat: FacebookVideoFormat;
  mailAccountId: string;
  pageUrl: string;
  notes?: string;
}

export type UpdateFacebookPageInput = Partial<
  CreateFacebookPageInput & { status: Exclude<FacebookPage['status'], 'deleted'>; followers: number }
>;

function resolveLinkedEmail(mailAccountId: string): string {
  const account = mailAccountsRepository.findById(mailAccountId);
  if (!account) throw new AppError('Mail account not found', 404, 'MAIL_NOT_FOUND');
  return account.email;
}

export class FacebookPagesService {
  list(filter: { status: string; q: string }): FacebookPage[] {
    const q = filter.q.trim().toLowerCase();
    return facebookPagesRepository.findAll().filter((page) => {
      if (filter.status !== 'all' && page.status !== filter.status) return false;
      if (!q) return true;
      return [page.name, page.topic, page.category, page.linkedEmail].some((v) =>
        v.toLowerCase().includes(q),
      );
    });
  }

  stats(): FacebookPageStats {
    const pages = facebookPagesRepository.findAll();
    const count = (status: FacebookPage['status']) => pages.filter((p) => p.status === status).length;
    return {
      total: pages.length,
      draft: count('draft'),
      created: count('created'),
      active: count('active'),
      paused: count('paused'),
    };
  }

  get(id: string): FacebookPage {
    const page = facebookPagesRepository.findById(id);
    if (!page) throw new AppError('Facebook page not found', 404, 'NOT_FOUND');
    return page;
  }

  create(input: CreateFacebookPageInput): FacebookPage {
    const linkedEmail = resolveLinkedEmail(input.mailAccountId);
    const page: FacebookPage = {
      id: generateId(),
      name: input.name,
      topic: input.topic,
      category: input.category || suggestFacebookCategory(input.topic),
      bio: input.bio,
      videoFormat: input.videoFormat,
      linkedEmail,
      pageUrl: input.pageUrl,
      status: input.pageUrl ? 'created' : 'draft',
      notes: input.notes,
      createdAt: new Date().toISOString(),
    };
    return facebookPagesRepository.prepend(page);
  }

  update(id: string, input: UpdateFacebookPageInput): FacebookPage {
    this.get(id);
    const { mailAccountId, ...rest } = input;
    const linkedEmail = mailAccountId ? resolveLinkedEmail(mailAccountId) : undefined;
    const updated = facebookPagesRepository.update(id, (page) => ({
      ...page,
      ...rest,
      ...(linkedEmail ? { linkedEmail } : {}),
    }));
    if (!updated) throw new AppError('Facebook page not found', 404, 'NOT_FOUND');
    return updated;
  }

  remove(id: string): void {
    this.get(id);
    facebookPagesRepository.remove(id);
  }
}

export const facebookPagesService = new FacebookPagesService();
