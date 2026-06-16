import { useCallback, useEffect, useState } from 'react';
import { exportMailAccountsExcel, fetchMailAccount, fetchMailAccounts } from '../api/mailAccounts';
import { AddMailModal } from '../components/mail-accounts/AddMailModal';
import { MailAccountDetailPanel } from '../components/mail-accounts/MailAccountDetailPanel';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { MailAccountsTable } from '../components/mail-accounts/MailAccountsTable';
import { MailAccountsToolbar } from '../components/mail-accounts/MailAccountsToolbar';
import type { MailAccount, MailAccountFilter } from '../types/mailAccount';

const LIMIT = 20;

export function MailAccountsPage() {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<MailAccount | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<MailAccountFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const loadAccounts = useCallback(async (currentFilter: MailAccountFilter, currentPage: number) => {
    setLoading(true);
    try {
      const data = await fetchMailAccounts(currentFilter, '', currentPage, LIMIT);
      setAccounts(data.items);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setSelectedIds(new Set());
    } catch {
      setAccounts([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts(filter, page);
  }, [filter, page, loadAccounts]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedAccount(null);
      return;
    }

    setDetailLoading(true);
    fetchMailAccount(selectedId)
      .then(setSelectedAccount)
      .catch(() => setSelectedAccount(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  function handleFilterChange(nextFilter: MailAccountFilter) {
    setFilter(nextFilter);
    setPage(1);
    setSelectedId(null);
    setSelectedAccount(null);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    setSelectedId(null);
    setSelectedAccount(null);
  }

  function handleAddSuccess() {
    setPage(1);
    loadAccounts(filter, 1);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  function handleClosePanel() {
    setSelectedId(null);
    setSelectedAccount(null);
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
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
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
            total={total}
            filter={filter}
            onFilterChange={handleFilterChange}
            onAddMail={() => setShowAddModal(true)}
            onExportExcel={handleExportExcel}
            exporting={exporting}
          />
          {exportError ? (
            <p className="mt-2 text-xs text-danger">{exportError}</p>
          ) : null}
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <MailAccountsTable
              accounts={accounts}
              selectedId={selectedId}
              selectedIds={selectedIds}
              loading={loading}
              onSelect={handleSelect}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
            />
            <MailAccountsPagination
              page={page}
              limit={LIMIT}
              total={total}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>

      {(selectedId || detailLoading) ? (
        <>
          <button
            type="button"
            aria-label="Close detail panel"
            onClick={handleClosePanel}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm lg:static lg:z-auto lg:max-w-none">
            <MailAccountDetailPanel
              account={selectedAccount}
              loading={detailLoading}
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
