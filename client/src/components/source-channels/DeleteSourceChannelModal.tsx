import { Button, Modal } from '../ui';
import type { SourceChannelUsage, SourceUsagePlatform } from '../../types/sourceChannel';

const PLATFORM_LABELS: Record<SourceUsagePlatform, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
};

const PLATFORM_ORDER: SourceUsagePlatform[] = ['youtube', 'tiktok', 'facebook'];

export interface DeleteSourceChannelModalProps {
  open: boolean;
  sourceName: string;
  usage: SourceChannelUsage | null;
  deleting?: boolean;
  onClose: () => void;
  onConfirmDelete?: () => void;
}

export function DeleteSourceChannelModal({
  open,
  sourceName,
  usage,
  deleting = false,
  onClose,
  onConfirmDelete,
}: DeleteSourceChannelModalProps) {
  const blocked = usage?.inUse ?? false;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (deleting) return;
        onClose();
      }}
      title={blocked ? 'Không thể xóa source' : 'Xóa source channel'}
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
      {blocked && usage ? (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">
            Source &quot;{sourceName}&quot; đang được sử dụng bởi các kênh sau và không thể xóa.
          </p>
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
        </div>
      ) : (
        <p className="text-sm text-neutral-300">
          Xóa source &quot;{sourceName}&quot;? Hành động này không thể hoàn tác.
        </p>
      )}
    </Modal>
  );
}
