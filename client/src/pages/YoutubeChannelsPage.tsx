import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { startGpmProfileByEmail } from '../api/gpm';
import { fetchNiches } from '../api/niches';
import { fetchSourceChannels } from '../api/sourceChannels';
import { fetchYoutubeChannels, deleteAllUploadedVideos, deleteYoutubeChannel, pauseYoutubeChannel, resumeYoutubeChannel } from '../api/youtubeChannels';
import { PageHeader, PageShell } from '../components/layout';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { CreateVideoCountModal } from '../components/youtube-channels/CreateVideoCountModal';
import { DeleteUploadedVideosConfirmModal } from '../components/youtube-channels/DeleteUploadedVideosConfirmModal';
import { DeleteYoutubeChannelConfirmModal } from '../components/youtube-channels/DeleteYoutubeChannelConfirmModal';
import { PauseYoutubeChannelConfirmModal } from '../components/youtube-channels/PauseYoutubeChannelConfirmModal';
import { YoutubeChannelsTable } from '../components/youtube-channels/YoutubeChannelsTable';
import { YoutubeChannelsToolbar } from '../components/youtube-channels/YoutubeChannelsToolbar';
import { useToast } from '../components/ui';
import { useAbortableEffect, useDebouncedValue, usePaginatedList, useTaskQueue } from '../hooks';
import { Clapperboard } from 'lucide-react';
import type { Niche } from '../types/niche';
import type { YoutubeChannel, YoutubeChannelTypeFilter, YoutubeMonetizationFilter } from '../types/youtubeChannel';
import type { SourceChannel } from '../types/sourceChannel';
import { isStoredReupChannelType } from '../types/youtubeChannel';

const SEARCH_DEBOUNCE_MS = 300;

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'default';
}

