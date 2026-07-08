import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { createGpmProfile } from '../../api/gpm';
import { fetchProxies, setProfileProxy } from '../../api/proxies';
import { buildRawProxy, formatProxyOptionLabel } from '../../lib/proxy-format';
import type { AddGpmProfileFormValues, GpmGroup } from '../../types/gpm';
import type { Proxy } from '../../types/proxy';
import { Button, Input, Modal, Select, Textarea } from '../ui';

interface AddGpmProfileModalProps {
  open: boolean;
  groups: GpmGroup[];
  onClose: () => void;
  onSuccess: () => void;
}

const defaultValues: AddGpmProfileFormValues = {
  name: '',
  group_id: '',
  proxyId: '',
  note: '',
};

export function AddGpmProfileModal({ open, groups, onClose, onSuccess }: AddGpmProfileModalProps) {
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
        label: formatProxyOptionLabel(proxy),
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
  } = useForm<AddGpmProfileFormValues>({
    defaultValues,
  });

  const groupId = watch('group_id');
  const proxyId = watch('proxyId');

  useEffect(() => {
    if (!open) return;
    reset(defaultValues);
    setApiError(null);
  }, [open, reset]);

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

  function handleClose() {
    reset(defaultValues);
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddGpmProfileFormValues) {
    setApiError(null);
    try {
      const selectedProxy = values.proxyId
        ? proxies.find((proxy) => proxy.id === values.proxyId)
        : undefined;

      const { item } = await createGpmProfile({
        name: values.name.trim(),
        group_id: values.group_id || null,
        raw_proxy: selectedProxy ? buildRawProxy(selectedProxy) : undefined,
        note: values.note.trim() || null,
      });

      if (values.proxyId) {
        await setProfileProxy(item.id, values.proxyId);
      }

      reset(defaultValues);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create profile');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add GPM Profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || proxiesLoading}
            form="add-gpm-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Creating…' : 'Add Profile'}
          </Button>
        </>
      }
    >
      <form id="add-gpm-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="gpm-profile-name" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Name
          </label>
          <Input
            id="gpm-profile-name"
            placeholder="Profile name"
            className="h-10 rounded-lg text-sm"
            disabled={isSubmitting}
            {...register('name', { required: 'Name is required' })}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="gpm-profile-group" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Group
          </label>
          <Select
            id="gpm-profile-group"
            value={groupId}
            onChange={(value) => setValue('group_id', value)}
            options={groupOptions}
            disabled={isSubmitting}
            triggerClassName="h-10 rounded-lg text-sm"
          />
        </div>

        <div>
          <label htmlFor="gpm-profile-proxy" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Proxy
          </label>
          <Select
            id="gpm-profile-proxy"
            value={proxyId}
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
          <label htmlFor="gpm-profile-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Note
          </label>
          <Textarea
            id="gpm-profile-note"
            rows={3}
            placeholder="Optional note"
            disabled={isSubmitting}
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
