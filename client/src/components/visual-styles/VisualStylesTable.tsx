import { Button } from '../ui';
import type { VisualStyle } from '../../types/visualStyle';

interface VisualStylesTableProps {
  styles: VisualStyle[];
  loading?: boolean;
  onEdit: (style: VisualStyle) => void;
  onDelete: (style: VisualStyle) => void;
}

function truncateRule(rule: string, maxLength = 80): string {
  const normalized = rule.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export function VisualStylesTable({
  styles,
  loading,
  onEdit,
  onDelete,
}: VisualStylesTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">NAME</th>
              <th className="pb-3 pr-4 font-medium">NICHE</th>
              <th className="pb-3 pr-4 font-medium">RULE</th>
              <th className="pb-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={4} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (styles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">Chưa có visual style nào.</p>
        <p className="mt-1 text-xs text-neutral-500">
          Thêm style đầu tiên (anime, chibi, cinematic, ...) để bắt đầu.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">NAME</th>
            <th className="pb-3 pr-4 font-medium">NICHE</th>
            <th className="pb-3 pr-4 font-medium">RULE</th>
            <th className="pb-3 font-medium">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {styles.map((style) => (
            <tr key={style.id} className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-neutral-100">{style.name}</td>
              <td className="py-3 pr-4 text-neutral-300">{style.niche}</td>
              <td className="py-3 pr-4 text-neutral-400" title={style.rule}>
                {truncateRule(style.rule)}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onEdit(style)}>
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    size="sm"
                    className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
                    onClick={() => onDelete(style)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
