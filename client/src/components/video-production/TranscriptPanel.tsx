import { useTranslation } from 'react-i18next';
import type { ProductionTranscriptCue } from '../../types/videoProductionScenes';

interface TranscriptPanelProps {
  cues: ProductionTranscriptCue[];
  loading: boolean;
  error: string | null;
  /** Drop the panel's own outer padding (when the host already pads the content). */
  flush?: boolean;
}

function formatClock(srt: string): string {
  const base = srt.replace(',', '.');
  const [hms] = base.split('.');
  return hms ?? srt;
}

export function TranscriptPanel({ cues, loading, error, flush = false }: TranscriptPanelProps) {
  const { t } = useTranslation('factory');
  const messagePadding = flush ? 'py-4' : 'px-4 py-6';

  if (loading) {
    return (
      <p className={`${messagePadding} text-sm text-muted-foreground`}>
        {t('production.transcript.loading')}
      </p>
    );
  }

  if (error) {
    return <p className={`${messagePadding} text-sm text-danger`}>{error}</p>;
  }

  if (cues.length === 0) {
    return (
      <p className={`${messagePadding} text-sm text-muted-foreground`}>
        {t('production.transcript.empty')}
      </p>
    );
  }

  return (
    <div className={flush ? '-mx-3 overflow-x-auto' : 'overflow-x-auto'}>
      <table className="w-full min-w-[480px] border-collapse text-left">
        <tbody className="divide-y divide-border">
          {cues.map((cue) => (
            <tr key={cue.index} className="align-top">
              <td className="w-44 px-3 py-3 text-sm text-muted-foreground">
                {formatClock(cue.startTime)} – {formatClock(cue.endTime)}
              </td>
              <td className="px-3 py-3">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {cue.text}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
