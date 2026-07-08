import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { updateGpmProfile } from '../../api/gpm';
import { fetchProxies, setProfileProxy } from '../../api/proxies';
import { buildRawProxy, formatProxyLabel } from '../../lib/proxy-format';
import type { EditGpmProfileFormValues, GpmGroup, GpmProfile } from '../../types/gpm';
import type { Proxy } from '../../types/proxy';
import { Button, Input, Modal, Select, Textarea } from '../ui';

interface EditGpmProfileModalProps {
  open: boolean;
  profile: GpmProfile | null;
  groups: GpmGroup[];
  onClose: () => void;
  onSuccess: () => void;
}

function findAssignedProxyId(proxies: Proxy[], profileId: string): string {
  return proxies.find((proxy) => proxy.assignedProfileIds.includes(profileId))?.id ?? '';
}

export function EditGpmProfileModal({ open, profile, groups, onClose, onSuccess }: EditGpmProfileModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [proxiesLoading, setProxiesLoading] = useState(false);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'No group' },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups],
  );

  const proxyOptions = useMemo(
    () => [
      { value: '', label: 'No proxy' },
      ...proxies.map((proxy) => ({
        value: proxy.id,
        label: formatProxyLabel(proxy),
      })),
    ],
    [proxies],
  );

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EditGpmProfileFormValues>();

  const groupId = watch('group_id');
  const proxyId = watch('proxyId');

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setProxiesLoading(true);

    fetchProxies('active', '', 1, 100, { signal: controller.signal })
      .then((response) => setProxies(response.items))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setProxies([]);
          setApiError(err instanceof Error ? err.message : 'Failed to load proxies');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setProxiesLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || !profile || proxiesLoading) return;

    reset({
      name: profile.name,
      group_id: profile.group_id ?? '',
      proxyId: findAssignedProxyId(proxies, profile.id),
      note: profile.note ?? '',
    });
    setApiError(null);
  }, [open, profile, proxies, proxiesLoading, reset]);

  function handleClose() {
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: EditGpmProfileFormValues) {
    if (!profile) return;
    setApiError(null);
    try {
      const selectedProxy = values.proxyId
        ? proxies.find((proxy) => proxy.id === values.proxyId)
        : undefined;

      await updateGpmProfile(profile.id, {
        name: values.name.trim(),
        group_id: values.group_id || null,
        raw_proxy: selectedProxy ? buildRawProxy(selectedProxy) : '',
        note: values.note.trim() || null,
      });

      await setProfileProxy(profile.id, values.proxyId || null);

      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  }

  if (!profile) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit GPM Profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || proxiesLoading}
            form="edit-gpm-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id="edit-gpm-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-gpm-profile-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="edit-gpm-profile-name"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-group" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Group
          </label>
          <Select
            id="edit-gpm-profile-group"
            value={groupId ?? ''}
            onChange={(value) => setValue('group_id', value)}
            options={groupOptions}
            disabled={isSubmitting}
            triggerClassName="h-10 rounded-lg text-sm"
          />
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-proxy" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Proxy
          </label>
          <Select
            id="edit-gpm-profile-proxy"
            value={proxyId ?? ''}
            onChange={(value) => setValue('proxyId', value)}
            options={proxyOptions}
            disabled={isSubmitting || proxiesLoading}
            triggerClassName="h-10 rounded-lg font-mono text-sm"
          />
          {proxiesLoading ? (
            <p className="mt-1 text-xs text-neutral-500">Loading proxies…</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Note
          </label>
          <Textarea
            id="edit-gpm-profile-note"
            rows={3}
            disabled={isSubmitting}
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
