import { Activity, AlertTriangle, BrainCircuit, ExternalLink, Flame, Maximize2, Play, Search, Square, Trash2, Workflow, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BRAINS_STREAM_URL, cancelBrain, cancelPipeline, fetchBrains, forgetBrain, runBrain, runPipeline, setBrainAutoInterval } from '../api/brains'
import { BrainMap } from '../components/brains/BrainMap'
import { KIND_COLOR, KIND_LABEL, KIND_SECTION, videoIdOf } from '../components/brains/neuronKinds'
import { useToast } from '../components/ui'
import { cn } from '../lib/cn'
import type { Brain, BrainEvent, Neuron, PipelineStatus, Pulse, PulseKind } from '../types/brains'

const PULSE_LABEL: Record<PulseKind, string> = {
  start: 'BẮT ĐẦU',
  think: 'NGHĨ',
  search: 'TÌM',
  found: 'GHI NHỚ',
  error: 'LỖI',
  done: 'XONG',
}
const PULSE_COLOR: Record<PulseKind, string> = {
  start: 'text-sky-300',
  think: 'text-slate-400',
  search: 'text-cyan-300',
  found: 'text-emerald-300',
  error: 'text-red-400',
  done: 'text-amber-300',
}
const STATUS_LABEL: Record<Brain['status'], string> = { idle: 'Sẵn sàng', running: 'Đang chạy', error: 'Lỗi', dormant: 'Chưa xây' }
const AUTO_OPTIONS = [0, 2, 4, 6, 12, 24]

function formatTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('vi-VN')
}

function Panel({ title, icon, children, className, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn('flex min-h-0 flex-col rounded-xl border border-slate-700/50 bg-slate-900/60', className)}>
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        {icon}
        <h3 className="text-[11px] font-semibold tracking-[0.18em] text-slate-200 uppercase">{title}</h3>
        <div className="ml-auto">{action}</div>
      </header>
      {children}
    </section>
  )
}

function HeatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, value)}%`, background: color }} />
    </div>
  )
}

export function BrainsPage() {
  const { toast } = useToast()
  const rootRef = useRef<HTMLDivElement>(null)
  const [brains, setBrains] = useState<Brain[]>([])
  const [neurons, setNeurons] = useState<Neuron[]>([])
  const [pulses, setPulses] = useState<Pulse[]>([])
  const [stats, setStats] = useState({ pulses24h: 0, errors24h: 0 })
  const [flashes, setFlashes] = useState<Record<string, number>>({})
  const [selectedBrainId, setSelectedBrainId] = useState<string>()
  const [selectedNeuron, setSelectedNeuron] = useState<Neuron>()
  const [query, setQuery] = useState('')
  const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [loadError, setLoadError] = useState<string>()
  const [now, setNow] = useState(() => Date.now())
  const [pipeline, setPipeline] = useState<PipelineStatus>({ running: false, order: [] })

  useEffect(() => {
    const controller = new AbortController()
    fetchBrains({ signal: controller.signal })
      .then((snapshot) => {
        setBrains(snapshot.brains)
        setNeurons(snapshot.neurons)
        setPulses(snapshot.pulses)
        setStats(snapshot.stats)
        setPipeline(snapshot.pipeline)
        setSelectedBrainId((current) => current ?? snapshot.brains.find((b) => b.active)?.id)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(err instanceof Error ? err.message : String(err))
      })

    const source = new EventSource(BRAINS_STREAM_URL)
    const parse = (event: MessageEvent) => JSON.parse(event.data) as BrainEvent
    source.addEventListener('brain_updated', (event) => {
      const data = parse(event as MessageEvent)
      if (data.type === 'brain_updated') setBrains((list) => list.map((b) => (b.id === data.brain.id ? data.brain : b)))
    })
    source.addEventListener('pipeline', (event) => {
      const data = parse(event as MessageEvent)
      if (data.type === 'pipeline') setPipeline({ running: data.running, current: data.current, order: data.order })
    })
    source.addEventListener('pulse', (event) => {
      const data = parse(event as MessageEvent)
      if (data.type !== 'pulse') return
      setPulses((list) => [...list.slice(-499), data.pulse])
      setStats((s) => ({ pulses24h: s.pulses24h + 1, errors24h: s.errors24h + (data.pulse.kind === 'error' ? 1 : 0) }))
      setFlashes((f) => ({ ...f, [data.pulse.brainId]: Date.now() }))
    })
    source.addEventListener('neurons', (event) => {
      const data = parse(event as MessageEvent)
      if (data.type !== 'neurons') return
      setNeurons((list) => {
        if (data.neurons.length === 0) return list.filter((n) => n.brainId !== data.brainId)
        const byId = new Map(list.map((n) => [n.id, n]))
        for (const n of data.neurons) byId.set(n.id, n)
        return [...byId.values()]
      })
      setBrains((list) => list.map((b) => (b.id === data.brainId && data.neurons.length === 0 ? { ...b, neuronCount: 0 } : b)))
    })
    return () => {
      controller.abort()
      source.close()
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [])

  // Neuron counts come from the live neuron list so the map labels stay current.
  const brainsWithCounts = useMemo(
    () => brains.map((b) => ({ ...b, neuronCount: neurons.filter((n) => n.brainId === b.id).length })),
    [brains, neurons],
  )

  const selectedBrain = brainsWithCounts.find((b) => b.id === selectedBrainId)
  const filteredNeurons = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return neurons
    return neurons.filter((n) => `${n.label} ${n.labelJa ?? ''} ${n.detail} ${n.meta?.channel ?? ''}`.toLowerCase().includes(q))
  }, [neurons, query])

  const pulsesPerMin = pulses.filter((p) => now - Date.parse(p.at) < 60_000).length
  const lastRun = brainsWithCounts.map((b) => b.lastRunAt).filter(Boolean).sort().at(-1)
  const kindCount = (kind: Neuron['kind']) => neurons.filter((n) => n.kind === kind).length

  async function act<T>(fn: () => Promise<T>, ok?: string) {
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleKind(kind: string) {
    setHiddenKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  const linked = selectedNeuron
    ? neurons.filter(
        (n) => n.id !== selectedNeuron.id && (selectedNeuron.links.includes(n.key) || n.links.includes(selectedNeuron.key)),
      )
    : []

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-[#070b16] p-4 text-slate-200">
      <div className="flex items-center gap-3">
        <Activity className="size-4 text-violet-300" />
        <h1 className="text-sm font-bold tracking-[0.16em] uppercase">
          Bản đồ não sống — {brains.length} bộ não, điều đã học và xung thần kinh thời gian thực
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {pipeline.running ? (
            <button
              onClick={() => act(() => cancelPipeline())}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500"
            >
              <Square className="size-3.5" /> Dừng dây chuyền
              {pipeline.current && <span className="font-normal opacity-80">— đang: {brains.find((b) => b.id === pipeline.current)?.name}</span>}
            </button>
          ) : (
            <button
              onClick={() => {
                if (window.confirm(`Chạy lần lượt ${pipeline.order.length} bộ não (mỗi não là một lượt Claude, tốn phí)?`)) {
                  void act(() => runPipeline(notes.trim() || undefined), 'Dây chuyền đã khởi động')
                }
              }}
              title={pipeline.order.map((id) => brains.find((b) => b.id === id)?.name ?? id).join(' → ')}
              className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400"
            >
              <Workflow className="size-3.5" /> Chạy cả dây chuyền ({pipeline.order.length} não)
            </button>
          )}
        </div>
        <button
          className="flex items-center gap-1.5 rounded-lg border border-slate-600/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen())}
        >
          <Maximize2 className="size-3.5" /> Toàn màn hình
        </button>
      </div>

      {loadError && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{loadError}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)_340px] gap-3">
        {/* Left: brains */}
        <Panel title="Não bộ phận" icon={<BrainCircuit className="size-4 text-violet-300" />}>
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5">
              <Search className="size-3.5 text-slate-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm nơ-ron, kênh, chủ đề…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-500"
              />
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
            <button
              onClick={() => {
                setSelectedBrainId(undefined)
                setSelectedNeuron(undefined)
              }}
              className={cn('w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-400 hover:bg-slate-800', !selectedBrainId && 'bg-slate-800 text-slate-100')}
            >
              ◎ Não trung tâm (toàn bộ)
            </button>
            {brainsWithCounts.map((brain) => (
              <button
                key={brain.id}
                onClick={() => {
                  setSelectedBrainId(brain.id)
                  setSelectedNeuron(undefined)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-800',
                  brain.id === selectedBrainId && 'bg-slate-800',
                  !brain.active && 'opacity-55',
                )}
              >
                <span className={cn('size-2.5 shrink-0 rounded-full', brain.status === 'running' && 'animate-ping')} style={{ background: brain.color }} />
                <span className="min-w-0 flex-1 truncate">{brain.name}</span>
                <span className="text-[10px] text-slate-500">{brain.active ? brain.neuronCount : 'sắp có'}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-slate-800 px-3 py-3">
            <div className="text-[10px] tracking-widest text-slate-500 uppercase">Loại nơ-ron — bấm để ẩn/hiện</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(KIND_LABEL) as Neuron['kind'][]).filter((kind) => kindCount(kind) > 0 || kind === 'topic' || kind === 'video').map((kind) => (
                <button
                  key={kind}
                  onClick={() => toggleKind(kind)}
                  className={cn('flex items-center gap-1.5 rounded-full border border-slate-700 px-2.5 py-1 text-[11px]', hiddenKinds.has(kind) && 'opacity-40 line-through')}
                >
                  <span className="size-2 rounded-full" style={{ background: KIND_COLOR[kind] }} />
                  {KIND_LABEL[kind]} <b>{kindCount(kind)}</b>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {/* Centre: stats + map */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-5 divide-x divide-slate-700/50 rounded-xl border border-slate-700/50 bg-slate-900/60 py-2.5">
            {[
              { icon: <Activity className="size-3.5" />, label: 'Xung 24 giờ', value: formatNumber(stats.pulses24h), color: 'text-emerald-300' },
              { icon: <AlertTriangle className="size-3.5" />, label: 'Lỗi 24 giờ', value: formatNumber(stats.errors24h), color: 'text-red-300' },
              { icon: <Flame className="size-3.5" />, label: 'Nơ-ron đã học', value: formatNumber(neurons.length), color: 'text-sky-300' },
              { icon: <BrainCircuit className="size-3.5" />, label: 'Lần quét gần nhất', value: formatTime(lastRun), color: 'text-violet-300' },
              { icon: <Zap className="size-3.5" />, label: 'Xung / phút', value: String(pulsesPerMin), color: 'text-amber-300' },
            ].map((s) => (
              <div key={s.label} className="px-4">
                <div className="flex items-center gap-1.5 text-[10px] tracking-widest text-slate-500 uppercase">
                  {s.icon} {s.label}
                </div>
                <div className={cn('mt-0.5 text-xl font-bold', s.color)}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700/40 bg-[radial-gradient(ellipse_at_center,#1e1b4b55,transparent_70%)]">
            <BrainMap
              brains={brainsWithCounts}
              neurons={filteredNeurons}
              flashes={flashes}
              selectedBrainId={selectedBrainId}
              selectedNeuronId={selectedNeuron?.id}
              hiddenKinds={hiddenKinds}
              onSelectBrain={(id) => {
                setSelectedBrainId(id)
                setSelectedNeuron(undefined)
              }}
              onSelectNeuron={(n) => {
                setSelectedNeuron(n)
                setSelectedBrainId(n.brainId)
              }}
            />
            <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-500">
              Kéo để xoay · lăn chuột để phóng to · bấm chấm sáng để đọc nơ-ron · bấm tên não để bay tới
            </div>
          </div>
        </div>

        {/* Right: detail */}
        <Panel title={selectedNeuron ? KIND_LABEL[selectedNeuron.kind] : selectedBrain ? selectedBrain.name : 'Bản đồ não 3D'} className="overflow-hidden">
          <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 text-[13px] leading-relaxed">
            {selectedNeuron ? (
              <>
                <button className="text-xs text-violet-300 hover:underline" onClick={() => setSelectedNeuron(undefined)}>
                  ← về bộ não
                </button>
                {selectedNeuron.kind === 'video' && (
                  <img
                    src={`https://i.ytimg.com/vi/${videoIdOf(selectedNeuron.key)}/mqdefault.jpg`}
                    alt=""
                    className="w-full rounded-lg"
                  />
                )}
                <div>
                  <div className="font-semibold text-slate-100">{selectedNeuron.label}</div>
                  {selectedNeuron.labelJa && selectedNeuron.labelJa !== selectedNeuron.label && (
                    <div className="mt-0.5 text-slate-400">{selectedNeuron.labelJa}</div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Độ nóng</span>
                    <b className="text-slate-200">{selectedNeuron.heat}/100</b>
                  </div>
                  <HeatBar value={selectedNeuron.heat} color={KIND_COLOR[selectedNeuron.kind]} />
                </div>
                {selectedNeuron.detail && <p className="whitespace-pre-line text-slate-300">{selectedNeuron.detail}</p>}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-slate-500">Gặp</dt>
                  <dd>{selectedNeuron.hits} lần</dd>
                  <dt className="text-slate-500">Lần đầu</dt>
                  <dd>{formatTime(selectedNeuron.firstSeenAt)}</dd>
                  <dt className="text-slate-500">Gần nhất</dt>
                  <dd>{formatTime(selectedNeuron.lastSeenAt)}</dd>
                  <dt className="text-slate-500">Bộ não</dt>
                  <dd>{brains.find((b) => b.id === selectedNeuron.brainId)?.name}</dd>
                  {selectedNeuron.meta?.subscribers && (
                    <>
                      <dt className="text-slate-500">Người đăng ký</dt>
                      <dd>{String(selectedNeuron.meta.subscribers).replace('チャンネル登録者数', '').trim()}</dd>
                    </>
                  )}
                  {selectedNeuron.meta?.channel && (
                    <>
                      <dt className="text-slate-500">Kênh</dt>
                      <dd>{String(selectedNeuron.meta.channel)}</dd>
                      <dt className="text-slate-500">Lượt xem</dt>
                      <dd>{formatNumber(Number(selectedNeuron.meta.views))}</dd>
                      <dt className="text-slate-500">View / giờ</dt>
                      <dd className="font-semibold text-amber-300">{formatNumber(Number(selectedNeuron.meta.viewsPerHour))}</dd>
                      <dt className="text-slate-500">Đăng</dt>
                      <dd>{String(selectedNeuron.meta.published)}</dd>
                    </>
                  )}
                </dl>
                {selectedNeuron.url && (
                  <a href={selectedNeuron.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
                    {selectedNeuron.kind === 'keyword' ? 'Tìm trên YouTube' : 'Mở trên YouTube'} <ExternalLink className="size-3" />
                  </a>
                )}
                {linked.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] tracking-widest text-slate-500 uppercase">Liên kết</div>
                    {linked.map((n) => (
                      <button key={n.id} onClick={() => setSelectedNeuron(n)} className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-slate-800">
                        <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: KIND_COLOR[n.kind] }} />
                        {n.label}
                        {n.brainId !== selectedNeuron.brainId && (
                          <span className="ml-1.5 text-[10px] text-slate-500">· {brains.find((b) => b.id === n.brainId)?.name}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : selectedBrain ? (
              <BrainDetail
                brain={selectedBrain}
                notes={notes}
                setNotes={setNotes}
                neurons={filteredNeurons.filter((n) => n.brainId === selectedBrain.id).sort((a, b) => b.heat - a.heat || b.hits - a.hits)}
                brains={brainsWithCounts}
                onSelectBrain={(id) => setSelectedBrainId(id)}
                onSelect={setSelectedNeuron}
                onRun={() => act(() => runBrain(selectedBrain.id, notes.trim() || undefined), 'Đã đánh thức bộ não')}
                onCancel={() => act(() => cancelBrain(selectedBrain.id))}
                onForget={() => {
                  if (window.confirm('Xoá toàn bộ nơ-ron đã học của bộ não này?')) void act(() => forgetBrain(selectedBrain.id), 'Đã xoá trí nhớ')
                }}
                onAuto={(hours) => act(() => setBrainAutoInterval(selectedBrain.id, hours))}
              />
            ) : (
              <div className="space-y-3 text-slate-300">
                <p>
                  Mỗi <b>bộ não</b> là một AI agent làm một việc trong dây chuyền kênh. Mỗi <b>chấm sáng</b> là một nơ-ron — một điều bộ não đã học (chủ đề, video, kênh,
                  thấu hiểu khán giả, ý tưởng, tiêu đề, công thức, brief kịch bản, cấu hình đề xuất, lịch đăng, chỉ số, việc nên làm). <b>Màu</b> = bộ não đã học nó.
                </p>
                <p>
                  <b>To</b> = gặp nhiều lần, <b>sáng</b> = nóng và mới, <b>mờ</b> = cũ. <b>Dây vàng</b> nối chủ đề với video bằng chứng khi chủ đề xuất hiện ≥ 2 lần quét.
                </p>
                <p>
                  <b>Dây tím</b> giữa các não = não sau đọc trí nhớ của não trước; dây chạy sáng khi não sau đang làm việc. Dây chuyền: Xu hướng → Đối thủ → Khán giả → Ý
                  tưởng → Tiêu đề → Bìa → Kịch bản → Giọng đọc → Ảnh/clip → Dựng → Đăng → Chỉ số kênh → Tăng trưởng.
                </p>
                <p>
                  Não đang chạy sẽ chớp sáng theo từng xung (tìm kiếm, suy nghĩ, ghi nhớ). Các não từ Kịch bản trở đi chỉ phân tích và đề xuất — render vẫn do Agent tạo
                  video làm, tải lên vẫn do bạn hoặc mô-đun upload làm.
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* Bottom: pulse feed */}
      <Panel
        title="Xung thần kinh"
        icon={<Zap className="size-4 text-amber-300" />}
        className="h-[190px] shrink-0"
        action={<span className="text-[11px] text-slate-500">{pulsesPerMin} xung trong 60 giây · trực tiếp</span>}
      >
        <PulseFeed pulses={pulses} brains={brainsWithCounts} />
      </Panel>
    </div>
  )
}

function PulseFeed({ pulses, brains }: { pulses: Pulse[]; brains: Brain[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const recent = pulses.slice(-200).reverse()
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
  }, [pulses.length])
  return (
    <div ref={ref} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2 font-mono text-[12px]">
      {recent.length === 0 && <div className="px-2 py-4 text-slate-500">Chưa có xung nào — đánh thức một bộ não để bắt đầu.</div>}
      {recent.map((pulse) => {
        const brain = brains.find((b) => b.id === pulse.brainId)
        return (
          <div key={pulse.id} className="grid grid-cols-[96px_170px_72px_minmax(0,1fr)] items-center gap-2 rounded px-2 py-0.5 even:bg-slate-800/30" title={pulse.text}>
            <span className="text-slate-500">{formatTime(pulse.at)}</span>
            <span className="flex items-center gap-1.5 truncate font-sans font-semibold text-slate-200">
              <span className="size-2 shrink-0 rounded-full" style={{ background: brain?.color }} />
              {brain?.name ?? pulse.brainId}
            </span>
            <span className={cn('text-[11px] font-semibold', PULSE_COLOR[pulse.kind])}>{PULSE_LABEL[pulse.kind]}</span>
            <span className="truncate font-sans text-slate-300">{pulse.text.replace(/\s+/g, ' ')}</span>
          </div>
        )
      })}
    </div>
  )
}

interface BrainDetailProps {
  brain: Brain
  notes: string
  setNotes: (v: string) => void
  neurons: Neuron[]
  brains: Brain[]
  onSelectBrain: (id: string) => void
  onSelect: (n: Neuron) => void
  onRun: () => void
  onCancel: () => void
  onForget: () => void
  onAuto: (hours: number) => void
}

function BrainDetail({ brain, notes, setNotes, neurons, brains, onSelectBrain, onSelect, onRun, onCancel, onForget, onAuto }: BrainDetailProps) {
  const running = brain.status === 'running'
  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        <span className="size-2.5 rounded-full" style={{ background: brain.color }} />
        <span className="text-slate-400">{brain.department}</span>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-[11px]',
            running ? 'bg-emerald-500/15 text-emerald-300' : brain.status === 'error' ? 'bg-red-500/15 text-red-300' : 'bg-slate-700/50 text-slate-300',
          )}
        >
          {STATUS_LABEL[brain.status]}
        </span>
      </div>
      <p className="text-slate-300">{brain.description}</p>
      {brain.feeds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
          Đọc từ:
          {brain.feeds.map((id) => {
            const source = brains.find((b) => b.id === id)
            return (
              <button key={id} onClick={() => onSelectBrain(id)} className="flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 hover:bg-slate-800">
                <span className="size-1.5 rounded-full" style={{ background: source?.color }} />
                {source?.name ?? id}
              </button>
            )
          })}
        </div>
      )}

      {brain.active ? (
        <>
          {brain.lastError && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">{brain.lastError}</div>}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Ghi chú cho lần quét (tuỳ chọn), vd: tập trung 人間関係 và お金"
            className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-xs outline-none placeholder:text-slate-500 focus:border-violet-400"
          />
          <div className="flex gap-2">
            {running ? (
              <button onClick={onCancel} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500">
                <Square className="size-3.5" /> Dừng
              </button>
            ) : (
              <button onClick={onRun} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400">
                <Play className="size-3.5" /> Đánh thức — quét ngay
              </button>
            )}
            <button onClick={onForget} title="Xoá trí nhớ" className="rounded-lg border border-slate-700 px-2.5 text-slate-400 hover:text-red-300">
              <Trash2 className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <span className="text-slate-500">Tự chạy</span>
            <select
              value={brain.autoIntervalHours}
              onChange={(e) => onAuto(Number(e.target.value))}
              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-xs"
            >
              {AUTO_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h === 0 ? 'Tắt' : `Mỗi ${h} giờ`}
                </option>
              ))}
            </select>
            <span className="text-slate-500">Số lần chạy</span>
            <span>{brain.runs}</span>
            <span className="text-slate-500">Lần gần nhất</span>
            <span>{formatTime(brain.lastRunAt)}</span>
            <span className="text-slate-500">Chi phí Claude</span>
            <span>${brain.usage.costUsd.toFixed(3)}</span>
          </div>

          {KIND_SECTION.map(([kind, title]) => {
            const items = neurons.filter((n) => n.kind === kind)
            if (kind === 'keyword') {
              if (items.length === 0) return null
              return (
                <div key={kind} className="space-y-1.5">
                  <div className="text-[10px] tracking-widest text-slate-500 uppercase">{title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {items.slice(0, 20).map((k) => (
                      <button key={k.id} onClick={() => onSelect(k)} title={k.detail} className="rounded-full border border-lime-400/30 bg-lime-400/5 px-2 py-0.5 text-[11px] text-lime-200 hover:bg-lime-400/15">
                        {k.labelJa ?? k.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            }
            return <NeuronList key={kind} title={title} items={items} color={KIND_COLOR[kind]} onSelect={onSelect} video={kind === 'video'} />
          })}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-700 px-3 py-3 text-xs text-slate-400">
          Bộ não này chưa được xây. Khi xây xong, nó sẽ đọc trí nhớ của các não ở mục «Đọc từ».
        </div>
      )}
    </>
  )
}

function NeuronList({ title, items, color, onSelect, video }: { title: string; items: Neuron[]; color: string; onSelect: (n: Neuron) => void; video?: boolean }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] tracking-widest text-slate-500 uppercase">
        {title} ({items.length})
      </div>
      {items.slice(0, 15).map((n) => (
        <button key={n.id} onClick={() => onSelect(n)} className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left hover:bg-slate-800/70">
          {video && <img src={`https://i.ytimg.com/vi/${videoIdOf(n.key)}/default.jpg`} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="line-clamp-2 text-xs text-slate-200">{n.label}</div>
            {!video && n.labelJa && n.labelJa !== n.label && <div className="line-clamp-1 text-[11px] text-slate-400">{n.labelJa}</div>}
            <div className="flex items-center gap-2">
              <HeatBar value={n.heat} color={color} />
              <span className="shrink-0 text-[10px] text-slate-500">
                {video && n.meta?.viewsPerHour ? `${formatNumber(Number(n.meta.viewsPerHour))}/h` : `${n.heat}`}
                {n.hits > 1 && ` ×${n.hits}`}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
