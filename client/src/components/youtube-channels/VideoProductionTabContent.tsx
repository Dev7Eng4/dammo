import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchProductionCharacters,
  fetchProductionScenes,
  fetchProductionTranscript,
  regenerateMissingProductionSceneImages,
} from '../../api/videoProduction'
import { useAbortableEffect } from '../../hooks'
import { Button, useToast } from '../ui'
import type {
  ProductionCharactersResponse,
  ProductionScenesResponse,
  ProductionTranscriptResponse,
} from '../../types/videoProductionScenes'
import { CharactersPanel } from '../video-production/CharactersPanel'
import { NewCharacterCard } from './NewCharacterCard'
import { SceneTable } from '../video-production/SceneTable'
import { TranscriptPanel } from '../video-production/TranscriptPanel'

export type VideoProductionTab = 'script' | 'characters' | 'scenes'

interface VideoProductionTabContentProps {
  channelId: string
  videoId: string
  tab: VideoProductionTab
  /** Bump to reload scenes/script/characters (e.g. after regenerating scenes). */
  reloadKey?: number
  /** Shows the draft card for a new character. */
  addingCharacter?: boolean
  onAddingCharacterChange?: (adding: boolean) => void
}

function withCacheBust(url: string | null, version: number): string | null {
  if (!url) return null
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${version}`
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Script / Characters / Scenes of a video, reusing the Video Production panels.
 * Data loads once when this component mounts (the modal mounts it on the first non-video tab).
 */
export function VideoProductionTabContent({
  channelId,
  videoId,
  tab,
  reloadKey = 0,
  addingCharacter = false,
  onAddingCharacterChange,
}: VideoProductionTabContentProps) {
  const { t } = useTranslation('factory')
  const { toast } = useToast()
  const mountedRef = useRef(true)
  const [regeneratingMissing, setRegeneratingMissing] = useState(false)

  const [scenes, setScenes] = useState<ProductionScenesResponse | null>(null)
  const [scenesLoading, setScenesLoading] = useState(true)
  const [scenesError, setScenesError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<ProductionTranscriptResponse | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(true)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [characters, setCharacters] = useState<ProductionCharactersResponse | null>(null)
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [charactersError, setCharactersError] = useState<string | null>(null)
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useAbortableEffect(
    async (signal) => {
      setScenesLoading(true)
      setTranscriptLoading(true)
      setCharactersLoading(true)
      setScenesError(null)
      setTranscriptError(null)
      setCharactersError(null)

      await Promise.all([
        fetchProductionScenes(channelId, videoId, { signal })
          .then((data) => {
            if (signal.aborted) return
            setScenes(data)
            setSelectedSceneIndex(data.scenes[0]?.index ?? null)
          })
          .catch((err) => {
            if (signal.aborted) return
            setScenes(null)
            setScenesError(errorMessage(err, t('production.loadScenesError')))
          })
          .finally(() => {
            if (!signal.aborted) setScenesLoading(false)
          }),
        fetchProductionTranscript(channelId, videoId, { signal })
          .then((data) => {
            if (!signal.aborted) setTranscript(data)
          })
          .catch((err) => {
            if (signal.aborted) return
            setTranscript(null)
            setTranscriptError(errorMessage(err, t('production.loadTranscriptError')))
          })
          .finally(() => {
            if (!signal.aborted) setTranscriptLoading(false)
          }),
        fetchProductionCharacters(channelId, videoId, { signal })
          .then((data) => {
            if (!signal.aborted) setCharacters(data)
          })
          .catch((err) => {
            if (signal.aborted) return
            setCharacters(null)
            setCharactersError(errorMessage(err, t('production.loadCharactersError')))
          })
          .finally(() => {
            if (!signal.aborted) setCharactersLoading(false)
          }),
      ])
    },
    [channelId, videoId, reloadKey],
  )

  const missingImageCount = scenes ? scenes.scenes.filter((scene) => !scene.imageUrl).length : 0

  async function handleGenerateMissingImages() {
    if (!scenes || regeneratingMissing) return
    const missingIndexes = new Set(
      scenes.scenes.filter((scene) => !scene.imageUrl).map((scene) => scene.index),
    )
    const previousByIndex = new Map(scenes.scenes.map((scene) => [scene.index, scene]))
    setRegeneratingMissing(true)
    try {
      const data = await regenerateMissingProductionSceneImages(channelId, videoId)
      if (!mountedRef.current) return
      const bust = Date.now()
      setScenes({
        ...data,
        scenes: data.scenes.map((scene) => {
          if (missingIndexes.has(scene.index)) {
            return { ...scene, imageUrl: withCacheBust(scene.imageUrl, bust) }
          }
          const previousUrl = previousByIndex.get(scene.index)?.imageUrl
          return scene.imageUrl && previousUrl ? { ...scene, imageUrl: previousUrl } : scene
        }),
      })
      setScenesError(null)
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.trim()
          ? err.message
          : t('production.scene.generateMissingError'),
      )
    } finally {
      if (mountedRef.current) setRegeneratingMissing(false)
    }
  }

  if (tab === 'script') {
    return (
      <TranscriptPanel
        flush
        cues={transcript?.cues ?? []}
        loading={transcriptLoading}
        error={transcriptError}
      />
    )
  }

  if (tab === 'characters') {
    return (
      <CharactersPanel
        flush
        characters={characters?.characters ?? []}
        loading={charactersLoading}
        error={charactersError}
        leadingItem={
          addingCharacter ? (
            <NewCharacterCard
              channelId={channelId}
              videoId={videoId}
              onCancel={() => onAddingCharacterChange?.(false)}
              onCreated={(data) => {
                setCharacters(data)
                setCharactersError(null)
                onAddingCharacterChange?.(false)
              }}
            />
          ) : null
        }
      />
    )
  }

  if (scenesLoading) {
    return <p className="py-4 text-sm text-muted-foreground">{t('production.detail.loadingScenes')}</p>
  }
  if (scenesError) return <p className="py-4 text-sm text-danger">{scenesError}</p>
  if (!scenes || scenes.scenes.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{t('production.detail.noScenes')}</p>
  }

  return (
    <>
      {missingImageCount > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t('production.scene.missingCount', { count: missingImageCount })}
          </p>
          <Button
            type="button"
            disabled={regeneratingMissing}
            onClick={() => void handleGenerateMissingImages()}
          >
            {regeneratingMissing
              ? t('production.scene.generatingMissing')
              : t('production.scene.generateMissingCount', { count: missingImageCount })}
          </Button>
        </div>
      ) : null}
      <SceneTable
        flush
        channelId={channelId}
        videoId={videoId}
        scenes={scenes.scenes}
        characters={characters?.characters ?? []}
        selectedIndex={selectedSceneIndex}
        onSelect={setSelectedSceneIndex}
        regeneratingMissing={regeneratingMissing}
        onScenesUpdated={(data) => {
          setScenes(data)
          setScenesError(null)
        }}
      />
    </>
  )
}
