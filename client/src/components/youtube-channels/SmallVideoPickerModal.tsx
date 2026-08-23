import { useEffect, useState } from 'react';
import { assetFileUrl, fetchAssets } from '../../api/assets';
import {
  fetchSmallVideoGroupMedia,
  fetchSmallVideoGroups,
  smallVideoGroupMediaUrl,
} from '../../api/small-video-groups';
import { fetchYoutubeChannels } from '../../api/youtubeChannels';
import type { AssetFileItem } from '../../types/asset';
import type { SmallVideoGroupListItem, SmallVideoGroupMediaItem } from '../../types/smallVideoGroup';
import {
  encodeSmallVideoGroupSelection,
  parseSmallVideoGroupId,
  SI_OVERLAY_AUTO_SENTINEL,
} from '../../types/youtubeChannel';
import { Button, Modal } from '../ui';

function buildSmallVideoChannelUsage(channels: { smallVideoFile?: string }[]): {
  groupUsage: Map<string, number>;
  ungroupedCount: number;
} {
  const groupUsage = new Map<string, number>();
  let ungroupedCount = 0;
  for (const channel of channels) {
    const value = channel.smallVideoFile?.trim() ?? '';
    if (!value) continue;
    const groupId = parseSmallVideoGroupId(value);
    if (groupId) {
      groupUsage.set(groupId, (groupUsage.get(groupId) ?? 0) + 1);
      continue;
    }
    // Specific ungrouped file or __auto__ (random from ungrouped)
    ungroupedCount += 1;
  }
  return { groupUsage, ungroupedCount };
}

interface SmallVideoPickerModalProps {
  open: boolean;
  onClose: () => void;
  selectedFile: string;
  onSelect: (filename: string) => void;
}

type ActiveTab = 'ungrouped' | string;

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z' />
      <circle cx='12' cy='12' r='3' />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M20 6 9 17l-5-5' />
    </svg>
  );
}

function tabButtonClass(active: boolean): string {
  return `rounded-lg border px-3 py-2 text-sm font-medium transition ${
    active
      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
      : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'
  }`;
}

