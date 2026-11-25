import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import {
  checkYoutubeApiKey,
  deleteYoutubeApiKey,
  fetchYoutubeApiKeyStatus,
  testYoutubeApiKey,
  type YoutubeApiKeyStatus,
  type YoutubeApiKeyTestResult,
} from '../../api/youtubeChannels';
import { useAbortableEffect } from '../../hooks';
import { Button, Input, StatusBadge } from '../ui';
import { appLocale } from '../../utils/locale';

interface YoutubeApiKeyFieldProps {
  /** Set when editing an existing channel: shows its saved key and lets it be checked / removed. */
  channelId?: string;
  /** Channel URL / @handle typed in the form, so "Test" can look the channel up. */
  channelUrl: string;
  /** New key typed by the user; the modal saves it after the channel is created / updated. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const STATUS_TONE = { ok: 'success', quota_exceeded: 'warning', invalid: 'danger', error: 'danger' } as const;

function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString(appLocale());
}

/**
 * YouTube Data API v3 key of one channel: lets the app read public channel / video numbers
 * (views, likes, comments, subs) that the "Chỉ số kênh" brain analyses.
 */
export function YoutubeApiKeyField({ channelId, channelUrl, value, onChange, disabled }: YoutubeApiKeyFieldProps) {
  const { t } = useTranslation('youtube');
  const [saved, setSaved] = useState<YoutubeApiKeyStatus | null>(null);
  const [busy, setBusy] = useState<'test' | 'check' | 'delete' | null>(null);
  const [testResult, setTestResult] = useState<YoutubeApiKeyTestResult | null>(null);

  useAbortableEffect(
    async (signal) => {
      if (!channelId) return;
      try {
        const { item } = await fetchYoutubeApiKeyStatus(channelId, { signal });
        if (!signal.aborted) setSaved(item);
      } catch {
        // No status → the field still works for entering a new key.
      }
    },
    [channelId],
  );

  async function run(kind: 'test' | 'check' | 'delete', action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  function handleTest() {
    void run('test', async () => {
      setTestResult(await testYoutubeApiKey({ apiKey: value.trim(), channelUrl: channelUrl.trim() || undefined }));
    });
  }

  function handleCheckSaved() {
    if (!channelId) return;
    void run('check', async () => {
      setTestResult(null);
      setSaved((await checkYoutubeApiKey(channelId)).item);
    });
  }

  function handleDelete() {
    if (!channelId || !window.confirm(t('form.youtubeApi.confirmDelete'))) return;
    void run('delete', async () => {
      setTestResult(null);
      setSaved((await deleteYoutubeApiKey(channelId)).item);
    });
  }

  const trimmed = value.trim();

  return (
    <div className='space-y-2'>
      {saved?.configured ? (
        <div className='flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-elevated/50 px-3 py-2'>
          <KeyRound className='size-4 text-muted-foreground' />
          <code className='rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground'>{saved.maskedKey}</code>
          {saved.status ? (
            <StatusBadge label={t(`form.youtubeApi.status.${saved.status}`)} tone={STATUS_TONE[saved.status]} withDot />
          ) : null}
          {saved.channelTitle ? <span className='truncate text-xs text-foreground/80'>{saved.channelTitle}</span> : null}
          <span className='ml-auto flex items-center gap-1'>
            <Button size='sm' variant='ghost' onClick={handleCheckSaved} disabled={disabled || busy !== null} title={t('form.youtubeApi.check')}>
              {busy === 'check' ? <Loader2 className='size-4 animate-spin' /> : <RefreshCw className='size-4' />}
            </Button>
            <Button size='sm' variant='ghost' onClick={handleDelete} disabled={disabled || busy !== null} title={t('form.youtubeApi.delete')}>
              <Trash2 className='size-4 text-danger' />
            </Button>
          </span>
          {saved.status && saved.status !== 'ok' && saved.statusMessage ? (
            <p className='w-full text-[11px] text-danger'>{saved.statusMessage}</p>
          ) : null}
        </div>
      ) : null}

      <div className='flex gap-2'>
        <Input
          id='youtube-api-key'
          // Plain text masked with CSS, not type=password: a password field makes browsers autofill
          // a saved login into the field before it (the channel URL).
          type='text'
          autoComplete='off'
          data-1p-ignore
          data-lpignore='true'
          spellCheck={false}
          style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties}
          placeholder={saved?.configured ? t('form.youtubeApi.replacePlaceholder') : t('form.youtubeApi.placeholder')}
          className='h-10 min-w-0 flex-1 rounded-lg font-mono text-sm'
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            setTestResult(null);
          }}
        />
        <Button variant='outlined' className='shrink-0 whitespace-nowrap' onClick={handleTest} disabled={disabled || busy !== null || trimmed.length < 20}>
          {busy === 'test' ? <Loader2 className='size-4 animate-spin' /> : null}
          {t('form.youtubeApi.test')}
        </Button>
      </div>

      {testResult ? (
        testResult.ok ? (
          <div className='flex items-start gap-1.5 text-xs text-success'>
            <CheckCircle2 className='mt-0.5 size-3.5 shrink-0' />
            <span>
              {testResult.channel
                ? t('form.youtubeApi.okChannel', {
                    title: testResult.channel.title,
                    subs: formatCount(testResult.channel.subscriberCount),
                    views: formatCount(testResult.channel.viewCount),
                    videos: formatCount(testResult.channel.videoCount),
                  })
                : t('form.youtubeApi.okKey')}
              {testResult.error ? <span className='block text-warning'>{testResult.error}</span> : null}
            </span>
          </div>
        ) : (
          <div className='flex items-start gap-1.5 text-xs text-danger'>
            <XCircle className='mt-0.5 size-3.5 shrink-0' />
            <span className='break-words'>{testResult.error}</span>
          </div>
        )
      ) : null}

      <p className='text-[11px] text-muted-foreground'>{t('form.youtubeApi.hint')}</p>
    </div>
  );
}
