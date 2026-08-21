import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { updateGpmProfile } from '../../api/gpm';
import { fetchProxies, setProfileProxy } from '../../api/proxies';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { buildRawProxy, formatProxyOptionLabel } from '../../lib/proxy-format';
import type {
  EditGpmProfileFormValues,
  GpmGroup,
  GpmProfile,
  UpdateGpmProfilePayload,
} from '../../types/gpm';
import type { MailAccount } from '../../types/mailAccount';
import type { Proxy } from '../../types/proxy';
import { Button, Modal, Select, Textarea } from '../ui';

interface EditGpmProfileModalProps {
  open: boolean;
  profile: GpmProfile | null;
  groups: GpmGroup[];
  usedEmails: string[];
  onClose: () => void;
  onSuccess: () => void;
}

function findAssignedProxyId(proxies: Proxy[], profileId: string): string {
  return proxies.find((proxy) => proxy.assignedProfileIds.includes(profileId))?.id ?? '';
}

export function EditGpmProfileModal({ open, profile, groups, usedEmails, onClose, onSuccess }: EditGpmProfileModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [proxiesLoading, setProxiesLoading] = useState(false);
  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([]);
  const [mailAccountsLoading, setMailAccountsLoading] = useState(false);

  const usedEmailsSet = useMemo(
    () => new Set(usedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
    [usedEmails],
  );

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'Không nhóm' },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups],
  );

  const proxyOptions = useMemo(
    () => [
      { value: '', label: 'Không proxy' },
      ...proxies.map((proxy) => ({
        value: proxy.id,
        label: formatProxyOptionLabel(proxy),
      })),
    ],
    [proxies],
  );

  const currentEmail = profile?.name?.trim() ?? '';
  const currentEmailNormalized = currentEmail.toLowerCase();

  const emailOptions = useMemo(() => {
    const normalizedSeen = new Set<string>();
    const options: Array<{ value: string; label: string }> = [];

    for (const account of mailAccounts) {
      const email = account.email?.trim();
      if (!email) continue;
      const normalized = email.toLowerCase();

      if (normalizedSeen.has(normalized)) continue;
      if (usedEmailsSet.has(normalized) && normalized !== currentEmailNormalized) continue;

      normalizedSeen.add(normalized);
      options.push({ value: email, label: email });
    }

    // Ensure current email always exists in options so the Select always shows a label.
    if (currentEmail && !normalizedSeen.has(currentEmailNormalized)) {
      options.unshift({ value: currentEmail, label: currentEmail });
    }

    return options;
  }, [mailAccounts, usedEmailsSet, currentEmail, currentEmailNormalized]);

  const {
    register,
    handleSubmit,
    reset,
    control,
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

    fetchProxies('all', '', 1, 100, { signal: controller.signal })
      .then((response) => setProxies(response.items))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setProxies([]);
          setApiError(err instanceof Error ? err.message : 'Không tải được danh sách proxy');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setProxiesLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setMailAccountsLoading(true);

    fetchMailAccounts('', 1, 100, { signal: controller.signal })
      .then((res) => setMailAccounts(res.items))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setMailAccounts([]);
          setApiError(err instanceof Error ? err.message : 'Không tải được danh sách email');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMailAccountsLoading(false);
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

      const payload: UpdateGpmProfilePayload = {
        name: values.name.trim(),
        group_id: values.group_id || null,
      };
      if (selectedProxy) payload.raw_proxy = buildRawProxy(selectedProxy);
      const note = values.note.trim();
      if (note) payload.note = note;

      await updateGpmProfile(profile.id, payload);

      await setProfileProxy(profile.id, values.proxyId || null);

      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Cập nhật profile thất bại');
    }
  }

  if (!profile) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Sửa GPM Profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || proxiesLoading || mailAccountsLoading || emailOptions.length === 0}
            form="edit-gpm-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form id="edit-gpm-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="edit-gpm-profile-email" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Email
          </label>
          <Controller
            name="name"
            control={control}
            rules={{ required: 'Email là bắt buộc' }}
            render={({ field }) => (
              <Select
                id="edit-gpm-profile-email"
                options={emailOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={mailAccountsLoading ? 'Đang tải email...' : 'Chọn email'}
                searchable
                searchPlaceholder="Tìm kiếm email..."
                disabled={isSubmitting || mailAccountsLoading || emailOptions.length === 0}
                triggerClassName="h-10 rounded-lg text-sm"
              />
            )}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-group" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Nhóm
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
            <p className="mt-1 text-xs text-neutral-500">Đang tải proxy…</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="edit-gpm-profile-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Ghi chú
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
