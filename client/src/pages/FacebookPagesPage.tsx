import { ExternalLink, Flag, Image as ImageIcon, Pencil, Plus, Rocket, Trash2, Video } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createFacebookPageOnFacebook,
  deleteFacebookPage,
  fetchFacebookPages,
} from '../api/facebookPages'
import { FacebookPageFormModal } from '../components/facebook-pages/FacebookPageFormModal'
import { FacebookPublishModal, type PublishMode } from '../components/facebook-pages/FacebookPublishModal'
import { PageHeader, PageShell } from '../components/layout'
import { Button, Input, Select, StatusBadge, Modal, useToast, type StatusTone } from '../components/ui'
import { useAbortableEffect, useDebouncedValue } from '../hooks'
import type {
  FacebookPage,
  FacebookPageStatus,
  FacebookPageStatusFilter,
} from '../types/facebookPage'

const STATUS_FILTERS: readonly FacebookPageStatusFilter[] = ['all', 'draft', 'created', 'active', 'paused']

const STATUS_TONE: Record<FacebookPageStatus, StatusTone> = {
  draft: 'neutral',
  created: 'info',
  active: 'success',
  paused: 'warning',
}

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US')
}

export function FacebookPagesPage() {
  const { t, i18n } = useTranslation('facebook')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState<FacebookPageStatusFilter>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [items, setItems] = useState<FacebookPage[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<FacebookPage | null>(null)
  const [publishTarget, setPublishTarget] = useState<FacebookPage | null>(null)
  const [publishMode, setPublishMode] = useState<PublishMode>('post')
  const [deleteTarget, setDeleteTarget] = useState<FacebookPage | null>(null)
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set())

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useAbortableEffect(
    async (signal) => {
      setLoading(true)
      try {
        const list = await fetchFacebookPages(statusFilter, debouncedSearch, { signal })
        setItems(list.items)
      } catch (err) {
        if (!signal.aborted) toast.error(err instanceof Error ? err.message : t('page.loadError'))
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [statusFilter, debouncedSearch, reloadKey],
  )

  async function handleCreateOnFacebook(page: FacebookPage) {
    setBusyIds((prev) => new Set(prev).add(page.id))
    try {
      await createFacebookPageOnFacebook(page.id)
      toast.success(t('row.createdOnFacebook'))
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('row.createError'))
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(page.id)
        return next
      })
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteFacebookPage(deleteTarget.id)
      toast.success(t('delete.done'))
      setDeleteTarget(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('delete.error'))
    }
  }

  function openPublish(page: FacebookPage, mode: PublishMode) {
    setPublishMode(mode)
    setPublishTarget(page)
  }

  const statusOptions = STATUS_FILTERS.map((value) => ({ value, label: t(`status.${value}`) }))

  return (
    <PageShell>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        icon={Flag}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="size-4" />
            {t('page.add')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input value={search} placeholder={t('page.search')} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-44">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value as FacebookPageStatusFilter)}
          />
        </div>
      </div>

      <div className="card-surface scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('table.name')}</th>
              <th className="px-4 py-3 font-medium">{t('table.topic')}</th>
              <th className="px-4 py-3 font-medium">{t('table.email')}</th>
              <th className="px-4 py-3 font-medium">{t('table.status')}</th>
              <th className="px-4 py-3 font-medium">{t('table.lastPost')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((page) => {
              const busy = busyIds.has(page.id)
              const status = page.status === 'deleted' ? 'draft' : page.status
              return (
                <tr key={page.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{page.name}</p>
                    <p className="text-xs text-muted-foreground">{page.category}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{page.topic || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{page.linkedEmail}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={STATUS_TONE[status]} label={t(`status.${status}`)} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(page.lastPostAt, i18n.language)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {page.pageUrl ? (
                        <>
                          <Button variant="ghost" size="sm" title={t('row.post')} onClick={() => openPublish(page, 'post')}>
                            <ImageIcon className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title={t('row.uploadVideo')} onClick={() => openPublish(page, 'video')}>
                            <Video className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title={t('row.open')} asChild>
                            <a href={page.pageUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-4" />
                            </a>
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleCreateOnFacebook(page)}
                        >
                          <Rocket className="size-4" />
                          {busy ? t('row.creating') : t('row.createOnFacebook')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        title={tCommon('actions.edit')}
                        onClick={() => {
                          setEditing(page)
                          setFormOpen(true)
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title={tCommon('actions.delete')} onClick={() => setDeleteTarget(page)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {!loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  {t('page.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <FacebookPageFormModal open={formOpen} page={editing} onClose={() => setFormOpen(false)} onSaved={reload} />
      <FacebookPublishModal
        page={publishTarget}
        mode={publishMode}
        onClose={() => setPublishTarget(null)}
        onDone={reload}
      />
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('delete.title')}
        className="max-w-sm"
        footer={
          <>
            <Button variant="outlined" size="sm" onClick={() => setDeleteTarget(null)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleDelete()}>
              {tCommon('actions.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">{t('delete.body', { name: deleteTarget?.name ?? '' })}</p>
      </Modal>
    </PageShell>
  )
}
