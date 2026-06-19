import { PlatformIcon } from '../mail-accounts/PlatformIcon';
import type { SourceChannel } from '../../types/sourceChannel';
import { PurposePill } from './PurposePill';
import { RiskPill } from './RiskPill';

interface SourceChannelsTableProps {
  sources: SourceChannel[];
  loading?: boolean;
  bumpingRiskId?: string | null;
  savingNotesId?: string | null;
  deletingId?: string | null;
  onSelect: (id: string) => void;
  onBumpRisk?: (id: string) => void;
  onNotesChange?: (id: string, notes: string) => void;
  onDelete?: (id: string) => void;
}

function truncateUrl(url: string, max = 14) {
  if (url.length <= max) return url;
  return url.slice(0, max) + '...';
}

const headerColumns = (
  <>
    <th className="pb-3 pr-4 font-medium w-12">PLAT</th>
    <th className="pb-3 pr-4 font-medium">SOURCE NAME</th>
    <th className="pb-3 pr-4 font-medium">URL (ID)</th>
    <th className="pb-3 pr-4 font-medium">NICHE</th>
    <th className="pb-3 pr-4 font-medium">PURPOSE</th>
    <th className="pb-3 pr-4 font-medium">RISK</th>
    <th className="pb-3 pr-4 font-medium">NOTES</th>
    <th className="pb-3 font-medium w-12 text-center">ACTIONS</th>
  </>
);

export function SourceChannelsTable({
  sources,
  loading,
  bumpingRiskId,
  savingNotesId,
  deletingId,
  onSelect,
  onBumpRisk,
  onNotesChange,
  onDelete,
}: SourceChannelsTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">{headerColumns}</tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={8} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No source channels match your filter.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">{headerColumns}</tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const isHighRisk = source.riskLevel === 'high';
            const isBumping = bumpingRiskId === source.id;
            const isSavingNotes = savingNotesId === source.id;
            const isDeleting = deletingId === source.id;

            return (
              <tr
                key={source.id}
                onClick={() => onSelect(source.id)}
                className="border-b border-border/50 cursor-pointer transition-colors hover:bg-surface-elevated/50"
              >
                <td className="py-3 pr-4">
                  <PlatformIcon platform={source.platform} className="text-neutral-400" />
                </td>
                <td className="py-3 pr-4 font-medium text-neutral-100">{source.name}</td>
                <td className="py-3 pr-4 font-mono text-xs text-neutral-500">
                  {truncateUrl(source.url)}
                </td>
                <td className="py-3 pr-4 text-neutral-300">{source.niche}</td>
                <td className="py-3 pr-4">
                  <PurposePill purpose={source.purpose} />
                </td>
                <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <RiskPill risk={source.riskLevel} />
                    {onBumpRisk ? (
                      <button
                        type="button"
                        title={isHighRisk ? 'Risk is already at maximum' : 'Increase risk level'}
                        disabled={isHighRisk || isBumping}
                        onClick={() => onBumpRisk(source.id)}
                        className="inline-flex size-6 items-center justify-center rounded border border-border text-neutral-400 transition-colors hover:bg-surface-elevated hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m18 15-6-6-6 6" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 min-w-[12rem]" onClick={(e) => e.stopPropagation()}>
                  {onNotesChange ? (
                    <input
                      key={`${source.id}-${source.notes ?? ''}`}
                      type="text"
                      defaultValue={source.notes ?? ''}
                      placeholder="Add note..."
                      disabled={isSavingNotes}
                      onBlur={(e) => onNotesChange(source.id, e.currentTarget.value)}
                      className="h-8 w-full min-w-[10rem] rounded-lg border border-border bg-surface-elevated px-2.5 text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-primary-500/50 disabled:opacity-60"
                    />
                  ) : (
                    <span className="text-xs text-neutral-400">{source.notes || '—'}</span>
                  )}
                </td>
                <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  {onDelete ? (
                    <button
                      type="button"
                      title="Delete source"
                      disabled={isDeleting}
                      onClick={() => onDelete(source.id)}
                      className="inline-flex size-7 items-center justify-center rounded border border-border text-neutral-400 transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
