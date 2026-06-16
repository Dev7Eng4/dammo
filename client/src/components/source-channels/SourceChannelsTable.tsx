import { PlatformIcon } from '../mail-accounts/PlatformIcon';
import type { SourceChannel } from '../../types/sourceChannel';
import { PurposePill } from './PurposePill';
import { RiskPill } from './RiskPill';

interface SourceChannelsTableProps {
  sources: SourceChannel[];
  loading?: boolean;
  onSelect: (id: string) => void;
}

function truncateUrl(url: string, max = 14) {
  if (url.length <= max) return url;
  return url.slice(0, max) + '...';
}

export function SourceChannelsTable({
  sources,
  loading,
  onSelect,
}: SourceChannelsTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium w-12">PLAT</th>
              <th className="pb-3 pr-4 font-medium">SOURCE NAME</th>
              <th className="pb-3 pr-4 font-medium">URL (ID)</th>
              <th className="pb-3 pr-4 font-medium">NICHE</th>
              <th className="pb-3 pr-4 font-medium">PURPOSE</th>
              <th className="pb-3 font-medium">RISK</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={6} className="py-3">
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
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium w-12">PLAT</th>
            <th className="pb-3 pr-4 font-medium">SOURCE NAME</th>
            <th className="pb-3 pr-4 font-medium">URL (ID)</th>
            <th className="pb-3 pr-4 font-medium">NICHE</th>
            <th className="pb-3 pr-4 font-medium">PURPOSE</th>
            <th className="pb-3 font-medium">RISK</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
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
              <td className="py-3">
                <RiskPill risk={source.riskLevel} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
