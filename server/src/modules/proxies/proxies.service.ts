import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import { paginate } from '../../shared/types/pagination.js';
import { proxiesRepository } from './proxies.repository.js';
import { testProxyConnection } from './proxies.tester.js';
import { updateGpmProfile } from '../../infrastructure/gpm/gpm-api.client.js';
import type {
  CreateProxyInput,
  Proxy,
  ProxyStats,
  ProxyStatus,
  ProxyTestResult,
  UpdateProxyInput,
} from './proxies.types.js';

function isActive(proxy: Proxy): boolean {
  return !proxy.archivedAt;
}

function filterProxies(
  proxies: Proxy[],
  status?: ProxyStatus,
  query?: string,
): Proxy[] {
  let results = proxies.filter(isActive);

  if (status) {
    results = results.filter((proxy) => proxy.status === status);
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (proxy) =>
        proxy.name.toLowerCase().includes(q) ||
        proxy.host.toLowerCase().includes(q) ||
        (proxy.username?.toLowerCase().includes(q) ?? false) ||
        (proxy.provider?.toLowerCase().includes(q) ?? false) ||
        (proxy.location?.toLowerCase().includes(q) ?? false),
    );
  }

  return results;
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function buildRawProxy(proxy: Pick<Proxy, 'host' | 'port' | 'username' | 'password'>): string {
  const hostPort = `${proxy.host}:${proxy.port}`;
  if (proxy.username) {
    return `${hostPort}:${proxy.username}:${proxy.password ?? ''}`;
  }
  return hostPort;
}

export class ProxiesService {
  listPaginated(
    status: ProxyStatus | undefined,
    query: string | undefined,
    page: number,
    limit: number,
  ) {
    const filtered = filterProxies(proxiesRepository.findAll(), status, query);
    return paginate(filtered, page, limit);
  }

  getStats(): ProxyStats {
    const proxies = proxiesRepository.findAll().filter(isActive);
    const withLatency = proxies.filter((proxy) => proxy.latencyMs != null);
    const avgLatencyMs =
      withLatency.length > 0
        ? Math.round(
            withLatency.reduce((sum, proxy) => sum + (proxy.latencyMs ?? 0), 0) / withLatency.length,
          )
        : 0;

    return {
      total: proxies.length,
      active: proxies.filter((proxy) => proxy.status === 'active').length,
      failed: proxies.filter((proxy) => proxy.status === 'failed').length,
      assigned: proxies.filter((proxy) => proxy.assignedProfileIds.length > 0).length,
      unassigned: proxies.filter((proxy) => proxy.assignedProfileIds.length === 0).length,
      avgLatencyMs,
    };
  }

  getById(id: string): Proxy {
    const proxy = proxiesRepository.findById(id);
    if (!proxy || proxy.archivedAt) {
      throw new AppError('Proxy not found', 404, 'NOT_FOUND');
    }
    return proxy;
  }

  getForExport(status: ProxyStatus | undefined, query: string | undefined, ids?: string[]) {
    if (ids && ids.length > 0) {
      return ids
        .map((id) => proxiesRepository.findById(id))
        .filter((proxy): proxy is Proxy => proxy !== null && !proxy.archivedAt);
    }
    return filterProxies(proxiesRepository.findAll(), status, query);
  }

  create(input: CreateProxyInput): Proxy {
    const now = new Date().toISOString();
    const host = input.host.trim();
    const port = input.port;
    const username = normalizeOptionalString(input.username);
    const password = normalizeOptionalString(input.password);
    const proxy: Proxy = {
      id: generateId(),
      name: input.name.trim(),
      type: input.type,
      host,
      port,
      username,
      password,
      rawProxy: buildRawProxy({ host, port, username, password }),
      location: normalizeOptionalString(input.location),
      countryCode: normalizeOptionalString(input.countryCode)?.toUpperCase(),
      provider: normalizeOptionalString(input.provider),
      tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      status: 'active',
      assignedProfileIds: [],
      maxProfiles: 0,
      expiresAt: normalizeOptionalString(input.expiresAt),
      createdAt: now,
      updatedAt: now,
    };

    return proxiesRepository.prepend(proxy);
  }

  async update(id: string, input: UpdateProxyInput): Promise<Proxy> {
    const existing = this.getById(id);
    const oldRawProxy = existing.rawProxy ?? buildRawProxy(existing);
    const now = new Date().toISOString();

    const updated = proxiesRepository.update(id, (proxy) => {
      const host = input.host?.trim() ?? proxy.host;
      const port = input.port ?? proxy.port;
      const username =
        input.username === null
          ? undefined
          : input.username !== undefined
            ? normalizeOptionalString(input.username)
            : proxy.username;
      const password =
        input.password === null
          ? undefined
          : input.password !== undefined
            ? normalizeOptionalString(input.password)
            : proxy.password;

      return {
        ...proxy,
        name: input.name?.trim() ?? proxy.name,
        type: input.type ?? proxy.type,
        host,
        port,
        username,
        password,
        rawProxy: buildRawProxy({ host, port, username, password }),
        location:
          input.location === null
            ? undefined
            : input.location !== undefined
              ? normalizeOptionalString(input.location)
              : proxy.location,
        countryCode:
          input.countryCode === null
            ? undefined
            : input.countryCode !== undefined
              ? normalizeOptionalString(input.countryCode)?.toUpperCase()
              : proxy.countryCode,
        provider:
          input.provider === null
            ? undefined
            : input.provider !== undefined
              ? normalizeOptionalString(input.provider)
              : proxy.provider,
        tags: input.tags ?? proxy.tags,
        status: input.status ?? proxy.status,
        updatedAt: now,
      };
    });

    if (!updated) {
      throw new AppError('Proxy not found', 404, 'NOT_FOUND');
    }

    const newRawProxy = updated.rawProxy;

    // Sync proxy changes to GPM Local API for all assigned profiles.
    // Best-effort: if GPM is unavailable, keep the local update.
    if (newRawProxy !== oldRawProxy && updated.assignedProfileIds.length > 0) {
      for (const profileId of updated.assignedProfileIds) {
        try {
          await updateGpmProfile(profileId, { raw_proxy: newRawProxy });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.warn(`Failed to sync raw_proxy for GPM profile ${profileId}: ${detail}`);
        }
      }
    }

    return updated;
  }

