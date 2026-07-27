import { Button, Modal } from '../ui';
import type { SourceChannel, SourceChannelUsage, SourceUsagePlatform } from '../../types/sourceChannel';

const PLATFORM_LABELS: Record<SourceUsagePlatform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
};

const PLATFORM_ORDER: SourceUsagePlatform[] = ['youtube', 'tiktok', 'facebook'];

function UsageChannelsList({ usage }: { usage: SourceChannelUsage }) {
  return (
    <>
      {PLATFORM_ORDER.map((platform) => {
        const channels = usage.channels[platform];
        if (!channels.length) return null;

        return (
          <div key={platform}>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {PLATFORM_LABELS[platform]}
            </p>
            <ul className="mt-1.5 space-y-1">
              {channels.map((channel) => (
                <li key={channel.id} className="text-sm text-neutral-200">
                  {channel.name}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export interface DeleteSourceChannelModalProps {
  open: boolean;
  sources: SourceChannel[];
  usages: SourceChannelUsage[];
  deleting?: boolean;
  onClose: () => void;
  onConfirmDelete?: () => void;
}

export function DeleteSourceChannelModal({
  open,
  sources,
  usages,
  deleting = false,
  onClose,
  onConfirmDelete,
}: DeleteSourceChannelModalProps) {
  const blockedEntries = sources
    .map((source, index) => ({ source, usage: usages[index] }))
    .filter((entry): entry is { source: SourceChannel; usage: SourceChannelUsage } =>
      Boolean(entry.usage?.inUse),
    );
  const blocked = blockedEntries.length > 0;
  const isBulk = sources.length > 1;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (deleting) return;
        onClose();
      }}
      title={blocked ? 'Không thể xóa nguồn' : isBulk ? 'Xóa kênh nguồn' : 'Xóa kênh nguồn'}
      footer={
        blocked ? (
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose}>
            Đóng
          </Button>
        ) : (
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={onClose}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="rounded-lg"
              onClick={onConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Đang xóa…' : 'Xóa'}
            </Button>
          </>
        )
      }
    >
      {blocked ? (
        <div className="space-y-4">
          {isBulk ? (
            <p className="text-sm text-neutral-300">
              Một hoặc nhiều nguồn đang được sử dụng. Không nguồn nào được xóa.
            </p>
          ) : null}

          {blockedEntries.map(({ source, usage }) => (
            <div key={source.id} className="space-y-3 rounded-lg border border-border/60 p-3">
              <p className="text-sm text-neutral-300">
                Nguồn &quot;{source.name}&quot; đang được sử dụng bởi các kênh sau:
              </p>
              <UsageChannelsList usage={usage} />
            </div>
          ))}
        </div>
      ) : isBulk ? (
        <p className="text-sm text-neutral-300">
          Xóa {sources.length} kênh nguồn? Hành động này không thể hoàn tác.
        </p>
      ) : (
        <p className="text-sm text-neutral-300">
          Xóa nguồn &quot;{sources[0]?.name ?? ''}&quot;? Hành động này không thể hoàn tác.
        </p>
      )}
    </Modal>
  );
}
