import { Button, Modal } from '../ui';
import type { NicheUsage, NicheUsageItem } from '../../types/niche';

interface NicheInUseModalProps {
  open: boolean;
  nicheLabel: string;
  usage: NicheUsage | null;
  onClose: () => void;
}

function UsageGroup({ title, items }: { title: string; items: NicheUsageItem[] }) {
  if (!items.length) return null;

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm text-neutral-200">
            {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NicheInUseModal({ open, nicheLabel, usage, onClose }: NicheInUseModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Không thể xóa niche"
      footer={
        <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose}>
          OK
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">
          Niche &quot;{nicheLabel}&quot; đang được sử dụng ở:
        </p>
        {usage ? (
          <div className="space-y-3">
            <UsageGroup title="Prompt" items={usage.prompts} />
            <UsageGroup title="Source channel" items={usage.sourceChannels} />
            <UsageGroup title="YouTube channel" items={usage.youtubeChannels} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
