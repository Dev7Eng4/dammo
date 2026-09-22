import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteMailAccount,
  exportMailAccountsExcel,
  fetchMailAccounts,
  loginGmailAccount,
} from '../api/mailAccounts';
import { PageHeader, PageShell } from '../components/layout';
import { AddMailModal } from '../components/mail-accounts/AddMailModal';
import { DeleteMailAccountConfirmModal } from '../components/mail-accounts/DeleteMailAccountConfirmModal';
import { ImportMailBatchModal } from '../components/mail-accounts/ImportMailBatchModal';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { MailAccountsTable } from '../components/mail-accounts/MailAccountsTable';
import { MailAccountsToolbar } from '../components/mail-accounts/MailAccountsToolbar';
import { useToast } from '../components/ui';
import { useDebouncedValue, usePaginatedList } from '../hooks';
import { Mail } from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 300;

export function MailAccountsPage() {
  const { t } = useTranslation(['mail', 'common']);
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [gmailLoggingIn, setGmailLoggingIn] = useState(false);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const list = usePaginatedList({
    fetcher: ({ query, page, limit: pageLimit, signal }) =>
      fetchMailAccounts(query, page, pageLimit, { signal }),
    query: { query: debouncedSearch },
    limit,
    onFetched: () => setSelectedIds(new Set()),
  });

  const selectedAccount =
    selectedIds.size === 1 ? list.items.find((account) => selectedIds.has(account.id)) ?? null : null;
  const canEdit = selectedIds.size === 1;
  const canDelete = selectedIds.size === 1;
  const hasPassword = Boolean(selectedAccount?.password?.trim());
  const canGmailLogin = canEdit && hasPassword;
  const selectionDisabledReason =
    selectedIds.size === 0
      ? t('hint.selectOne')
      : selectedIds.size > 1
        ? t('hint.selectOnlyOne')
        : undefined;
  const gmailLoginDisabledReason = !canEdit
    ? selectionDisabledReason
    : !hasPassword
      ? t('detail.gmailLoginNeedsPassword')
      : undefined;

  function clearSelection() {
    setSelectedIds(new Set());
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

  function handleSearchChange(value: string) {
    list.markLoading();
    setSearch(value);
    list.resetPage();
    clearSelection();
  }

  function handleAddSuccess() {
    list.markLoading();
    list.resetPage();
    list.refresh();
  }

  function handleBatchSuccess(result: { created: number; skipped: number; errors: string[] }) {
    list.markLoading();
    list.resetPage();
    list.refresh();
    if (result.created > 0) {
      toast.success(t('toast.importSuccess', { count: result.created }));
    }
    if (result.skipped > 0 || result.errors.length > 0) {
      toast.error(result.errors[0] ?? t('toast.importPartial', { skipped: result.skipped }));
    }
  }

  function handleEditSuccess() {
    list.markLoading();
    list.refresh();
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) => {
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
      setSelectedIds(new Set(list.items.map((a) => a.id)));
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    setExportError(null);
    try {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      await exportMailAccountsExcel(debouncedSearch, ids);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t('toast.exportError'));
    } finally {
      setExporting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!selectedAccount) return;

    setDeleting(true);
    try {
      await deleteMailAccount(selectedAccount.id);
      setShowDeleteModal(false);
      toast.success(t('toast.deleteSuccess', { email: selectedAccount.email }));
      list.markLoading();
      list.refresh();
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleGmailLogin() {
    if (!selectedAccount || !canGmailLogin || gmailLoggingIn) return;
    setGmailLoggingIn(true);
    try {
      await loginGmailAccount(selectedAccount.id);
      toast.success(t('toast.gmailLoginSuccess', { email: selectedAccount.email }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('toast.gmailLoginError'));
    } finally {
      setGmailLoggingIn(false);
    }
  }

  return (
    <PageShell fullBleed>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0">
          <PageHeader
            title={t('page.title')}
            subtitle={t('page.subtitle')}
            icon={Mail}
            className="mb-4"
          />
          <MailAccountsToolbar
            total={list.total}
            search={search}
            canEdit={canEdit}
            editDisabledReason={selectionDisabledReason}
            canDelete={canDelete}
            deleteDisabledReason={selectionDisabledReason}
            deleting={deleting}
            canGmailLogin={canGmailLogin}
            gmailLoginDisabledReason={gmailLoginDisabledReason}
            gmailLoggingIn={gmailLoggingIn}
            onSearchChange={handleSearchChange}
            onAddMail={() => setShowAddModal(true)}
            onAddBatch={() => setShowBatchModal(true)}
            onEdit={() => setShowEditModal(true)}
            onDelete={() => setShowDeleteModal(true)}
            onGmailLogin={() => void handleGmailLogin()}
            onExportExcel={handleExportExcel}
            exporting={exporting}
          />
          {exportError ? (
            <p className="mt-2 text-xs text-danger">{exportError}</p>
          ) : null}
          {list.error ? (
            <p className="mt-2 text-xs text-danger">{list.error}</p>
          ) : null}
        </div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4">
          <div className="min-h-0 flex-1 overflow-auto">
            <MailAccountsTable
              accounts={list.items}
              selectedIds={selectedIds}
              loading={list.loading}
              rowNumberStart={(list.page - 1) * list.limit + 1}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
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
            />
          </div>
        </div>
      </div>

      <AddMailModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      <ImportMailBatchModal
        open={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        onSuccess={handleBatchSuccess}
      />

      {selectedAccount ? (
        <AddMailModal
          open={showEditModal}
          account={selectedAccount}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
        />
      ) : null}

      <DeleteMailAccountConfirmModal
        open={showDeleteModal}
        email={selectedAccount?.email ?? ''}
        deleting={deleting}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </PageShell>
  );
}