export function YoutubeChannelsPage() {
  const { t, i18n } = useTranslation('youtube');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { enqueueTask } = useTaskQueue();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<YoutubeChannelTypeFilter>('all');
  const [monetizationFilter, setMonetizationFilter] = useState<YoutubeMonetizationFilter>('all');
  const [search, setSearch] = useState('');
  const [channelsRefreshKey, setChannelsRefreshKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [videoCountAction, setVideoCountAction] = useState<'create' | 'prepare' | null>(null);
  const [showUploadCountModal, setShowUploadCountModal] = useState(false);
  const [showDeleteUploadedModal, setShowDeleteUploadedModal] = useState(false);
  const [showDeleteChannelModal, setShowDeleteChannelModal] = useState(false);
  const [showPauseChannelModal, setShowPauseChannelModal] = useState(false);
  const [deletingUploadedVideos, setDeletingUploadedVideos] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(null);
  const [pausingChannelId, setPausingChannelId] = useState<string | null>(null);
  const [resumingChannelId, setResumingChannelId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<YoutubeChannel | null>(null);
  const [deletingChannelTarget, setDeletingChannelTarget] = useState<YoutubeChannel | null>(null);
  const [pausingChannelTarget, setPausingChannelTarget] = useState<YoutubeChannel | null>(null);
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [openingProfileIds, setOpeningProfileIds] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(20);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const paginationLocale = i18n.language === 'vi' ? 'vi' : 'en';

  const list = usePaginatedList({
    fetcher: ({ type, monetization, query, page, limit: pageLimit, signal }) =>
      fetchYoutubeChannels(type, monetization, query, page, pageLimit, { signal }),
    query: {
      type: typeFilter,
      monetization: monetizationFilter,
      query: debouncedSearch,
    },
    limit,
    refreshKey: channelsRefreshKey,
  });

  const selectedChannels = list.items.filter(channel => selectedIds.has(channel.id));
  const selectedChannel = selectedIds.size === 1 ? selectedChannels[0] ?? null : null;
  const isBulkCreate = selectedIds.size === 0;
  const allSelectedAreReup = selectedChannels.length > 0 && selectedChannels.every(channel => isStoredReupChannelType(channel.type));
  const canCreateVideo =
    isBulkCreate ||
    (selectedIds.size === 1 && selectedChannel !== null && isStoredReupChannelType(selectedChannel.type)) ||
    (selectedIds.size > 1 && allSelectedAreReup);
  const canUpload = canCreateVideo;
  const createVideoDisabledReason =
    selectedIds.size > 1 && !allSelectedAreReup
      ? t('hint.createSelectedNeedReup')
      : selectedIds.size === 1 && selectedChannel && !isStoredReupChannelType(selectedChannel.type)
        ? t('hint.createNeedReup')
        : isBulkCreate
          ? t('hint.createAll')
          : selectedIds.size > 1
            ? t('hint.createSelected', { count: selectedIds.size })
            : undefined;
  const uploadDisabledReason =
    selectedIds.size > 1 && !allSelectedAreReup
      ? t('hint.uploadSelectedNeedReup')
      : selectedIds.size === 1 && selectedChannel && !isStoredReupChannelType(selectedChannel.type)
        ? t('hint.uploadNeedReup')
        : isBulkCreate
          ? t('hint.uploadAll')
          : selectedIds.size > 1
            ? t('hint.uploadSelected', { count: selectedIds.size })
            : undefined;

  useAbortableEffect(
    async signal => {
      try {
        const data = await fetchSourceChannels('all', 'all', 'all', 1, 100, { signal });
        setSources(data.items);
      } catch {
        if (signal.aborted) return;
        setSources([]);
      }
    },
    [channelsRefreshKey]
  );

  useAbortableEffect(async signal => {
    try {
      const data = await fetchNiches({ signal });
      setNiches(data.items);
    } catch {
      if (signal.aborted) return;
      setNiches([]);
    }
  }, [channelsRefreshKey]);

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleTypeFilterChange(next: YoutubeChannelTypeFilter) {
    list.markLoading();
    setTypeFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleMonetizationFilterChange(next: YoutubeMonetizationFilter) {
    list.markLoading();
    setMonetizationFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleSearchChange(value: string) {
    list.markLoading();
    setSearch(typeof value === 'string' ? value : '');
    list.resetPage();
    clearSelection();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
    clearSelection();
  }

  function handleLimitChange(nextLimit: number) {
    list.markLoading();
    setLimit(nextLimit);
    list.setPage(1);
    clearSelection();
  }

  function handleSelect(id: string) {
    navigate(`/youtube-channels/${id}`);
  }

  function handleToggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedIds.size === list.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.items.map(c => c.id)));
    }
  }

  function handleAddSuccess() {
    setShowAddModal(false);
    list.markLoading();
    list.resetPage();
    setChannelsRefreshKey(key => key + 1);
  }

  function handleEditSuccess(_updated?: YoutubeChannel) {
    setShowEditModal(false);
    setEditingChannel(null);
    list.markLoading();
    setChannelsRefreshKey(key => key + 1);
  }

  function handleEditChannel(channel: YoutubeChannel) {
    setEditingChannel(channel);
    setShowEditModal(true);
  }

  function handleDeleteChannel(channel: YoutubeChannel) {
    setDeletingChannelTarget(channel);
    setShowDeleteChannelModal(true);
  }

  function handlePauseChannel(channel: YoutubeChannel) {
    setPausingChannelTarget(channel);
    setShowPauseChannelModal(true);
  }

  function handleVideoCountConfirm(count: number) {
    const isPrepare = videoCountAction === 'prepare';
    setVideoCountAction(null);

    if (selectedIds.size === 0) {
      void enqueueTask({
        type: 'create_video',
        title: isPrepare ? t('job.prepareAll') : t('job.createAll'),
        subtitle: t('job.bulkSubtitle', { count }),
        payload: {
          allReupChannels: true,
          videoCount: count,
          ...(isPrepare ? { prepareOnly: true } : {}),
        },
      });
      return;
    }

    if (selectedIds.size > 1) {
      if (!allSelectedAreReup) return;

      void enqueueTask({
        type: 'create_video',
        title: isPrepare
          ? t('job.prepareSelected', { count: selectedIds.size })
          : t('job.createSelected', { count: selectedIds.size }),
        subtitle: t('job.selectedSubtitle', { count: selectedIds.size, videos: count }),
        payload: {
          channelIds: Array.from(selectedIds),
          videoCount: count,
          ...(isPrepare ? { prepareOnly: true } : {}),
        },
      });
      return;
    }

    if (!selectedChannel) return;
    if (!isStoredReupChannelType(selectedChannel.type)) return;

    void enqueueTask({
      type: 'create_video',
      title: isPrepare
        ? t('job.prepareOne', { name: selectedChannel.name })
        : t('job.createOne', { name: selectedChannel.name }),
      subtitle: t('job.createOneSubtitle', { handle: selectedChannel.handle, count }),
      payload: {
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        channelHandle: selectedChannel.handle,
        videoCount: count,
        ...(isPrepare ? { prepareOnly: true } : {}),
      },
    });
  }

  function handleUpload(count: number) {
    setShowUploadCountModal(false);

    if (selectedIds.size === 0) {
      void enqueueTask({
        type: 'upload_video',
        title: t('job.uploadAll'),
        subtitle: t('job.uploadAllSubtitle', { count }),
        payload: { allReupChannels: true, maxUploads: count },
      });
      return;
    }

    if (selectedIds.size > 1) {
      if (!allSelectedAreReup) return;

      void enqueueTask({
        type: 'upload_video',
        title: t('job.uploadSelected', { count: selectedIds.size }),
        subtitle: t('job.uploadSelectedSubtitle', { count: selectedIds.size, videos: count }),
        payload: { channelIds: Array.from(selectedIds), maxUploads: count },
      });
      return;
    }

    if (!selectedChannel) return;
    if (!isStoredReupChannelType(selectedChannel.type)) return;

    void enqueueTask({
      type: 'upload_video',
      title: t('job.uploadOne', { name: selectedChannel.name }),
      subtitle: t('job.uploadOneSubtitle', { handle: selectedChannel.handle, count }),
      payload: { channelId: selectedChannel.id, maxUploads: count },
    });
  }

  async function handleDeleteUploadedVideos(options: { deletePreparedVideos: boolean }) {
    setDeletingUploadedVideos(true);
    try {
      const result = await deleteAllUploadedVideos(options);
      setShowDeleteUploadedModal(false);

      const uploadsMessage =
        result.deletedFolders === 0
          ? t('deleteUploaded.toastEmpty')
          : t('deleteUploaded.toastSuccess', {
              folders: result.deletedFolders,
              channels: result.channelsProcessed,
            });
      const preparedMessage =
        options.deletePreparedVideos && result.deletedPreparedVideos > 0
          ? t('deleteUploaded.toastPreparedExtra', { count: result.deletedPreparedVideos })
          : '';
      toast.success(`${uploadsMessage}${preparedMessage}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteUploaded.toastError'));
    } finally {
      setDeletingUploadedVideos(false);
    }
  }

  async function handleConfirmDeleteChannel() {
    if (!deletingChannelTarget) return;

    setDeletingChannelId(deletingChannelTarget.id);
    try {
      await deleteYoutubeChannel(deletingChannelTarget.id);
      setShowDeleteChannelModal(false);
      setDeletingChannelTarget(null);
      toast.success(t('delete.toastSuccess', { name: deletingChannelTarget.name }));
      list.markLoading();
      list.refresh();
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('delete.toastError'));
    } finally {
      setDeletingChannelId(null);
    }
  }

  async function handleConfirmPauseChannel() {
    if (!pausingChannelTarget) return;

    setPausingChannelId(pausingChannelTarget.id);
    try {
      await pauseYoutubeChannel(pausingChannelTarget.id);
      setShowPauseChannelModal(false);
      setPausingChannelTarget(null);
      toast.success(t('pause.toastSuccess', { name: pausingChannelTarget.name }));
      list.markLoading();
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('pause.toastError'));
    } finally {
      setPausingChannelId(null);
    }
  }

  async function handleResumeChannel(channel: YoutubeChannel) {
    if (resumingChannelId) return;

    setResumingChannelId(channel.id);
    try {
      await resumeYoutubeChannel(channel.id);
      toast.success(t('resume.toastSuccess', { name: channel.name }));
      list.markLoading();
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('resume.toastError'));
    } finally {
      setResumingChannelId(null);
    }
  }

  async function handleOpenProfile(channel: YoutubeChannel) {
    if (!canOpenGpmProfile(channel.linkedEmail)) return;
    if (openingProfileIds.has(channel.id)) return;

    setOpeningProfileIds(prev => new Set(prev).add(channel.id));
    try {
      const { item } = await startGpmProfileByEmail(channel.linkedEmail);
      const debugInfo =
        item.remote_debugging_address ??
        (item.remote_debugging_port ? `127.0.0.1:${item.remote_debugging_port}` : null);
      toast.success(
        debugInfo
          ? t('gpm.openSuccessDebug', { email: channel.linkedEmail, debug: debugInfo })
          : t('gpm.openSuccess', { email: channel.linkedEmail }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.openError'));
    } finally {
      setOpeningProfileIds(prev => {
        const next = new Set(prev);
        next.delete(channel.id);
        return next;
      });
    }
  }

  return (
    <PageShell fullBleed>
      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <div className="shrink-0 space-y-4 border-b border-border pb-4">
          <PageHeader
            title={t('page.title')}
            subtitle={t('page.subtitle')}
            icon={Clapperboard}
          />
          <YoutubeChannelsToolbar
            typeFilter={typeFilter}
            monetizationFilter={monetizationFilter}
            search={search}
            canCreateVideo={canCreateVideo}
            createVideoDisabledReason={createVideoDisabledReason}
            onTypeFilterChange={handleTypeFilterChange}
            onMonetizationFilterChange={handleMonetizationFilterChange}
            onSearchChange={handleSearchChange}
            onAddChannel={() => setShowAddModal(true)}
            onCreateVideo={() => setVideoCountAction('create')}
            onPrepareVideo={() => setVideoCountAction('prepare')}
            canUpload={canUpload}
            uploadDisabledReason={uploadDisabledReason}
            onUpload={() => setShowUploadCountModal(true)}
            deletingUploadedVideos={deletingUploadedVideos}
            onDeleteUploadedVideos={() => setShowDeleteUploadedModal(true)}
          />
          {list.error ? <p className='text-xs text-danger'>{t('page.loadError')}</p> : null}
        </div>
        <div className='mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4'>
          <div className="min-h-0 flex-1 overflow-auto">
            <YoutubeChannelsTable
              channels={list.items}
              sources={sources}
              niches={niches}
              selectedIds={selectedIds}
              loading={list.loading}
              rowNumberStart={(list.page - 1) * list.limit + 1}
              openingProfileIds={openingProfileIds}
              onSelect={handleSelect}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onOpenProfile={handleOpenProfile}
              onEdit={handleEditChannel}
              onPause={handlePauseChannel}
              onResume={channel => void handleResumeChannel(channel)}
              onDelete={handleDeleteChannel}
              pausingChannelId={pausingChannelId}
              resumingChannelId={resumingChannelId}
              deletingChannelId={deletingChannelId}
            />
          </div>
          <div className="shrink-0">
            <MailAccountsPagination
              page={list.page}
              limit={list.limit}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              locale={paginationLocale}
            />
          </div>
        </div>
      </div>

      <AddYoutubeChannelModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={handleAddSuccess} />

      <CreateVideoCountModal
        open={videoCountAction !== null}
        onClose={() => setVideoCountAction(null)}
        onConfirm={handleVideoCountConfirm}
        title={
          videoCountAction === 'prepare' ? t('createCount.titlePrepare') : t('createCount.titleCreate')
        }
        description={
          isBulkCreate
            ? videoCountAction === 'prepare'
              ? t('createCount.descAllPrepare')
              : t('createCount.descAllCreate')
            : selectedIds.size > 1
              ? videoCountAction === 'prepare'
                ? t('createCount.descSelectedPrepare', { count: selectedIds.size })
                : t('createCount.descSelectedCreate', { count: selectedIds.size })
              : selectedChannel
                ? videoCountAction === 'prepare'
                  ? t('createCount.descOnePrepare', { name: selectedChannel.name })
                  : t('createCount.descOneCreate', { name: selectedChannel.name })
                : undefined
        }
      />

      <CreateVideoCountModal
        open={showUploadCountModal}
        onClose={() => setShowUploadCountModal(false)}
        onConfirm={handleUpload}
        title={t('createCount.titleUpload')}
        description={
          isBulkCreate
            ? t('createCount.descAllUpload')
            : selectedIds.size > 1
              ? t('createCount.descSelectedUpload', { count: selectedIds.size })
              : selectedChannel
                ? t('createCount.descOneUpload', { name: selectedChannel.name })
                : undefined
        }
      />

      <DeleteUploadedVideosConfirmModal
        open={showDeleteUploadedModal}
        deleting={deletingUploadedVideos}
        onClose={() => setShowDeleteUploadedModal(false)}
        onConfirm={options => void handleDeleteUploadedVideos(options)}
      />

      <DeleteYoutubeChannelConfirmModal
        open={showDeleteChannelModal}
        channelName={deletingChannelTarget?.name ?? ''}
        deleting={deletingChannelId !== null}
        onClose={() => {
          if (deletingChannelId !== null) return;
          setShowDeleteChannelModal(false);
          setDeletingChannelTarget(null);
        }}
        onConfirm={() => void handleConfirmDeleteChannel()}
      />

      <PauseYoutubeChannelConfirmModal
        open={showPauseChannelModal}
        channelName={pausingChannelTarget?.name ?? ''}
        pausing={pausingChannelId !== null}
        onClose={() => {
          if (pausingChannelId !== null) return;
          setShowPauseChannelModal(false);
          setPausingChannelTarget(null);
        }}
        onConfirm={() => void handleConfirmPauseChannel()}
      />

      {editingChannel ? (
        <AddYoutubeChannelModal
          open={showEditModal}
          channel={editingChannel}
          onClose={() => {
            setShowEditModal(false);
            setEditingChannel(null);
          }}
          onSuccess={handleEditSuccess}
        />
      ) : null}
    </PageShell>
  );
}
