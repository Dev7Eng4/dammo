import { useEffect, useState } from 'react';
import { fetchProxies } from '../../api/proxies';
import type { Proxy } from '../../types/proxy';
import { Button, Modal } from '../ui';

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 5;
const EXPIRY_MODAL_MAX_ITEMS = 10;
/** Avoid double-open when AppLayout and ProxiesPage mount together. */
const DEDUPE_WINDOW_MS = 3000;

let lastModalOpenedAt = 0;

function getExpiryEndMs(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const end = new Date(`${expiresAt}T23:59:59.999`);
  const ms = end.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getExpiryWarningMeta(
  expiresAt: string | undefined,
  nowMs: number,
): null | { label: string; expireEndMs: number } {
  const expireEndMs = getExpiryEndMs(expiresAt);
  if (expireEndMs == null) return null;

  const isExpiring = expireEndMs <= nowMs + EXPIRY_WARNING_DAYS * DAY_MS;
  if (!isExpiring) return null;

  if (expireEndMs < nowMs) {
    return { label: 'Đã hết hạn', expireEndMs };
  }

  const daysLeft = Math.ceil((expireEndMs - nowMs) / DAY_MS);
  return { label: `Còn ${daysLeft} ngày`, expireEndMs };
}

interface ExpiringProxyItem {
  proxy: Proxy;
  label: string;
}

/** Shows once on mount when any proxy expires within 5 days (or already expired). */
export function ProxyExpiryWarningModal() {
  const [open, setOpen] = useState(false);
  const [expiringProxies, setExpiringProxies] = useState<ExpiringProxyItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function run() {
      try {
        const nowMs = Date.now();
        const expiring: Array<{ proxy: Proxy; expireEndMs: number; label: string }> = [];
        const pageLimit = 100;
        const first = await fetchProxies('all', '', 1, pageLimit, { signal: controller.signal });

        for (const proxy of first.items) {
          const meta = getExpiryWarningMeta(proxy.expiresAt, nowMs);
          if (meta) expiring.push({ proxy, expireEndMs: meta.expireEndMs, label: meta.label });
        }

        for (let page = 2; page <= first.totalPages; page++) {
          const res = await fetchProxies('all', '', page, pageLimit, { signal: controller.signal });
          for (const proxy of res.items) {
            const meta = getExpiryWarningMeta(proxy.expiresAt, nowMs);
            if (meta) expiring.push({ proxy, expireEndMs: meta.expireEndMs, label: meta.label });
          }
        }

        if (cancelled || expiring.length === 0) return;
        if (Date.now() - lastModalOpenedAt < DEDUPE_WINDOW_MS) return;

        expiring.sort((a, b) => a.expireEndMs - b.expireEndMs);
        lastModalOpenedAt = Date.now();
        setExpiringProxies(expiring.map(({ proxy, label }) => ({ proxy, label })));
        setOpen(true);
      } catch {
        // Ignore abort/cancel errors; don't block the page due to warning.
      }
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title='Proxy sắp hết hạn (<= 5 ngày)'
      footer={
        <Button size='sm' className='rounded-lg' onClick={() => setOpen(false)}>
          Đã hiểu
        </Button>
      }
    >
      {expiringProxies.length > 0 ? (
        <div className='space-y-4'>
          <p className='text-sm text-neutral-300'>
            Có <span className='font-mono text-neutral-100'>{expiringProxies.length}</span> proxy sắp hết hạn hoặc đã hết hạn. Vui lòng
            kiểm tra và gia hạn trước khi hết hạn.
          </p>
          <div className='space-y-2'>
            {expiringProxies.slice(0, EXPIRY_MODAL_MAX_ITEMS).map(({ proxy, label }) => (
              <div key={proxy.id} className='flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2'>
                <span className='font-mono text-xs text-neutral-300'>
                  {proxy.host}:{proxy.port}
                </span>
                <span className='text-xs text-neutral-500'>
                  {proxy.expiresAt ? `HẾT HẠN ${proxy.expiresAt}` : 'Không có hạn'} · {label}
                </span>
              </div>
            ))}
          </div>
          {expiringProxies.length > EXPIRY_MODAL_MAX_ITEMS ? (
            <p className='text-xs text-neutral-500'>Hiển thị {EXPIRY_MODAL_MAX_ITEMS} proxy đầu tiên.</p>
          ) : null}
        </div>
      ) : (
        <p className='text-sm text-neutral-300'>Không có proxy sắp hết hạn.</p>
      )}
    </Modal>
  );
}