  archive(id: string): void {
    const existing = this.getById(id);
    if (existing.assignedProfileIds.length > 0) {
      throw new AppError(
        `Cannot archive proxy: it has ${existing.assignedProfileIds.length} assigned GPM profile(s). Unassign profiles first.`,
        409,
        'PROXY_HAS_PROFILES',
      );
    }
    const now = new Date().toISOString();
    proxiesRepository.update(existing.id, (proxy) => ({
      ...proxy,
      archivedAt: now,
      updatedAt: now,
    }));
  }

  archiveFailed(): number {
    const failedIds = proxiesRepository
      .findAll()
      .filter((proxy) => isActive(proxy) && proxy.status === 'failed' && proxy.assignedProfileIds.length === 0)
      .map((proxy) => proxy.id);
    return proxiesRepository.archiveMany(failedIds);
  }

  extend(id: string, days: number): Proxy {
    const existing = this.getById(id);
    const base = existing.expiresAt ? new Date(existing.expiresAt) : new Date();
    if (Number.isNaN(base.getTime())) {
      base.setTime(Date.now());
    }
    base.setDate(base.getDate() + days);
    const expiresAt = base.toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const updated = proxiesRepository.update(id, (proxy) => ({
      ...proxy,
      expiresAt,
      updatedAt: now,
    }));

    if (!updated) {
      throw new AppError('Proxy not found', 404, 'NOT_FOUND');
    }

    return updated;
  }

  async test(id: string): Promise<ProxyTestResult> {
    const proxy = this.getById(id);
    const result = await testProxyConnection(proxy);

    proxiesRepository.update(id, (current) => ({
      ...current,
      status: result.status,
      latencyMs: result.latencyMs,
      lastCheckedAt: result.lastCheckedAt,
      updatedAt: result.lastCheckedAt,
    }));

    return result;
  }

  importRows(
    rows: Array<Record<string, unknown>>,
  ): { created: number; skipped: number; errors: string[] } {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [index, row] of rows.entries()) {
      const name = String(row.Name ?? row.name ?? '').trim();
      const host = String(row.Host ?? row.host ?? '').trim();
      const port = Number(row.Port ?? row.port ?? 0);
      const typeRaw = String(row.Type ?? row.type ?? 'http').trim().toLowerCase();

      if (!name || !host || !port) {
        skipped += 1;
        errors.push(`Row ${index + 2}: missing name, host, or port`);
        continue;
      }

      const type =
        typeRaw === 'socks5' || typeRaw === 'socks' ? 'socks5' : typeRaw === 'https' ? 'https' : 'http';

      try {
        this.create({
          name,
          type,
          host,
          port,
          username: String(row.Username ?? row.username ?? '').trim() || undefined,
          password: String(row.Password ?? row.password ?? '').trim() || undefined,
          location: String(row.Location ?? row.location ?? '').trim() || undefined,
          countryCode: String(row['Country Code'] ?? row.countryCode ?? '').trim() || undefined,
          provider: String(row.Provider ?? row.provider ?? '').trim() || undefined,
          tags: String(row.Tags ?? row.tags ?? '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        });
        created += 1;
      } catch (err) {
        skipped += 1;
        errors.push(
          `Row ${index + 2}: ${err instanceof Error ? err.message : 'Failed to import'}`,
        );
      }
    }

    return { created, skipped, errors };
  }

  setProfileAssignment(profileId: string, proxyId: string | null): void {
    if (proxyId) {
      const target = proxiesRepository.findById(proxyId);
      if (!target || target.archivedAt) {
        throw new AppError('Proxy not found', 404, 'NOT_FOUND');
      }
    }

    const now = new Date().toISOString();
    proxiesRepository.saveStore((store) => ({
      proxies: store.proxies.map((proxy) => {
        const withoutProfile = proxy.assignedProfileIds.filter((id) => id !== profileId);
        const shouldAssign = proxyId !== null && proxy.id === proxyId;
        const assignedProfileIds = shouldAssign
          ? withoutProfile.includes(profileId)
            ? withoutProfile
            : [...withoutProfile, profileId]
          : withoutProfile;

        if (
          assignedProfileIds.length === proxy.assignedProfileIds.length &&
          assignedProfileIds.every((id, i) => id === proxy.assignedProfileIds[i])
        ) {
          return proxy;
        }

        return {
          ...proxy,
          assignedProfileIds,
          updatedAt: now,
          ...(shouldAssign ? { lastUsed: now } : {}),
        };
      }),
    }));
  }
}

export const proxiesService = new ProxiesService();
