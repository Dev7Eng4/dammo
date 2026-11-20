import { useEffect, useRef } from 'react'
import type { Brain, Neuron } from '../../types/brains'

interface Vec3 {
  x: number
  y: number
  z: number
}

interface MapPoint extends Vec3 {
  color: string
  size: number
  alpha: number
  neuron?: Neuron
  brainId?: string
}

export interface BrainMapProps {
  brains: Brain[]
  neurons: Neuron[]
  /** brainId → time (ms) of its latest pulse; drives the flash. */
  flashes: Record<string, number>
  selectedBrainId?: string
  selectedNeuronId?: string
  hiddenKinds: Set<string>
  onSelectBrain: (id: string) => void
  onSelectNeuron: (neuron: Neuron) => void
}

/** Deterministic 0..1 from a string, so neurons keep their place between renders. */
function hash(text: string, salt = 0): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

const RADII = { x: 1.35, y: 0.95, z: 1.1 }

/** Brain centres spread through the volume on a Fibonacci sphere. */
function brainCentre(index: number, total: number): Vec3 {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = 1 - ((index + 0.5) / total) * 2
  const r = Math.sqrt(1 - y * y)
  const theta = golden * index
  return { x: Math.cos(theta) * r * RADII.x * 0.68, y: y * RADII.y * 0.62, z: Math.sin(theta) * r * RADII.z * 0.68 }
}

function scatter(centre: Vec3, key: string, spread: number): Vec3 {
  const u = hash(key, 1) * Math.PI * 2
  const v = Math.acos(2 * hash(key, 2) - 1)
  const d = Math.cbrt(hash(key, 3)) * spread
  return {
    x: centre.x + Math.sin(v) * Math.cos(u) * d,
    y: centre.y + Math.cos(v) * d * 0.8,
    z: centre.z + Math.sin(v) * Math.sin(u) * d,
  }
}

function dust(): MapPoint[] {
  const points: MapPoint[] = []
  for (let i = 0; i < 900; i += 1) {
    const key = `dust${i}`
    const u = hash(key, 4) * Math.PI * 2
    const v = Math.acos(2 * hash(key, 5) - 1)
    const shell = 0.82 + hash(key, 6) * 0.18
    let x = Math.sin(v) * Math.cos(u) * RADII.x * shell
    // A soft groove between the two hemispheres.
    x += Math.sign(x || 1) * 0.06
    points.push({
      x,
      y: Math.cos(v) * RADII.y * shell * (v > 2.3 ? 0.75 : 1),
      z: Math.sin(v) * Math.sin(u) * RADII.z * shell,
      color: '#94a3b8',
      size: 0.8,
      alpha: 0.18 + hash(key, 7) * 0.2,
    })
  }
  return points
}

const DUST = dust()

const spriteCache = new Map<string, HTMLCanvasElement>()

function glowSprite(color: string): HTMLCanvasElement {
  const cached = spriteCache.get(color)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.15, color)
  gradient.addColorStop(0.45, `${color}55`)
  gradient.addColorStop(1, `${color}00`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  spriteCache.set(color, canvas)
  return canvas
}

const HOUR = 3600 * 1000

