import fs from 'node:fs';
const edit = (f, pairs) => { let s = fs.readFileSync(f, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(f + ' missing: ' + a.slice(0, 60)); s = s.split(a).join(b); } fs.writeFileSync(f, s); };

// Page: re-check VOICEVOX while it is unavailable, and on demand.
edit('pages/ManualVideoPage.tsx', [
  [`  useAbortableEffect(async (signal) => {
    setVoicevox(await fetchVoicevoxStatus({ signal }))
  }, [])`, `  const refreshVoicevox = useCallback(async () => {
    setVoicevox(await fetchVoicevoxStatus())
  }, [])

  // VOICEVOX is often started after this page is opened, so keep checking until it answers.
  const voicevoxUp = voicevox?.available === true
  useEffect(() => {
    void refreshVoicevox().catch(() => undefined)
    if (voicevoxUp) return
    const timer = window.setInterval(() => void refreshVoicevox().catch(() => undefined), 10_000)
    return () => window.clearInterval(timer)
  }, [voicevoxUp, refreshVoicevox])`],
  [`                voicevox={voicevox}
                onDeleted`, `                voicevox={voicevox}
                onRefreshVoicevox={() => void refreshVoicevox().catch(() => undefined)}
                onDeleted`],
]);

// Detail: lock per step instead of locking everything while any step runs.
edit('components/manual-video/ProjectDetail.tsx', [
  [`  voicevox: VoicevoxStatus | null
  onDeleted: () => void`, `  voicevox: VoicevoxStatus | null
  onRefreshVoicevox: () => void
  onDeleted: () => void`],
  [`export function ProjectDetail({ run, scriptText, voicevox, onDeleted }: ProjectDetailProps) {`, `export function ProjectDetail({ run, scriptText, voicevox, onRefreshVoicevox, onDeleted }: ProjectDetailProps) {`],
  [`  const running = run.status === 'running'
  const locked = running || busy`, `  const running = run.status === 'running'
  // Voice (VOICEVOX) and images (Chrome) can run side by side; editing sources/script waits for every step.
  const activeStages: VideoAgentStage[] = run.activeStages ?? (running && run.currentStage ? [run.currentStage] : [])
  const isActive = (step: StepId) => activeStages.includes(STEP_STAGE[step])
  const locked = running || busy
  const stepLocked = (step: StepId) =>
    busy || isActive(step) || (step === 'video' ? running : isActive('video'))`],
  [`    if (running && run.currentStage === STEP_STAGE[step]) return 'running'`, `    if (isActive(step)) return 'running'`],
  [`                <Select options={speakerOptions} value={speaker} onChange={setSpeaker} searchable disabled={locked} />
              ) : (
                <p className="text-xs text-danger">{t('step.voice.unavailable', { url: voicevox?.url ?? '' })}</p>
              )}`, `                <Select options={speakerOptions} value={speaker} onChange={setSpeaker} searchable disabled={stepLocked('voice')} />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-danger">{t('step.voice.unavailable', { url: voicevox?.url ?? '' })}</p>
                  <Button size="sm" variant="secondary" onClick={onRefreshVoicevox}>
                    {t('step.voice.recheck')}
                  </Button>
                </div>
              )}`],
  [`              value={speed}
              onChange={setSpeed}
              disabled={locked}`, `              value={speed}
              onChange={setSpeed}
              disabled={stepLocked('voice')}`],
  [`            disabled={locked || !voicevox?.available}
            onClick={() => void runStep('voice'`, `            disabled={stepLocked('voice') || !voicevox?.available}
            onClick={() => void runStep('voice'`],
  [`          <Button size="sm" disabled={locked} onClick={() => void runStep('scenes')}>`, `          <Button size="sm" disabled={stepLocked('scenes')} onClick={() => void runStep('scenes')}>`],
  [`          <Button size="sm" disabled={locked} onClick={() => void runStep('video')}>`, `          <Button size="sm" disabled={stepLocked('video')} onClick={() => void runStep('video')}>`],
]);

edit('types/videoAgent.ts', [[`  /** \`manual\`: run step by step by the producer. Missing means \`agent\`. */
  mode?: 'agent' | 'manual'`, `  /** \`manual\`: run step by step by the producer. Missing means \`agent\`. */
  mode?: 'agent' | 'manual'
  /** Manual projects: every step running right now (voice and images can overlap). */
  activeStages?: VideoAgentStage[]`]]);

const L = { vi: 'Kiểm tra lại', en: 'Check again' };
for (const l of ['vi', 'en']) {
  const p = `i18n/locales/${l}/manual.json`;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.step.voice.recheck = L[l];
  j.step.voice.unavailable = l === 'vi' ? 'Chưa kết nối được VOICEVOX ({{url}}). Trang tự kiểm tra lại mỗi 10 giây.' : 'Cannot reach VOICEVOX ({{url}}). The page re-checks every 10 seconds.';
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}
