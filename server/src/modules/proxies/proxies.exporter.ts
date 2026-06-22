import { Buffer } from 'node:buffer';
import { jsonToExcelBuffer } from '../../infrastructure/storage/excel-store.js';
import { proxiesService } from './proxies.service.js';
import type { Proxy, ProxyStatus } from './proxies.types.js';

const STATUS_LABELS: Record<Proxy['status'], string> = {
  active: 'Active',
  failed: 'Failed',
  slow: 'Slow',
  expired: 'Expired',
  in_use: 'In Use',
};

const COLUMN_WIDTHS = [
  { wch: 24 },
  { wch: 10 },
  { wch: 24 },
  { wch: 8 },
  { wch: 18 },
  { wch: 18 },
  { wch: 20 },
  { wch: 8 },
  { wch: 18 },
  { wch: 20 },
  { wch: 12 },
  { wch: 12 },
];

function proxyToRow(proxy: Proxy) {
  return {
    Name: proxy.name,
    Type: proxy.type.toUpperCase(),
    Host: proxy.host,
    Port: proxy.port,
    Username: proxy.username ?? '',
    Password: proxy.password ?? '',
    Location: proxy.location ?? '',
    'Country Code': proxy.countryCode ?? '',
    Provider: proxy.provider ?? '',
    Tags: (proxy.tags ?? []).join(', '),
    Status: STATUS_LABELS[proxy.status],
    'Latency (ms)': proxy.latencyMs ?? '',
  };
}

export function buildProxiesExcel(
  status?: ProxyStatus,
  query?: string,
  ids?: string[],
): Buffer {
  const proxies = proxiesService.getForExport(status, query, ids);
  const rows = proxies.map(proxyToRow);
  return jsonToExcelBuffer(rows, 'Proxies', COLUMN_WIDTHS);
}

export function buildExportFilename(ids?: string[]): string {
  const date = new Date().toISOString().slice(0, 10);
  if (ids && ids.length > 0) {
    return `proxies-selected-${date}.xlsx`;
  }
  return `proxies-${date}.xlsx`;
}
