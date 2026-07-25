import { getPublishTimeSlotCount } from '../youtube-channels/upload-schedule.js';
import type { UploadFrequency, YoutubeChannel } from '../youtube-channels/youtube-channels.types.js';

export interface PublishScheduleSlot {
  date: string;
  time: string;
  iso: string;
}

interface PublishPlanSettings {
  uploadFrequency: UploadFrequency;
  publishTimes: string[];
  spacingDays: number;
  videosPerDay: number;
}

function parseHHmm(raw: string): { h: number; m: number } | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const parts = s.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function wallClockToHHmm(t: { h: number; m: number }): string {
  return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`;
}

function normalizePublishTimes(publishTimes: string[], slotCount: number): string[] {
  const arr = publishTimes.map(t => String(t ?? '').trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    const p = parseHHmm(arr[i] ?? '');
    out.push(p ? wallClockToHHmm(p) : '09:00');
  }
  return out;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function addLocalDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function diffLocalCalendarDays(a: Date, b: Date): number {
  const t0 = startOfLocalDay(a).getTime();
  const t1 = startOfLocalDay(b).getTime();
  return Math.round((t1 - t0) / 86_400_000);
}

function toMmDdYyyy(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${mm}/${dd}/${yyyy}`;
}

function resolvePlanSettings(channel: YoutubeChannel): PublishPlanSettings {
  const uploadFrequency = channel.uploadFrequency ?? 'daily_1';
  const slotCount = getPublishTimeSlotCount(uploadFrequency);
  const publishTimes = normalizePublishTimes(channel.uploadSchedule ?? [], slotCount);

  switch (uploadFrequency) {
    case 'every_5_days':
      return { uploadFrequency, publishTimes, spacingDays: 5, videosPerDay: 1 };
    case 'every_3_days':
      return { uploadFrequency, publishTimes, spacingDays: 3, videosPerDay: 1 };
    case 'every_2_days':
      return { uploadFrequency, publishTimes, spacingDays: 2, videosPerDay: 1 };
    case 'daily_2':
      return { uploadFrequency, publishTimes, spacingDays: 0, videosPerDay: 2 };
    case 'daily_3':
      return { uploadFrequency, publishTimes, spacingDays: 0, videosPerDay: 3 };
    case 'daily_1':
    default:
      return { uploadFrequency, publishTimes, spacingDays: 0, videosPerDay: 1 };
  }
}

function scheduleCursorFromChannel(channel: YoutubeChannel): Date {
  const now = new Date();
  if (!channel.lastUploadAt) return now;

  const ref = new Date(channel.lastUploadAt);
  if (!Number.isFinite(ref.getTime())) return now;
  return ref.getTime() > now.getTime() ? ref : now;
}

function slotTimesForCalendarDay(calendarDay: Date, videosPerDay: number, timesHHmm: string[]): Date[] {
  const dayStart = startOfLocalDay(calendarDay);
  const y = dayStart.getFullYear();
  const mo = dayStart.getMonth();
  const da = dayStart.getDate();

  const slots: Date[] = [];
  for (let i = 0; i < videosPerDay; i += 1) {
    const p = parseHHmm(timesHHmm[i] ?? '09:00');
    if (!p) continue;
    slots.push(new Date(y, mo, da, p.h, p.m, 0, 0));
  }

  slots.sort((a, b) => a.getTime() - b.getTime());
  return slots;
}

function nextPublishAfter(cursor: Date, videosPerDay: number, timesHHmm: string[]): Date {
  let day = startOfLocalDay(cursor);
  for (let guard = 0; guard < 800; guard += 1) {
    const slots = slotTimesForCalendarDay(day, videosPerDay, timesHHmm);
    for (const when of slots) {
      if (when.getTime() > cursor.getTime()) return when;
    }
    day = addLocalDays(day, 1);
  }
  throw new Error('Could not find publish slot within ~800 days.');
}

function nextPublishOnCalendarInterval(
  lastPublishRef: Date,
  spacingDays: number,
  timesHHmm: string[],
  notBefore: Date,
): Date {
  const slot = parseHHmm(timesHHmm[0] ?? '09:00');
  const sh = slot ? slot.h : 9;
  const sm = slot ? slot.m : 0;
  const refDay = startOfLocalDay(lastPublishRef);
  let probeDay = addLocalDays(refDay, spacingDays);

  for (let guard = 0; guard < 800; guard += 1) {
    const y = probeDay.getFullYear();
    const mo = probeDay.getMonth();
    const da = probeDay.getDate();
    const candidate = new Date(y, mo, da, sh, sm, 0, 0);
    const gap = diffLocalCalendarDays(refDay, probeDay);
    if (gap >= spacingDays && candidate.getTime() > notBefore.getTime()) {
      return candidate;
    }
    probeDay = addLocalDays(probeDay, spacingDays);
  }

  throw new Error('Could not find interval publish slot within ~800 steps.');
}

export function getYoutubePublishPlan(channel: YoutubeChannel, uploadCount: number): {
  settings: PublishPlanSettings;
  schedule: PublishScheduleSlot[];
} {
  const n = Number(uploadCount);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error('uploadCount must be a non-negative integer.');
  }

  const settings = resolvePlanSettings(channel);
  const schedule: PublishScheduleSlot[] = [];
  if (n === 0) return { settings, schedule };

  let cursor = scheduleCursorFromChannel(channel);
  const spacing = settings.spacingDays;
  let intervalRef: Date | null = channel.lastUploadAt ? new Date(channel.lastUploadAt) : null;
  if (intervalRef && !Number.isFinite(intervalRef.getTime())) {
    intervalRef = null;
  }

  for (let i = 0; i < n; i += 1) {
    let when: Date;
    if (spacing > 0) {
      if (i === 0 && !intervalRef) {
        when = nextPublishAfter(cursor, 1, settings.publishTimes);
      } else {
        const refAnchor = intervalRef ?? cursor;
        when = nextPublishOnCalendarInterval(refAnchor, spacing, settings.publishTimes, cursor);
      }
    } else {
      when = nextPublishAfter(cursor, settings.videosPerDay, settings.publishTimes);
    }

    intervalRef = when;
    const hh = when.getHours();
    const mm = when.getMinutes();
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    schedule.push({
      date: toMmDdYyyy(when),
      time,
      iso: when.toISOString(),
    });
    cursor = when;
  }

  return { settings, schedule };
}

export function getNextYoutubePublishSlot(channel: YoutubeChannel): PublishScheduleSlot | null {
  return getYoutubePublishPlan(channel, 1).schedule[0] ?? null;
}

export function scheduleSlotToUnixMs(slot: PublishScheduleSlot | null | undefined): number {
  if (!slot) return Number.MAX_SAFE_INTEGER;
  const iso = String(slot.iso ?? '').trim();
  if (iso) {
    const t = new Date(iso).getTime();
    if (Number.isFinite(t)) return t;
  }
  const m = String(slot.date ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const tm = parseHHmm(slot.time ?? '');
  if (!m || !tm) return Number.MAX_SAFE_INTEGER;
  const mo = parseInt(m[1], 10);
  const d = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  return new Date(y, mo - 1, d, tm.h, tm.m, 0, 0).getTime();
}
