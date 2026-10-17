import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchProductionCharacters,
  fetchProductionScenes,
  fetchProductionTranscript,
} from '../../api/videoProduction'
import { useAbortableEffect } from '../../hooks'
import type {
  ProductionCharactersResponse,
  ProductionScenesResponse,
  ProductionTranscriptResponse,
} from '../../types/videoProductionScenes'
import { CharactersPanel } from '../video-production/CharactersPanel'
import { SceneTable } from '../video-production/SceneTable'
import { TranscriptPanel } from '../video-production/TranscriptPanel'

export type VideoProductionTab = 'script' | 'characters' | 'scenes'

interface VideoProductionTabContentProps {
  channelId: string
  videoId: string
  tab: VideoProductionTab
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Script / Characters / Scenes of a video, reusing the Video Production panels.
 * Data loads once when this component mounts (the modal mounts it on the first non-video tab).
 */
export function VideoProductionTabContent({ channelId, videoId, tab }: VideoProductionTabContentProps) {
  const { t } = useTranslation('factory')

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
    [channelId, videoId],
  )

  if (tab === 'script') {
    return (
      <TranscriptPanel
        cues={transcript?.cues ?? []}
        loading={transcriptLoading}
        error={transcriptError}
      />
    )
  }

  if (tab === 'characters') {
    return (
      <CharactersPanel
        characters={characters?.characters ?? []}
        loading={charactersLoading}
        error={charactersError}
      />
    )
  }

  if (scenesLoading) {
    return <p className="py-6 text-sm text-muted-foreground">{t('production.detail.loadingScenes')}</p>
  }
  if (scenesError) return <p className="py-6 text-sm text-danger">{scenesError}</p>
  if (!scenes || scenes.scenes.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{t('production.detail.noScenes')}</p>
  }

  return (
    <SceneTable
      channelId={channelId}
      videoId={videoId}
      scenes={scenes.scenes}
      characters={characters?.characters ?? []}
      selectedIndex={selectedSceneIndex}
      onSelect={setSelectedSceneIndex}
      onScenesUpdated={(data) => {
        setScenes(data)
        setScenesError(null)
      }}
    />
  )
}
