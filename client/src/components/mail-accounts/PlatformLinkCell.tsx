import { cn } from '../../lib/cn';

interface PlatformLinkCellProps {
  linked: boolean;
  className?: string;
}

export function PlatformLinkCell({ linked, className }: PlatformLinkCellProps) {
  if (!linked) {
    return <span className={cn('text-neutral-500', className)}>—</span>;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        'bg-success/10 border-success/30 text-success',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-success" />
      Active
    </span>
  );
}
