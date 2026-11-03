import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moveSmallVideo } from '../../api/small-video-groups';
import { Button, Modal, Select } from '../ui';
import type { SmallVideoGroupListItem } from '../../types/smallVideoGroup';

const UNGROUPED_VALUE = '';

export interface SmallVideoMoveTarget {
  name: string;
  /** `null` = ungrouped folder. */
  fromGroupId: string | null;
}

interface MoveSmallVideoModalProps {
  target: SmallVideoMoveTarget | null;
  groups: SmallVideoGroupListItem[];
  onClose: () => void;
  onSuccess: (fileName: string) => void;
}

export function MoveSmallVideoModal({ target, groups, onClose, onSuccess }: MoveSmallVideoModalProps) {
  const { t } = useTranslation(['content', 'common']);
  const [destination, setDestination] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const currentValue = target?.fromGroupId ?? UNGROUPED_VALUE;
  /** Every location except the one the video is already in. */
  const options = useMemo(
    () =>
      [
        { value: UNGROUPED_VALUE, label: t('assets.smallVideo.download.ungrouped') },
        ...groups.map((group) => ({ value: group.id, label: group.name })),
      ].filter((option) => option.value !== currentValue),
    [groups, currentValue, t],
  );

  // Preselect the first other location each time a video is picked.
  useEffect(() => {
    setDestination(options[0]?.value ?? null);
    setApiError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  function handleClose() {
    if (moving) return;
    onClose();
  }

  async function handleMove() {
    if (!target || destination === null) return;
    setMoving(true);
    setApiError(null);
    try {
      const { item } = await moveSmallVideo({
        name: target.name,
        fromGroupId: target.fromGroupId,
        toGroupId: destination === UNGROUPED_VALUE ? null : destination,
      });
      onSuccess(item.name);
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : t('assets.smallVideo.move.error'));
    } finally {
      setMoving(false);
    }
  }

  return (
    <Modal
      open={Boolean(target)}
      onClose={handleClose}
      title={t('assets.smallVideo.move.title')}
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={moving}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={moving || destination === null}
            onClick={() => void handleMove()}
          >
            {moving ? t('assets.smallVideo.move.moving') : t('assets.smallVideo.move.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="truncate text-sm text-neutral-300">{target?.name}</p>
        <div>
          <label htmlFor="small-video-move-target" className="mb-1.5 block text-xs font-medium text-neutral-400">
            {t('assets.smallVideo.move.to')}
          </label>
          <Select
            id="small-video-move-target"
            options={options}
            value={destination ?? ''}
            onChange={setDestination}
            placeholder={t('assets.smallVideo.move.placeholder')}
            searchable
            disabled={moving}
            className="w-full"
            triggerClassName="h-10 w-full min-w-0 rounded-lg px-3 py-0"
          />
        </div>
        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </div>
    </Modal>
  );
}
