import { useState } from 'react';
import { deleteMailAccount, exportMailAccountsExcel, fetchMailAccount, fetchMailAccounts } from '../api/mailAccounts';
import { AddMailModal } from '../components/mail-accounts/AddMailModal';
import { DeleteMailAccountConfirmModal } from '../components/mail-accounts/DeleteMailAccountConfirmModal';
import { MailAccountDetailPanel } from '../components/mail-accounts/MailAccountDetailPanel';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { MailAccountsTable } from '../components/mail-accounts/MailAccountsTable';
import { MailAccountsToolbar } from '../components/mail-accounts/MailAccountsToolbar';
import { useToast } from '../components/ui';
import { useDebouncedValue, useFetchedItem, usePaginatedList } from '../hooks';

const SEARCH_DEBOUNCE_MS = 300;

export function MailAccountsPage() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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

  const detail = useFetchedItem((id, signal) => fetchMailAccount(id, { signal }));
  const selectedAccount =
    selectedIds.size === 1 ? list.items.find((account) => selectedIds.has(account.id)) ?? null : null;
  const canEdit = selectedIds.size === 1;
  const canDelete = selectedIds.size === 1;
  const selectionDisabledReason =
    selectedIds.size === 0
      ? 'Chọn một email'
      : selectedIds.size > 1
        ? 'Chỉ chọn một email'
        : undefined;

  function clearSelection() {
    setSelectedId(null);
    detail.clear();
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

  function handleEditSuccess() {
    list.markLoading();
    list.refresh();
    if (selectedAccount && selectedId === selectedAccount.id) {
      detail.load(selectedAccount.id);
    }
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    detail.load(id);
  }

  function handleClosePanel() {
    clearSelection();
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
      setExportError(err instanceof Error ? err.message : 'Xuất file thất bại');
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
      toast.success(`Đã xóa email "${selectedAccount.email}"`);
      list.markLoading();
      list.refresh();
      clearSelection();
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa email');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="-m-6 flex h-svh flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <MailAccountsToolbar
            total={list.total}
            search={search}
            canEdit={canEdit}
            editDisabledReason={selectionDisabledReason ? `${selectionDisabledReason} để sửa` : undefined}
            canDelete={canDelete}
            deleteDisabledReason={selectionDisabledReason ? `${selectionDisabledReason} để xóa` : undefined}
            deleting={deleting}
            onSearchChange={handleSearchChange}
            onAddMail={() => setShowAddModal(true)}
            onEdit={() => setShowEditModal(true)}
            onDelete={() => setShowDeleteModal(true)}
            onExportExcel={handleExportExcel}
            exporting={exporting}
          />
          {exportError ? (
            <p className="mt-2 text-xs text-danger">{exportError}</p>
          ) : null}
          {list.error ? (
            <p className="mt-2 text-xs text-danger">{list.error}</p>
          ) : null}
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <MailAccountsTable
              accounts={list.items}
              selectedId={selectedId}
              selectedIds={selectedIds}
              loading={list.loading}
              rowNumberStart={(list.page - 1) * list.limit + 1}
              onSelect={handleSelect}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
            />
            <MailAccountsPagination
              page={list.page}
              limit={list.limit}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              locale="vi"
            />
          </div>
        </div>
      </div>

      {(selectedId || detail.loading) ? (
        <>
          <button
            type="button"
            aria-label="Đóng panel chi tiết"
            onClick={handleClosePanel}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm lg:static lg:z-auto lg:max-w-none">
            <MailAccountDetailPanel
              account={detail.item}
              loading={detail.loading}
              onClose={handleClosePanel}
            />
          </div>
        </>
      ) : null}

      <AddMailModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
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
    </div>
  );
}
