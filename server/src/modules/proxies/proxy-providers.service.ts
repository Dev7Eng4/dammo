import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { proxyProvidersRepository } from './proxy-providers.repository.js';
import type {
  CreateProxyProviderInput,
  ProxyProvider,
  UpdateProxyProviderInput,
} from './proxy-providers.types.js';

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class ProxyProvidersService {
  list(): ProxyProvider[] {
    return proxyProvidersRepository.findAll();
  }

  getById(id: string): ProxyProvider {
    const provider = proxyProvidersRepository.findById(id);
    if (!provider) {
      throw new AppError('Provider not found', 404, 'NOT_FOUND');
    }
    return provider;
  }

  create(input: CreateProxyProviderInput): ProxyProvider {
    const now = new Date().toISOString();
    const provider: ProxyProvider = {
      id: generateId(),
      name: input.name.trim(),
      loginUrl: normalizeOptionalString(input.loginUrl),
      username: input.username.trim(),
      password: input.password,
      notes: normalizeOptionalString(input.notes),
      createdAt: now,
      updatedAt: now,
    };

    return proxyProvidersRepository.prepend(provider);
  }

  update(id: string, input: UpdateProxyProviderInput): ProxyProvider {
    this.getById(id);
    const now = new Date().toISOString();

    const updated = proxyProvidersRepository.update(id, (provider) => ({
      ...provider,
      name: input.name?.trim() ?? provider.name,
      loginUrl:
        input.loginUrl !== undefined
          ? normalizeOptionalString(input.loginUrl)
          : provider.loginUrl,
      username: input.username?.trim() ?? provider.username,
      password: input.password !== undefined ? input.password : provider.password,
      notes:
        input.notes === null
          ? undefined
          : input.notes !== undefined
            ? normalizeOptionalString(input.notes)
            : provider.notes,
      updatedAt: now,
    }));

    if (!updated) {
      throw new AppError('Provider not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  delete(id: string): void {
    const removed = proxyProvidersRepository.remove(id);
    if (!removed) {
      throw new AppError('Provider not found', 404, 'NOT_FOUND');
    }
  }
}

export const proxyProvidersService = new ProxyProvidersService();
