import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { importMailAccounts, previewMailAccountsText } from '../../api/mailAccounts';
import { Button, Modal } from '../ui';
import type { MailImportPreviewRow } from '../../types/mailAccount';

interface ImportMailBatchModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: { created: number; skipped: number; errors: string[] }) => void;
}

const checkboxClassName = 'size-3.5 rounded border-border bg-surface accent-primary-500';

export function ImportMailBatchModal({ open, onClose, onSuccess }: ImportMailBatchModalProps) {
  const { t } = useTranslation(['mail', 'common']);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<MailImportPreviewRow[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(() => new Set());
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText('');
    setRows([]);
    setSelectedIndexes(new Set());
    setPreviewing(false);
    setSaving(false);
    setError(null);
  }, [open]);

  const validSelectedCount = useMemo(() => {
    let count = 0;
    for (const index of selectedIndexes) {
      const row = rows[index];
      if (row?.valid) count += 1;
    }
    return count;
  }, [rows, selectedIndexes]);

  const selectableIndexes = useMemo(
    () => rows.map((row, index) => (row.valid ? index : -1)).filter((index) => index >= 0),
    [rows],
  );

  const allValidSelected =
    selectableIndexes.length > 0 && selectableIndexes.every((index) => selectedIndexes.has(index));

  function handleClose() {
    if (previewing || saving) return;
    onClose();
  }

  async function handlePreview() {
    if (!text.trim() || previewing || saving) return;

    setPreviewing(true);
    setError(null);
    try {
      const result = await previewMailAccountsText(text);
      setRows(result.rows);
      setSelectedIndexes(
        new Set(
          result.rows
            .map((row, index) => (row.valid ? index : -1))
            .filter((index) => index >= 0),
        ),
      );
      if (result.rows.length === 0) {
        setError(t('batch.empty'));
      }
    } catch (err) {
      setRows([]);
      setSelectedIndexes(new Set());
      setError(err instanceof Error ? err.message : t('batch.previewError'));
    } finally {
      setPreviewing(false);
    }
  }

  function handleToggleRow(index: number) {
    const row = rows[index];
    if (!row?.valid) return;
    setSelectedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleToggleAll() {
    if (allValidSelected) {
      setSelectedIndexes(new Set());
      return;
    }
    setSelectedIndexes(new Set(selectableIndexes));
  }

  async function handleSave() {
    if (validSelectedCount === 0 || saving) return;

    const payloads = Array.from(selectedIndexes)
      .sort((a, b) => a - b)
      .map((index) => rows[index])
      .filter((row): row is MailImportPreviewRow => Boolean(row?.valid))
      .map((row) => ({
        email: row.email,
        password: row.password || undefined,
        twoFactorAuth: row.twoFactorAuth || undefined,
        recoveryEmail: row.recoveryEmail || undefined,
        phone: row.phone || undefined,
      }));

    if (payloads.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const result = await importMailAccounts(payloads);
      onSuccess({
        created: result.created,
        skipped: result.skipped,
        errors: result.errors,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('batch.importError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('batch.title')}
      className="max-w-4xl"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={previewing || saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={validSelectedCount === 0 || previewing || saving}
            onClick={() => void handleSave()}
          >
            {saving
              ? t('common:actions.saving')
              : t('batch.save', { count: validSelectedCount })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-400">{t('batch.hint')}</p>

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setRows([]);
            setSelectedIndexes(new Set());
            setError(null);
          }}
          placeholder={t('batch.placeholder')}
          rows={8}
          disabled={previewing || saving}
          className="w-full resize-y rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outlined"
            size="sm"
            disabled={!text.trim() || previewing || saving}
            onClick={() => void handlePreview()}
          >
            {previewing ? t('batch.previewing') : t('batch.preview')}
          </Button>
        </div>

        {error ? <p className="text-xs text-danger">{error}</p> : null}

        {rows.length > 0 ? (
          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-160 border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated text-xs uppercase tracking-wide text-neutral-500">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      className={checkboxClassName}
                      checked={allValidSelected}
                      onChange={handleToggleAll}
                      disabled={selectableIndexes.length === 0 || saving}
                      aria-label={t('batch.selectAll')}
                    />
                  </th>
                  <th className="px-3 py-2">{t('table.col.email')}</th>
                  <th className="px-3 py-2">{t('table.col.password')}</th>
                  <th className="px-3 py-2">{t('table.col.twoFa')}</th>
                  <th className="px-3 py-2">{t('table.col.recovery')}</th>
                  <th className="px-3 py-2">{t('batch.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const selected = selectedIndexes.has(index);
                  return (
                    <tr
                      key={`${row.rowIndex}-${row.email}-${index}`}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className={checkboxClassName}
                          checked={selected}
                          disabled={!row.valid || saving}
                          onChange={() => handleToggleRow(index)}
                          aria-label={row.email || `row-${row.rowIndex}`}
                        />
                      </td>
                      <td className="max-w-48 truncate px-3 py-2 font-medium text-neutral-100" title={row.email}>
                        {row.email || '—'}
                      </td>
                      <td className="max-w-32 truncate px-3 py-2 font-mono text-xs text-neutral-300">
                        {row.password ? '••••••••' : '—'}
                      </td>
                      <td className="max-w-48 truncate px-3 py-2 font-mono text-xs text-neutral-300" title={row.twoFactorAuth}>
                        {row.twoFactorAuth || '—'}
                      </td>
                      <td className="max-w-40 truncate px-3 py-2 text-neutral-300" title={row.recoveryEmail}>
                        {row.recoveryEmail || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.valid ? (
                          <span className="text-xs text-success">{t('batch.ok')}</span>
                        ) : (
                          <span className="text-xs text-danger" title={row.error}>
                            {row.error ?? t('batch.invalid')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
