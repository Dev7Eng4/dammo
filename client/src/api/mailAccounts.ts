import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type {
  CreateMailAccountPayload,
  MailAccount,
  MailAccountsResponse,
} from '../types/mailAccount';

export function fetchMailAccounts(
  query = '',
  page = 1,
  limit = 20,
  options?: FetchOptions,
) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  params.set('page', String(page));
  params.set('limit', String(limit));
  return fetchJson<MailAccountsResponse>(
    `${API_V1}/mail-accounts?${params}`,
    withSignal(undefined, options),
  );
}

export function fetchMailAccount(id: string, options?: FetchOptions) {
  return fetchJson<MailAccount>(
    `${API_V1}/mail-accounts/${id}`,
    withSignal(undefined, options),
  );
}

export function createMailAccount(payload: CreateMailAccountPayload) {
  return fetchJson<{ item: MailAccount }>(`${API_V1}/mail-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function exportMailAccountsExcel(
  query = '',
  ids?: string[],
) {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (ids && ids.length > 0) params.set('ids', ids.join(','));

  const res = await fetch(`${API_V1}/mail-accounts/export?${params}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Export failed: ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `mail-accounts-${new Date().toISOString().slice(0, 10)}.xlsx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
