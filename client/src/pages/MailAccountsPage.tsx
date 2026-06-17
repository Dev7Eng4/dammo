import { useState } from 'react';
import { exportMailAccountsExcel, fetchMailAccount, fetchMailAccounts } from '../api/mailAccounts';
import { AddMailModal } from '../components/mail-accounts/AddMailModal';
import { MailAccountDetailPanel } from '../components/mail-accounts/MailAccountDetailPanel';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { MailAccountsTable } from '../components/mail-accounts/MailAccountsTable';
import { MailAccountsToolbar } from '../components/mail-accounts/MailAccountsToolbar';
import { useFetchedItem, usePaginatedList } from '../hooks';
import type { MailAccountFilter } from '../types/mailAccount';

const LIMIT = 20;

export function MailAccountsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<MailAccountFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const list = usePaginatedList({
    fetcher: ({ filter: currentFilter, page, limit, signal }) =>
      fetchMailAccounts(currentFilter, '', page, limit, { signal }),
    query: { filter },
    limit: LIMIT,
    onFetched: () => setSelectedIds(new Set()),
  });

  const detail = useFetchedItem((id, signal) => fetchMailAccount(id, { signal }));

  function clearSelection() {
    setSelectedId(null);
    detail.clear();
  }

  function handleFilterChange(nextFilter: MailAccountFilter) {
    list.markLoading();
    setFilter(nextFilter);
    list.resetPage();
    clearSelection();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
    clearSelection();
  }

  function handleAddSuccess() {
    list.markLoading();
    list.resetPage();
    list.refresh();
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
      await exportMailAccountsExcel(filter, '', ids);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <MailAccountsToolbar
            total={list.total}
            filter={filter}
            onFilterChange={handleFilterChange}
            onAddMail={() => setShowAddModal(true)}
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
            />
          </div>
        </div>
      </div>

      {(selectedId || detail.loading) ? (
        <>
          <button
            type="button"
            aria-label="Close detail panel"
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
    </div>
  );
}
