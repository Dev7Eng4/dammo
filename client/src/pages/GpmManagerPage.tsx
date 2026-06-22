import { useCallback, useEffect, useState } from 'react';
import {
  deleteGpmGroup,
  deleteGpmProfile,
  fetchGpmGroups,
  fetchGpmProfiles,
  fetchGpmStatus,
  startGpmProfile,
  stopGpmProfile,
} from '../api/gpm';
import { AddGpmGroupModal } from '../components/gpm-manager/AddGpmGroupModal';
import { AddGpmProfileModal } from '../components/gpm-manager/AddGpmProfileModal';
import { EditGpmGroupModal } from '../components/gpm-manager/EditGpmGroupModal';
import { EditGpmProfileModal } from '../components/gpm-manager/EditGpmProfileModal';
import { GpmConnectionBanner } from '../components/gpm-manager/GpmConnectionBanner';
import { GpmGroupsTable } from '../components/gpm-manager/GpmGroupsTable';
import { GpmGroupsToolbar } from '../components/gpm-manager/GpmGroupsToolbar';
import { GpmProfilesTable } from '../components/gpm-manager/GpmProfilesTable';
import { GpmProfilesToolbar } from '../components/gpm-manager/GpmProfilesToolbar';
import { Button, Modal, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import { cn } from '../lib/cn';
import type {
  GpmConnectionStatus,
  GpmGroup,
  GpmProfile,
  GpmProfileSort,
} from '../types/gpm';

type GpmTab = 'profiles' | 'groups';

export function GpmManagerPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<GpmTab>('profiles');
  const [refreshKey, setRefreshKey] = useState(0);

  const [status, setStatus] = useState<GpmConnectionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [profiles, setProfiles] = useState<GpmProfile[]>([]);
  const [groups, setGroups] = useState<GpmGroup[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  const [profileSearch, setProfileSearch] = useState('');
  const [profileSort, setProfileSort] = useState<GpmProfileSort>(0);
  const [debouncedProfileSearch, setDebouncedProfileSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [debouncedGroupSearch, setDebouncedGroupSearch] = useState('');

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [runningProfileIds, setRunningProfileIds] = useState<Set<string>>(() => new Set());

  const [showAddProfileModal, setShowAddProfileModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showDeleteProfileModal, setShowDeleteProfileModal] = useState(false);
  const [deleteHardMode, setDeleteHardMode] = useState(false);

  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GpmGroup | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const isSelectedRunning = selectedProfileId ? runningProfileIds.has(selectedProfileId) : false;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedProfileSearch(profileSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [profileSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedGroupSearch(groupSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [groupSearch]);

  useAbortableEffect(
    async (signal) => {
      setStatusLoading(true);
      try {
        const { item } = await fetchGpmStatus({ signal });
        setStatus(item);
      } catch (err) {
        if (signal.aborted) return;
        setStatus({
          connected: false,
          baseUrl: 'http://127.0.0.1:9495/api/v1',
          message: err instanceof Error ? err.message : 'Failed to check GPM status',
        });
      } finally {
        if (!signal.aborted) setStatusLoading(false);
      }
    },
    [refreshKey],
  );

  useAbortableEffect(
    async (signal) => {
      setProfilesLoading(true);
      setProfilesError(null);
      try {
        const { item } = await fetchGpmProfiles(
          {
            page: 1,
            page_size: 100,
            search: debouncedProfileSearch || undefined,
            sort: profileSort,
          },
          { signal },
        );
        setProfiles(item.data);
        setSelectedProfileId((current) =>
          current && item.data.some((profile) => profile.id === current) ? current : null,
        );
      } catch (err) {
        if (signal.aborted) return;
        setProfiles([]);
        setProfilesError(err instanceof Error ? err.message : 'Failed to load profiles');
      } finally {
        if (!signal.aborted) setProfilesLoading(false);
      }
    },
    [refreshKey, debouncedProfileSearch, profileSort],
  );

  useAbortableEffect(
    async (signal) => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const { item } = await fetchGpmGroups(
          {
            page: 1,
            page_size: 100,
            search: debouncedGroupSearch || undefined,
          },
          { signal },
        );
        setGroups(item.data);
      } catch (err) {
        if (signal.aborted) return;
        setGroups([]);
        setGroupsError(err instanceof Error ? err.message : 'Failed to load groups');
      } finally {
        if (!signal.aborted) setGroupsLoading(false);
      }
    },
    [refreshKey, debouncedGroupSearch],
  );

  const handleRefresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  async function handleStartProfile() {
    if (!selectedProfileId || starting) return;
    setStarting(true);
    try {
      const { item } = await startGpmProfile(selectedProfileId);
      setRunningProfileIds((prev) => new Set(prev).add(selectedProfileId));
      const port = item.remote_debugging_port;
      const name = item.addition_info?.profile_name ?? selectedProfile?.name ?? selectedProfileId;
      toast.success(
        port
          ? `Started "${name}" — debug port ${port}`
          : `Started profile "${name}"`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start profile');
    } finally {
      setStarting(false);
    }
  }

  async function handleStopProfile() {
    if (!selectedProfileId || stopping) return;
    setStopping(true);
    try {
      await stopGpmProfile(selectedProfileId);
      setRunningProfileIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedProfileId);
        return next;
      });
      toast.success(`Stopped profile "${selectedProfile?.name ?? selectedProfileId}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to stop profile');
    } finally {
      setStopping(false);
    }
  }

  async function handleConfirmDeleteProfile() {
    if (!selectedProfileId || deletingProfile) return;
    setDeletingProfile(true);
    try {
      await deleteGpmProfile(selectedProfileId, deleteHardMode ? 'hard' : 'soft');
      setRunningProfileIds((prev) => {
        const next = new Set(prev);
        next.delete(selectedProfileId);
        return next;
      });
      toast.success(
        deleteHardMode
          ? `Permanently deleted "${selectedProfile?.name ?? selectedProfileId}"`
          : `Deleted "${selectedProfile?.name ?? selectedProfileId}"`,
      );
      setShowDeleteProfileModal(false);
      setDeleteHardMode(false);
      setSelectedProfileId(null);
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete profile');
    } finally {
      setDeletingProfile(false);
    }
  }

  async function handleDeleteGroup(group: GpmGroup) {
    if (deletingGroupId) return;
    const confirmed = window.confirm(`Delete group "${group.name}"?`);
    if (!confirmed) return;

    setDeletingGroupId(group.id);
    try {
      await deleteGpmGroup(group.id);
      toast.success(`Deleted group "${group.name}"`);
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setDeletingGroupId(null);
    }
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <GpmConnectionBanner status={status} loading={statusLoading} className="mb-4" />

          <div className="mb-4 flex gap-1 border-b border-border">
            {(['profiles', 'groups'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors',
                  activeTab === tab
                    ? 'border-primary-400 text-primary-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200',
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'profiles' ? (
            <>
              <div className="border-b border-border pb-4">
                <GpmProfilesToolbar
                  count={profiles.length}
                  search={profileSearch}
                  sort={profileSort}
                  loading={profilesLoading}
                  starting={starting}
                  stopping={stopping}
                  deleting={deletingProfile}
                  canStart={selectedProfileId !== null && !isSelectedRunning}
                  canStop={selectedProfileId !== null && isSelectedRunning}
                  canEdit={selectedProfileId !== null}
                  canDelete={selectedProfileId !== null}
                  onSearchChange={setProfileSearch}
                  onSortChange={setProfileSort}
                  onRefresh={handleRefresh}
                  onAddProfile={() => setShowAddProfileModal(true)}
                  onStart={handleStartProfile}
                  onStop={handleStopProfile}
                  onEdit={() => setShowEditProfileModal(true)}
                  onDelete={() => setShowDeleteProfileModal(true)}
                />
              </div>

              {profilesError ? <p className="mt-2 text-xs text-danger">{profilesError}</p> : null}

              <div className="mt-4 card-surface px-5 pt-3 pb-4">
                <GpmProfilesTable
                  profiles={profiles}
                  groups={groups}
                  selectedId={selectedProfileId}
                  runningProfileIds={runningProfileIds}
                  loading={profilesLoading}
                  onSelect={setSelectedProfileId}
                />
              </div>
            </>
          ) : (
            <>
              <div className="border-b border-border pb-4">
                <GpmGroupsToolbar
                  count={groups.length}
                  search={groupSearch}
                  loading={groupsLoading}
                  onSearchChange={setGroupSearch}
                  onRefresh={handleRefresh}
                  onAddGroup={() => setShowAddGroupModal(true)}
                />
              </div>

              {groupsError ? <p className="mt-2 text-xs text-danger">{groupsError}</p> : null}

              <div className="mt-4 card-surface px-5 pt-3 pb-4">
                <GpmGroupsTable
                  groups={groups}
                  loading={groupsLoading}
                  deletingId={deletingGroupId}
                  onEdit={(group) => {
                    setEditingGroup(group);
                    setShowEditGroupModal(true);
                  }}
                  onDelete={handleDeleteGroup}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <AddGpmProfileModal
        open={showAddProfileModal}
        groups={groups}
        onClose={() => setShowAddProfileModal(false)}
        onSuccess={() => {
          toast.success('GPM profile created');
          handleRefresh();
        }}
      />

      <EditGpmProfileModal
        open={showEditProfileModal}
        profile={selectedProfile}
        groups={groups}
        onClose={() => setShowEditProfileModal(false)}
        onSuccess={() => {
          toast.success('GPM profile updated');
          handleRefresh();
        }}
      />

      <Modal
        open={showDeleteProfileModal}
        onClose={() => {
          if (deletingProfile) return;
          setShowDeleteProfileModal(false);
          setDeleteHardMode(false);
        }}
        title="Delete GPM Profile"
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setShowDeleteProfileModal(false);
                setDeleteHardMode(false);
              }}
              disabled={deletingProfile}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              onClick={handleConfirmDeleteProfile}
              disabled={deletingProfile}
            >
              {deletingProfile ? 'Deleting…' : deleteHardMode ? 'Delete permanently' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Delete profile &quot;{selectedProfile?.name ?? selectedProfileId}&quot;?
        </p>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={deleteHardMode}
            onChange={(e) => setDeleteHardMode(e.target.checked)}
            disabled={deletingProfile}
            className="size-3.5 rounded border-border bg-surface accent-primary-500"
          />
          Permanently delete (hard mode)
        </label>
      </Modal>

      <AddGpmGroupModal
        open={showAddGroupModal}
        onClose={() => setShowAddGroupModal(false)}
        onSuccess={() => {
          toast.success('GPM group created');
          handleRefresh();
        }}
      />

      <EditGpmGroupModal
        open={showEditGroupModal}
        group={editingGroup}
        onClose={() => {
          setShowEditGroupModal(false);
          setEditingGroup(null);
        }}
        onSuccess={() => {
          toast.success('GPM group updated');
          handleRefresh();
        }}
      />
    </div>
  );
}
