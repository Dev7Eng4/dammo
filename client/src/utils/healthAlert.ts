import i18n from '../i18n';
import type { HealthAlert } from '../types/dashboard';
import { appLocale } from './locale';

type AlertText = Pick<HealthAlert, 'title' | 'description'>;

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(`dashboard:health.${key}`, options);

/** Server times look like `10:20:30 21/11/2026` (vi-VN); anything else is shown as is. */
function localizeServerTime(text: string): string {
  const match = /(\d{1,2}):(\d{2}):(\d{2}) (\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!match) return text.replace(/^[^:]*:\s*/, '').replace(/\.$/, '');
  const [hour, minute, second, day, month, year] = match.slice(1).map(Number);
  return new Date(year, month - 1, day, hour, minute, second).toLocaleString(appLocale());
}

function firstMatch(pattern: RegExp, text: string): string | undefined {
  return pattern.exec(text)?.[1];
}

/** The server writes alerts in one language, so rebuild the known ones from their id and numbers. */
export function localizeHealthAlert(alert: HealthAlert): AlertText {
  if (alert.id === 'youtube-paused') {
    const count = firstMatch(/\((\d+)\)/, alert.title);
    if (count) return { title: tr('paused.title', { count: Number(count) }), description: tr('paused.description') };
  }

  if (alert.id.startsWith('youtube-stale-')) {
    const match = /^(.*) — (\d+) (ngày|giờ) /.exec(alert.title);
    if (match) {
      const [, name, value, unit] = match;
      return {
        title: tr(unit === 'ngày' ? 'stale.titleDays' : 'stale.titleHours', { name, value }),
        description: tr('stale.description', { time: localizeServerTime(alert.description) }),
      };
    }
  }

  if (alert.id === 'system-ram' || alert.id === 'system-disk') {
    const key = alert.id === 'system-ram' ? 'ram' : 'disk';
    const free = firstMatch(/([\d.]+ GB)/, alert.title);
    const total = firstMatch(/([\d.]+ GB)/, alert.description);
    if (free && total) {
      return { title: tr(`${key}.title`, { size: free }), description: tr(`${key}.description`, { size: total }) };
    }
  }

  if (alert.id === 'system-queue-failed' || alert.id === 'system-queue-paused') {
    const key = alert.id === 'system-queue-failed' ? 'queueFailed' : 'queuePaused';
    const count = firstMatch(/(\d+)/, alert.title);
    if (count) return { title: tr(`${key}.title`, { count: Number(count) }), description: tr(`${key}.description`) };
  }

  return { title: alert.title, description: alert.description };
}
