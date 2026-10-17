import { ImagePlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addProductionCharacter, uploadProductionCharacterImage } from '../../api/videoProduction'
import type { ProductionCharactersResponse } from '../../types/videoProductionScenes'
import { Button, Input, Textarea, useToast } from '../ui'

interface NewCharacterCardProps {
  channelId: string
  videoId: string
  onCreated: (data: ProductionCharactersResponse) => void
  onCancel: () => void
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Draft card for a new character: image box + name + prompt, saved in one go. */
export function NewCharacterCard({ channelId, videoId, onCreated, onCancel }: NewCharacterCardProps) {
  const { t } = useTranslation('factory')
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [image, setImage] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(image)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error(t('production.characters.nameRequired'))
      return
    }

    setSaving(true)
    try {
      let result = await addProductionCharacter(channelId, videoId, { name: trimmed, prompt })
      if (image) {
        // The new character is the last entry returned by the server.
        const created = result.characters[result.characters.length - 1]
        if (created) {
          result = await uploadProductionCharacterImage(channelId, videoId, created.id, image)
        }
      }
      toast.success(t('production.characters.saved'))
      onCreated(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('production.characters.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-dashed border-primary-500/50 bg-surface">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        disabled={saving}
        onChange={(event) => setImage(event.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={saving}
        className="relative flex h-[180px] w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-60"
        aria-label={t('production.characters.uploadImage')}
      >
        {previewUrl ? (
          <>
            <img src={previewUrl} alt="" className="size-full object-cover" />
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
              {t('production.characters.changeImage')}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1 text-sm">
            <ImagePlus className="size-6" aria-hidden="true" />
            {t('production.characters.uploadImage')}
          </span>
        )}
      </button>

      <div className="space-y-2 p-3">
        <p className="section-label">{t('production.characters.newTitle')}</p>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('production.characters.namePlaceholder')}
          disabled={saving}
          maxLength={80}
        />
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('production.characters.promptPlaceholder')}
          disabled={saving}
          rows={5}
        />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outlined" size="sm" onClick={onCancel} disabled={saving}>
            {t('production.characters.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? t('production.characters.saving') : t('production.characters.save')}
          </Button>
        </div>
      </div>
    </article>
  )
}
