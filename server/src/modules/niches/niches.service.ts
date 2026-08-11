import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { getNicheUsage, type NicheUsage } from './niche-usage.js';
import { nichesRepository } from './niches.repository.js';
import type { CreateNicheInput, Niche, UpdateNicheInput } from './niches.types.js';

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

  getUsage(key: string): NicheUsage {
    this.getByKey(key);
    return getNicheUsage(key);
  }

  create(input: CreateNicheInput): Niche {
    const label = input.label.trim();
    if (!label) {
      throw new AppError('Label is required', 400, 'INVALID_LABEL');
    }

    const niche: Niche = {
      key: generateId(),
      label,
      createdAt: new Date().toISOString(),
    };

    return nichesRepository.prepend(niche);
  }

  update(key: string, input: UpdateNicheInput): Niche {
    this.getByKey(key);

    const label = input.label.trim();
    if (!label) {
      throw new AppError('Label is required', 400, 'INVALID_LABEL');
    }

    const updated = nichesRepository.update(key, (niche) => ({
      ...niche,
      label,
    }));

    if (!updated) {
      throw new AppError('Niche not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  delete(key: string): void {
    this.getByKey(key);
    const usage = getNicheUsage(key);

    if (usage.inUse) {
      const names = [
        ...usage.prompts.map((item) => item.name),
        ...usage.sourceChannels.map((item) => item.name),
        ...usage.youtubeChannels.map((item) => item.name),
      ].join(', ');
      throw new AppError(`Niche is used by: ${names}`, 409, 'NICHE_IN_USE');
    }

    const removed = nichesRepository.remove(key);
    if (!removed) {
      throw new AppError('Niche not found', 404, 'NOT_FOUND');
    }
  }
}

export const nichesService = new NichesService();