export function BrainMap(props: BrainMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  })
  const view = useRef({ yaw: 0.6, pitch: -0.25, zoom: 1, target: null as Vec3 | null, centre: { x: 0, y: 0, z: 0 } })
  const projected = useRef<{ sx: number; sy: number; r: number; neuron?: Neuron; brainId?: string; label?: boolean; w?: number }[]>([])

  useEffect(() => {
    const target = props.selectedBrainId
    if (!target) {
      view.current.target = { x: 0, y: 0, z: 0 }
      return
    }
    const index = props.brains.findIndex((b) => b.id === target)
    if (index >= 0) view.current.target = brainCentre(index, props.brains.length)
  }, [props.selectedBrainId, props.brains])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let frame = 0
    let dragging: { x: number; y: number; moved: boolean } | null = null

    const onDown = (e: PointerEvent) => {
      dragging = { x: e.clientX, y: e.clientY, moved: false }
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) {
        const rect = canvas.getBoundingClientRect()
        const hit = pick(e.clientX - rect.left, e.clientY - rect.top)
        canvas.style.cursor = hit ? 'pointer' : 'grab'
        return
      }
      const dx = e.clientX - dragging.x
      const dy = e.clientY - dragging.y
      if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true
      view.current.yaw += dx * 0.006
      view.current.pitch = Math.max(-1.3, Math.min(1.3, view.current.pitch + dy * 0.006))
      dragging.x = e.clientX
      dragging.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      const wasClick = dragging && !dragging.moved
      dragging = null
      if (!wasClick) return
      const rect = canvas.getBoundingClientRect()
      const hit = pick(e.clientX - rect.left, e.clientY - rect.top)
      if (hit?.neuron) propsRef.current.onSelectNeuron(hit.neuron)
      else if (hit?.brainId) propsRef.current.onSelectBrain(hit.brainId)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      view.current.zoom = Math.max(0.6, Math.min(3.5, view.current.zoom * (e.deltaY > 0 ? 0.9 : 1.1)))
    }

    function pick(x: number, y: number) {
      const items = projected.current
      // Labels sit on top, so test them first.
      for (const item of items) {
        if (item.label && Math.abs(x - item.sx) <= (item.w ?? 0) / 2 && Math.abs(y - item.sy) <= 10) return item
      }
      let best: (typeof items)[number] | undefined
      let bestDist = Infinity
      for (const item of items) {
        if (item.label || !item.neuron) continue
        const d = Math.hypot(x - item.sx, y - item.sy)
        if (d < Math.max(8, item.r * 1.5) && d < bestDist) {
          best = item
          bestDist = d
        }
      }
      return best
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })

    const draw = (time: number) => {
      const { brains, neurons, flashes, selectedBrainId, selectedNeuronId, hiddenKinds } = propsRef.current
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const v = view.current
      if (!dragging) v.yaw += 0.0012
      if (v.target) {
        v.centre.x += (v.target.x - v.centre.x) * 0.06
        v.centre.y += (v.target.y - v.centre.y) * 0.06
        v.centre.z += (v.target.z - v.centre.z) * 0.06
      }
      const cy = Math.cos(v.yaw)
      const sy = Math.sin(v.yaw)
      const cp = Math.cos(v.pitch)
      const sp = Math.sin(v.pitch)
      const scale = Math.min(width, height) * 0.36 * v.zoom
      const project = (p: Vec3) => {
        const x0 = p.x - v.centre.x
        const y0 = p.y - v.centre.y
        const z0 = p.z - v.centre.z
        const x1 = x0 * cy - z0 * sy
        const z1 = x0 * sy + z0 * cy
        const y2 = y0 * cp - z1 * sp
        const z2 = y0 * sp + z1 * cp
        const persp = 3.2 / (3.2 + z2)
        return { sx: width / 2 + x1 * scale * persp, sy: height / 2 + y2 * scale * persp, depth: z2, persp }
      }

      const now = Date.now()
      const centres = new Map<string, Vec3>()
      brains.forEach((brain, index) => centres.set(brain.id, brainCentre(index, brains.length)))

      const points: MapPoint[] = [...DUST]
      const neuronPos = new Map<string, Vec3>()
      /** Any brain's neuron by key, so links can cross brains (an idea linking a trend topic). */
      const neuronPosByKey = new Map<string, Vec3>()
      for (const neuron of neurons) {
        if (hiddenKinds.has(neuron.kind)) continue
        const brain = brains.find((b) => b.id === neuron.brainId)
        const centre = centres.get(neuron.brainId)
        if (!brain || !centre) continue
        const pos = scatter(centre, neuron.key, 0.32)
        neuronPos.set(`${neuron.brainId}|${neuron.key}`, pos)
        if (!neuronPosByKey.has(neuron.key)) neuronPosByKey.set(neuron.key, pos)
        const ageHours = (now - Date.parse(neuron.lastSeenAt)) / HOUR
        const fresh = Math.max(0.25, 1 - ageHours / (24 * 7))
        points.push({
          ...pos,
          color: brain.color,
          size: 1.6 + Math.min(4, neuron.hits) * 0.6 + neuron.heat / 40 + (neuron.kind === 'topic' || neuron.kind === 'idea' ? 1 : 0),
          alpha: fresh * (0.45 + neuron.heat / 180),
          neuron,
        })
      }
      // Planned brains glow faintly so the map shows the whole pipeline.
      for (const brain of brains) {
        if (brain.neuronCount > 0) continue
        const centre = centres.get(brain.id)!
        for (let i = 0; i < 18; i += 1) {
          points.push({ ...scatter(centre, `${brain.id}${i}`, 0.22), color: brain.color, size: 1.3, alpha: brain.active ? 0.35 : 0.16, brainId: brain.id })
        }
      }

      const items = points
        .map((p) => ({ p, ...project(p) }))
        .sort((a, b) => b.depth - a.depth)

      // Feeds: a brain reads the memory of the brains it lists; a spark travels while it runs.
      for (const brain of brains) {
        const to = centres.get(brain.id)
        if (!to) continue
        const b = project(to)
        brain.feeds.forEach((feedId, feedIndex) => {
          const from = centres.get(feedId)
          if (!from) return
          const a = project(from)
          const mx = (a.sx + b.sx) / 2 + (b.sy - a.sy) * 0.15
          const my = (a.sy + b.sy) / 2 - (b.sx - a.sx) * 0.15
          const live = brain.status === 'running'
          ctx.strokeStyle = live ? `${brain.color}cc` : brain.active ? 'rgba(167,139,250,0.22)' : 'rgba(100,116,139,0.12)'
          ctx.lineWidth = live ? 1.6 : 1
          ctx.setLineDash(brain.active ? [] : [3, 5])
          ctx.beginPath()
          ctx.moveTo(a.sx, a.sy)
          ctx.quadraticCurveTo(mx, my, b.sx, b.sy)
          ctx.stroke()
          ctx.setLineDash([])
          if (live) {
            const t = ((time / 1400 + feedIndex * 0.37) % 1)
            const x = (1 - t) * (1 - t) * a.sx + 2 * (1 - t) * t * mx + t * t * b.sx
            const y = (1 - t) * (1 - t) * a.sy + 2 * (1 - t) * t * my + t * t * b.sy
            ctx.drawImage(glowSprite(brain.color), x - 9, y - 9, 18, 18)
          }
        })
      }

      // Links: neuron ↔ evidence, brighter for neurons seen in several runs, violet across brains.
      ctx.lineWidth = 0.6
      for (const neuron of neurons) {
        if (hiddenKinds.has(neuron.kind) || neuron.links.length === 0) continue
        const from = neuronPos.get(`${neuron.brainId}|${neuron.key}`)
        if (!from) continue
        const a = project(from)
        for (const link of neuron.links) {
          const sameBrain = neuronPos.get(`${neuron.brainId}|${link}`)
          const to = sameBrain ?? neuronPosByKey.get(link)
          if (!to) continue
          const b = project(to)
          const strong = neuron.hits >= 2
          ctx.strokeStyle = !sameBrain ? 'rgba(167,139,250,0.35)' : strong ? 'rgba(250,204,21,0.45)' : 'rgba(148,163,184,0.18)'
          ctx.beginPath()
          ctx.moveTo(a.sx, a.sy)
          ctx.lineTo(b.sx, b.sy)
          ctx.stroke()
        }
      }

      const hits: typeof projected.current = []
      ctx.globalCompositeOperation = 'lighter'
      for (const item of items) {
        const { p } = item
        const flashAt = p.neuron ? flashes[p.neuron.brainId] : p.brainId ? flashes[p.brainId] : undefined
        const flash = flashAt ? Math.max(0, 1 - (now - flashAt) / 1500) : 0
        const dimmed = selectedBrainId && (p.neuron?.brainId ?? p.brainId) && (p.neuron?.brainId ?? p.brainId) !== selectedBrainId
        const twinkle = p.neuron ? 0.85 + 0.15 * Math.sin(time / 600 + hash(p.neuron.key) * 10) : 1
        const r = p.size * item.persp * (v.zoom * 0.8 + 0.2) * (1 + flash * 0.8)
        ctx.globalAlpha = Math.min(1, p.alpha * twinkle * (dimmed ? 0.3 : 1) + flash * 0.5)
        const sprite = glowSprite(p.color)
        const glow = r * (p.neuron ? 5 : 3)
        ctx.drawImage(sprite, item.sx - glow, item.sy - glow, glow * 2, glow * 2)
        if (p.neuron) hits.push({ sx: item.sx, sy: item.sy, r, neuron: p.neuron })
        if (p.neuron && p.neuron.id === selectedNeuronId) {
          ctx.globalCompositeOperation = 'source-over'
          ctx.globalAlpha = 1
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(item.sx, item.sy, r * 2.2 + 4 + Math.sin(time / 200) * 1.5, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalCompositeOperation = 'lighter'
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1

      // Department labels.
      ctx.font = '600 11px "Geist Sans", system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      const labels = brains
        .map((brain) => ({ brain, ...project(centres.get(brain.id)!) }))
        .sort((a, b) => b.depth - a.depth)
      for (const { brain, sx, sy: ly } of labels) {
        const count = String(brain.neuronCount)
        const textW = ctx.measureText(brain.name).width
        const w = textW + 34 + ctx.measureText(count).width
        const x = sx - w / 2
        const y = ly - 18
        const selected = brain.id === selectedBrainId
        ctx.globalAlpha = selectedBrainId && !selected ? 0.55 : 1
        ctx.fillStyle = selected ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.78)'
        ctx.strokeStyle = selected ? brain.color : 'rgba(148,163,184,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(x, y - 10, w, 20, 10)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = brain.color
        ctx.beginPath()
        ctx.arc(x + 10, y, 3.5, 0, Math.PI * 2)
        ctx.fill()
        if (brain.status === 'running') {
          ctx.strokeStyle = brain.color
          ctx.beginPath()
          ctx.arc(x + 10, y, 5 + ((time / 120) % 6), 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.fillStyle = brain.active ? '#e2e8f0' : '#94a3b8'
        ctx.fillText(brain.name, x + 18, y + 0.5)
        ctx.fillStyle = brain.neuronCount ? '#fca5a5' : '#64748b'
        ctx.fillText(count, x + 24 + textW, y + 0.5)
        hits.unshift({ sx, sy: y, r: 0, brainId: brain.id, label: true, w })
      }
      ctx.globalAlpha = 1
      projected.current = hits
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  return <canvas ref={canvasRef} className="size-full cursor-grab touch-none" />
}