export function SmallVideoPickerModal({ open, onClose, selectedFile, onSelect }: SmallVideoPickerModalProps) {
  const [items, setItems] = useState<AssetFileItem[]>([]);
  const [groups, setGroups] = useState<SmallVideoGroupListItem[]>([]);
  const [groupChannelUsage, setGroupChannelUsage] = useState<Map<string, number>>(() => new Map());
  const [ungroupedChannelCount, setUngroupedChannelCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('ungrouped');
  const [groupMedia, setGroupMedia] = useState<SmallVideoGroupMediaItem[]>([]);
  const [groupMediaLoading, setGroupMediaLoading] = useState(false);
  const [groupMediaError, setGroupMediaError] = useState<string | null>(null);

  const autoSelected = selectedFile === SI_OVERLAY_AUTO_SENTINEL;
  const selectedGroupId = parseSmallVideoGroupId(selectedFile);
  const isFolderTab = activeTab !== 'ungrouped';
  const activeGroup = isFolderTab ? groups.find(g => g.id === activeTab) : null;
  const folderHasVideos =
    isFolderTab && ((activeGroup?.mediaCount ?? 0) > 0 || groupMedia.length > 0);
  const canSelectGroup = folderHasVideos;
  const groupSelectedOnTab = isFolderTab && selectedGroupId === activeTab;

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null);
      setError(null);
      setGroupMedia([]);
      setGroupMediaError(null);
      return;
    }

    const initialTab = parseSmallVideoGroupId(selectedFile) ?? 'ungrouped';
    setActiveTab(initialTab);

    let cancelled = false;
    setLoading(true);
    setError(null);

    void Promise.all([
      fetchAssets('smallVideo'),
      fetchSmallVideoGroups(),
      fetchYoutubeChannels('all', 'all', '', 1, 100),
    ])
      .then(([assetData, groupData, channelsData]) => {
        if (!cancelled) {
          setItems(assetData.items);
          setGroups(groupData.items);
          const usage = buildSmallVideoChannelUsage(channelsData.items);
          setGroupChannelUsage(usage.groupUsage);
          setUngroupedChannelCount(usage.ungroupedCount);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setItems([]);
          setGroups([]);
          setGroupChannelUsage(new Map());
          setUngroupedChannelCount(0);
          setError(err instanceof Error ? err.message : 'Không thể tải danh sách video nhỏ');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Only re-init when modal opens; selectedFile is read once for initial tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional on open
  }, [open]);

  useEffect(() => {
    if (!open || activeTab === 'ungrouped') {
      setGroupMedia([]);
      setGroupMediaError(null);
      setGroupMediaLoading(false);
      return;
    }

    let cancelled = false;
    setGroupMedia([]);
    setGroupMediaLoading(true);
    setGroupMediaError(null);

    void fetchSmallVideoGroupMedia(activeTab)
      .then(data => {
        if (!cancelled) setGroupMedia(data.items);
      })
      .catch(err => {
        if (!cancelled) {
          setGroupMedia([]);
          setGroupMediaError(err instanceof Error ? err.message : 'Không thể tải video trong nhóm');
        }
      })
      .finally(() => {
        if (!cancelled) setGroupMediaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeTab]);

  function handleToggleSelect(filename: string) {
    onSelect(selectedFile === filename ? '' : filename);
  }

  function handleSelectAuto() {
    onSelect(autoSelected ? '' : SI_OVERLAY_AUTO_SENTINEL);
    if (!autoSelected) onClose();
  }

  function handleSelectGroup() {
    if (!isFolderTab || !canSelectGroup) return;
    const value = encodeSmallVideoGroupSelection(activeTab);
    if (selectedGroupId === activeTab) {
      onSelect('');
      return;
    }
    onSelect(value);
    onClose();
  }

  const showEmpty =
    !loading &&
    !error &&
    activeTab === 'ungrouped' &&
    items.length === 0 &&
    groups.length === 0;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title='Chọn video nhỏ'
        className='max-w-4xl'
        bodyClassName='min-h-[50vh] max-h-[75vh] overflow-y-auto'
        footer={
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <Button
              variant='outlined'
              size='sm'
              className={`rounded-lg ${
                autoSelected
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : ''
              }`}
              onClick={handleSelectAuto}
            >
              Tự động
            </Button>
            <Button
              variant='outlined'
              size='sm'
              className={`rounded-lg ${
                groupSelectedOnTab
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : ''
              }`}
              disabled={!canSelectGroup}
              title={
                !isFolderTab
                  ? 'Chọn tab folder rồi bấm Chọn nhóm'
                  : !canSelectGroup
                    ? 'Nhóm chưa có video'
                    : groupSelectedOnTab
                      ? 'Bỏ chọn nhóm'
                      : `Chọn cả nhóm "${activeGroup?.name ?? ''}" (random video mỗi lần)`
              }
              onClick={handleSelectGroup}
            >
              {groupSelectedOnTab ? 'Bỏ chọn nhóm' : 'Chọn nhóm'}
            </Button>
            <Button variant='outlined' size='sm' className='rounded-lg' onClick={onClose}>
              Đóng
            </Button>
          </div>
        }
      >
        <div className='space-y-4'>
          {error ? (
            <p className='rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300'>
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className='text-center text-xs text-neutral-500'>Đang tải danh sách video...</p>
          ) : (
            <div className='space-y-4'>
              <div className='flex flex-wrap items-center gap-2'>
                <button
                  type='button'
                  onClick={() => setActiveTab('ungrouped')}
                  title={`Không có nhóm — ${ungroupedChannelCount} kênh đang dùng`}
                  className={tabButtonClass(activeTab === 'ungrouped')}
                >
                  Không có nhóm ({ungroupedChannelCount})
                </button>
                {groups.map(group => {
                  const channelCount = groupChannelUsage.get(group.id) ?? 0;
                  return (
                    <button
                      key={group.id}
                      type='button'
                      title={`${group.name} — ${channelCount} kênh đang dùng`}
                      onClick={() => setActiveTab(group.id)}
                      className={`max-w-48 truncate ${tabButtonClass(activeTab === group.id)}`}
                    >
                      {group.name} ({channelCount})
                    </button>
                  );
                })}
              </div>

              {activeTab === 'ungrouped' ? (
                items.length > 0 ? (
                  <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
                    {items.map(item => {
                      const selected = selectedFile === item.name;
                      const src = assetFileUrl('smallVideo', item.name);
                      return (
                        <div
                          key={item.name}
                          className={`group relative aspect-square overflow-hidden rounded-lg border bg-neutral-950 transition ${
                            selected
                              ? 'border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                              : 'border-neutral-800 hover:border-neutral-600'
                          }`}
                        >
                          <video
                            src={src}
                            muted
                            playsInline
                            preload='metadata'
                            className='absolute inset-0 h-full w-full object-contain'
                          />
                          <div className='pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 bg-black/55 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'>
                            <button
                              type='button'
                              title='Xem'
                              className='rounded-full bg-neutral-900/90 p-1.5 text-neutral-100 hover:bg-neutral-800'
                              onClick={() => setPreviewUrl(src)}
                            >
                              <EyeIcon className='size-3.5' />
                            </button>
                            <button
                              type='button'
                              title={selected ? 'Bỏ chọn' : 'Chọn'}
                              className={`rounded-full p-1.5 text-white ${
                                selected
                                  ? 'bg-neutral-600/90 hover:bg-neutral-500'
                                  : 'bg-emerald-600/90 hover:bg-emerald-500'
                              }`}
                              onClick={() => handleToggleSelect(item.name)}
                            >
                              <CheckIcon className='size-3.5' />
                            </button>
                          </div>
                          {selected ? (
                            <span className='absolute right-1.5 top-1.5 rounded-full bg-emerald-500 p-0.5 text-white shadow'>
                              <CheckIcon className='size-2.5' />
                            </span>
                          ) : null}
                          <p className='absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-[10px] text-neutral-300'>
                            {item.name}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className='text-center text-xs text-neutral-500'>Chưa có video không thuộc nhóm</p>
                )
              ) : groupMediaLoading ? (
                <p className='text-center text-xs text-neutral-500'>Đang tải video trong nhóm...</p>
              ) : groupMediaError ? (
                <p className='rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300'>
                  {groupMediaError}
                </p>
              ) : groupMedia.length > 0 ? (
                <div className='space-y-3'>
                  <p className='text-xs text-neutral-400'>
                    {groupSelectedOnTab
                      ? `Đã chọn cả nhóm "${activeGroup?.name ?? ''}" — mỗi lần render sẽ random 1 video trong folder.`
                      : `Xem trước video trong folder. Bấm "Chọn nhóm" bên dưới để dùng cả folder (không chọn từng video).`}
                  </p>
                  <div className='grid grid-cols-3 gap-2 sm:grid-cols-4'>
                    {groupMedia.map(item => {
                      const src = smallVideoGroupMediaUrl(activeTab, item.name);
                      return (
                        <div
                          key={item.name}
                          className={`group relative aspect-square overflow-hidden rounded-lg border bg-neutral-950 transition ${
                            groupSelectedOnTab
                              ? 'border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                              : 'border-neutral-800 hover:border-neutral-600'
                          }`}
                        >
                          <video
                            src={src}
                            muted
                            playsInline
                            preload='metadata'
                            className='absolute inset-0 h-full w-full object-contain'
                          />
                          <div className='pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100'>
                            <button
                              type='button'
                              title='Xem trước'
                              className='rounded-full bg-neutral-900/90 p-1.5 text-neutral-100 hover:bg-neutral-800'
                              onClick={() => setPreviewUrl(src)}
                            >
                              <EyeIcon className='size-3.5' />
                            </button>
                          </div>
                          {groupSelectedOnTab ? (
                            <span className='absolute right-1.5 top-1.5 rounded-full bg-emerald-500 p-0.5 text-white shadow'>
                              <CheckIcon className='size-2.5' />
                            </span>
                          ) : null}
                          <p className='absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-[10px] text-neutral-300'>
                            {item.name}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className='text-center text-xs text-neutral-500'>Nhóm chưa có video</p>
              )}
            </div>
          )}

          {showEmpty ? (
            <p className='text-center text-xs text-neutral-500'>Chưa có video nhỏ trong assets</p>
          ) : null}
        </div>
      </Modal>

      {previewUrl ? (
        <div className='fixed inset-0 z-60 flex items-center justify-center p-4'>
          <button
            type='button'
            aria-label='Đóng xem video'
            className='absolute inset-0 bg-black/80'
            onClick={() => setPreviewUrl(null)}
          />
          <div className='relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-surface shadow-xl'>
            <video
              src={previewUrl}
              controls
              autoPlay
              playsInline
              className='max-h-[85vh] w-full bg-black object-contain'
            />
            <button
              type='button'
              className='absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-neutral-100 hover:bg-black'
              onClick={() => setPreviewUrl(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
