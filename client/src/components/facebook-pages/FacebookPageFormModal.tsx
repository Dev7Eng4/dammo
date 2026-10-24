import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchMailAccounts } from '../../api/mailAccounts'
import { fetchNiches } from '../../api/niches'
import { createFacebookPage, fetchFacebookPages, updateFacebookPage } from '../../api/facebookPages'
import { Button, Input, Modal, Select, Textarea, useToast } from '../ui'
import type { FacebookPage, FacebookPageFormValues } from '../../types/facebookPage'
import type { MailAccount } from '../../types/mailAccount'
import type { Niche } from '../../types/niche'

interface FacebookPageFormModalProps {
  open: boolean
  /** When set, the modal edits this page instead of creating one. */
  page?: FacebookPage | null
  onClose: () => void
  onSaved: () => void
}

const EMPTY_VALUES: FacebookPageFormValues = {
  name: '',
  topic: '',
  category: '',
  bio: '',
  mailAccountId: '',
  pageUrl: '',
  notes: '',
}

export function FacebookPageFormModal({ open, page, onClose, onSaved }: FacebookPageFormModalProps) {
  const { t } = useTranslation('facebook')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [values, setValues] = useState<FacebookPageFormValues>(EMPTY_VALUES)
  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([])
  const [niches, setNiches] = useState<Niche[]>([])
  const [usedEmails, setUsedEmails] = useState<Set<string>>(() => new Set())
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const { signal } = controller
    setOptionsLoading(true)
    void Promise.all([
      fetchMailAccounts('', 1, 200, { signal }),
      fetchNiches({ signal }),
      fetchFacebookPages('all', '', { signal }),
    ])
      .then(([mail, nicheList, pages]) => {
        setMailAccounts(mail.items)
        setNiches(nicheList.items)
        setUsedEmails(
          new Set(
            pages.items
              .filter((item) => item.id !== page?.id)
              .map((item) => item.linkedEmail.toLowerCase()),
          ),
        )
      })
      .catch(() => undefined)
      .finally(() => {
        if (!signal.aborted) setOptionsLoading(false)
      })
    return () => controller.abort()
  }, [open, page?.id])

  useEffect(() => {
    if (!open) return
    setValues(
      page
        ? {
            name: page.name,
            topic: page.topic,
            category: page.category,
            bio: page.bio,
            mailAccountId: mailAccounts.find((m) => m.email === page.linkedEmail)?.id ?? '',
            pageUrl: page.pageUrl,
            notes: page.notes ?? '',
          }
        : EMPTY_VALUES,
    )
  }, [open, page, mailAccounts])

  function set<K extends keyof FacebookPageFormValues>(key: K, value: FacebookPageFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit() {
    if (!values.name.trim() || !values.mailAccountId) {
      toast.error(t('form.required'))
      return
    }
    setSaving(true)
    try {
      if (page) await updateFacebookPage(page.id, values)
      else await createFacebookPage(values)
      toast.success(t('form.saved'))
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('form.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const mailOptions = mailAccounts
    .filter((m) => m.platformLinks.facebook !== 'deleted' && !usedEmails.has(m.email.toLowerCase()))
    .map((m) => ({ value: m.id, label: m.email }))
  const nicheOptions = niches.map((n) => ({ value: n.key, label: n.label }))

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={page ? t('form.editTitle') : t('form.addTitle')}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outlined" size="sm" onClick={onClose} disabled={saving}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? tCommon('actions.saving') : tCommon('actions.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t('form.name')}</span>
          <Input value={values.name} maxLength={75} onChange={(e) => set('name', e.target.value)} />
        </label>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t('form.email')}</span>
          <Select
            options={mailOptions}
            value={values.mailAccountId}
            onChange={(v) => set('mailAccountId', v)}
            placeholder={
              optionsLoading
                ? t('form.emailLoading')
                : mailOptions.length === 0
                  ? t('form.emailEmpty')
                  : t('form.emailPlaceholder')
            }
            searchPlaceholder={t('form.emailSearch')}
            searchable
            disabled={saving || optionsLoading || mailOptions.length === 0}
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t('form.topic')}</span>
          <Select
            options={nicheOptions}
            value={values.topic}
            onChange={(v) => set('topic', v)}
            placeholder={t('form.topicPlaceholder')}
            searchable
            clearable
          />
          <p className="text-xs text-muted-foreground">{t('form.topicHint')}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t('form.category')}</span>
          <Input
            value={values.category}
            placeholder={t('form.categoryPlaceholder')}
            onChange={(e) => set('category', e.target.value)}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t('form.bio')}</span>
          <Textarea rows={3} maxLength={255} value={values.bio} onChange={(e) => set('bio', e.target.value)} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t('form.pageUrl')}</span>
          <Input
            value={values.pageUrl}
            placeholder="https://www.facebook.com/..."
            onChange={(e) => set('pageUrl', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('form.pageUrlHint')}</p>
        </label>
      </div>
    </Modal>
  )
}
