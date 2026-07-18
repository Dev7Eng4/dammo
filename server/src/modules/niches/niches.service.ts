import { AppError } from '../../shared/http/errors.js';
import { nichesRepository } from './niches.repository.js';
import type { CreateNicheInput, Niche } from './niches.types.js';

export function slugifyNicheLabel(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return slug || 'niche';
}

function uniqueNicheKey(base: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(base)) return base;

  let suffix = 2;
  while (existingKeys.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export class NichesService {
  list(): Niche[] {
    return nichesRepository.findAll();
  }

  getByKey(key: string): Niche {
    const niche = nichesRepository.findByKey(key);
    if (!niche) {
      throw new AppError('Niche not found', 404, 'NOT_FOUND');
    }
    return niche;
  }

  exists(key: string): boolean {
    return nichesRepository.findByKey(key) !== null;
  }

  create(input: CreateNicheInput): Niche {
    const label = input.label.trim();
    if (!label) {
      throw new AppError('Label is required', 400, 'INVALID_LABEL');
    }

    const existingKeys = new Set(nichesRepository.findAll().map((item) => item.key));
    const key = uniqueNicheKey(slugifyNicheLabel(label), existingKeys);

    const niche: Niche = {
      key,
      label,
      createdAt: new Date().toISOString(),
    };

    return nichesRepository.prepend(niche);
  }
}

export const nichesService = new NichesService();
