import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('source');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('niche.inUseTitle')}
      footer={
        <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose}>
          {t('niche.ok')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">
          {t('niche.inUseBody', { label: nicheLabel })}
        </p>
        {usage ? (
          <div className="space-y-3">
            <UsageGroup title={t('niche.usagePrompts')} items={usage.prompts} />
            <UsageGroup title={t('niche.usageSourceChannels')} items={usage.sourceChannels} />
            <UsageGroup title={t('niche.usageYoutubeChannels')} items={usage.youtubeChannels} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
