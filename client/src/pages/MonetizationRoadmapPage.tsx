import { Banknote, Check, Rocket, TrendingUp, TriangleAlert, Wallet, X } from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader, PageShell } from '../components/layout'
import { Input, PageTabs, Select, StatusBadge, type StatusTone } from '../components/ui'
import {
  MARKET_SCORE_KEYS,
  MARKET_TEXT_KEYS,
  PHASE_IDS,
  PLATFORM_KEYS,
  RULE_KEYS,
  SCORE_KEYS,
  STEP_KEYS,
  estimateIncome,
  marketTotal,
  markets,
  rankedMarkets,
  rankedTracks,
  trackTotal,
  type Access,
  type MarketId,
  type MarketTier,
  type RpmRange,
  type TrackTier,
} from '../config/monetization'
import { cn } from '../lib/cn'

const TIER_TONE: Record<TrackTier, StatusTone> = {
  now: 'success',
  next: 'info',
  later: 'neutral',
}

const MARKET_TIER_TONE: Record<MarketTier, StatusTone> = {
  core: 'success',
  cash: 'primary',
  expand: 'info',
  test: 'warning',
  skip: 'neutral',
}

const ACCESS_STYLE: Record<Access, { icon: typeof Check; className: string }> = {
  ok: { icon: Check, className: 'text-success' },
  limited: { icon: TriangleAlert, className: 'text-warning' },
  no: { icon: X, className: 'text-danger' },
}

const TAB_IDS = ['markets', 'tracks', 'plan'] as const
type TabId = (typeof TAB_IDS)[number]

const AI_MODULE_KEYS = ['radar', 'prompts', 'production', 'accounts'] as const
const PICK_KEYS = [
  { key: 'cash', icon: Banknote },
  { key: 'main', icon: Wallet },
  { key: 'expand', icon: Rocket },
] as const
const MAX_SCORE = 5
const USD_TO_VND = 26_000

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function formatRange(range: RpmRange, none: string): string {
  return range ? `$${num.format(range[0])}–${num.format(range[1])}` : none
}

function ScoreDots({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${label}: ${value}/${MAX_SCORE}`}>
      {Array.from({ length: MAX_SCORE }, (_, i) => (
        <span key={i} className={cn('size-2 rounded-full', i < value ? 'bg-primary-500' : 'bg-muted')} />
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  )
}

function PickSection() {
  const { t } = useTranslation('roadmap')
  return (
    <section className="card-surface space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{t('pick.title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('pick.lead')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {PICK_KEYS.map(({ key, icon: Icon }, i) => (
          <div key={key} className="space-y-2 rounded-lg border border-border bg-surface-elevated p-4">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary-500/15 text-xs font-semibold text-foreground">
                {i + 1}
              </span>
              <Icon className="size-4 text-primary-500" aria-hidden />
              <h3 className="text-sm font-semibold text-foreground">{t(`pick.${key}.label`)}</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{t(`pick.${key}.body`)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function IncomeCalculator({ marketId, onMarketChange }: { marketId: MarketId; onMarketChange: (id: MarketId) => void }) {
  const { t } = useTranslation('roadmap')
  const [views, setViews] = useState({ long: 100_000, shorts: 300_000, facebook: 0 })
  const market = markets.find((m) => m.id === marketId) ?? markets[0]
  const [grossLow, grossHigh] = estimateIncome(market, views)
  const low = Math.max(0, grossLow - market.voiceCost[1])
  const high = Math.max(0, grossHigh - market.voiceCost[0])
  const toVnd = (value: number) => num.format(Math.round((value * USD_TO_VND) / 100_000) / 10)
  const voiceCost =
    market.voiceCost[0] === market.voiceCost[1]
      ? String(market.voiceCost[0])
      : `${market.voiceCost[0]}–${market.voiceCost[1]}`

  const setView = (key: keyof typeof views) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value.replace(/\D/g, ''))
    setViews((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }))
  }

  return (
    <section className="card-surface space-y-4 p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{t('calc.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('calc.hint')}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          <span>{t('calc.market')}</span>
          <Select
            value={marketId}
            onChange={(value) => onMarketChange(value as MarketId)}
            options={markets.map((m) => ({ value: m.id, label: t(`markets.${m.id}.name`) }))}
          />
        </label>
        {(['long', 'shorts', 'facebook'] as const).map((key) => (
          <label key={key} className="space-y-1 text-xs font-medium text-muted-foreground">
            <span>{t(`calc.${key}`)}</span>
            <Input inputMode="numeric" value={num.format(views[key])} onChange={setView(key)} />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-primary-500/30 bg-primary-500/10 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('calc.result')}</p>
          <p className="text-2xl font-semibold text-foreground">
            {usd.format(low)} – {usd.format(high)}{' '}
            <span className="text-sm font-normal text-muted-foreground">{t('calc.perMonth')}</span>
          </p>
          <p className="text-sm text-muted-foreground">{t('calc.vnd', { low: toVnd(low), high: toVnd(high) })}</p>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
          {t('calc.voice', { cost: voiceCost })} {t('calc.gate')}
        </p>
      </div>
    </section>
  )
}

function MarketsTab() {
  const { t } = useTranslation('roadmap')
  const ranked = useMemo(() => rankedMarkets(), [])
  const [selectedId, setSelectedId] = useState<MarketId>('jp')
  const selected = markets.find((m) => m.id === selectedId) ?? ranked[0]
  const none = t('market.none')

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('market.tableTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('market.tableHint')}</p>
        </div>
        <div className="card-surface scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {(['market', 'ytLong', 'ytShorts', 'facebook', 'keep', 'voice', 'total', 'tier'] as const).map((col) => (
                  <th key={col} className="px-4 py-3 font-medium">
                    {t(`market.col.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((market) => (
                <tr
                  key={market.id}
                  onClick={() => setSelectedId(market.id)}
                  className={cn(
                    'cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50',
                    market.id === selectedId && 'bg-primary-500/10',
                  )}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <button type="button" className="text-left focus-visible:outline-none focus-visible:underline">
                      {t(`markets.${market.id}.name`)}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                    {formatRange(market.rpm.ytLong, none)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatRange(market.rpm.ytShorts, none)}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatRange(market.rpm.facebook, none)}</td>
                  <td className="px-4 py-3 tabular-nums text-foreground">{Math.round(market.keepRate * 100)}%</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {market.voiceCost[1] === 0 ? t('market.free') : `$${market.voiceCost[0]}–${market.voiceCost[1]}`}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                    {marketTotal(market)}/{MARKET_SCORE_KEYS.length * MAX_SCORE}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={MARKET_TIER_TONE[market.tier]} label={t(`marketTier.${market.tier}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('market.detailTitle')}</h2>
        <article className="card-surface space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-foreground">{t(`markets.${selected.id}.name`)}</h3>
            <StatusBadge tone={MARKET_TIER_TONE[selected.tier]} label={t(`marketTier.${selected.tier}`)} />
          </div>

          <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 p-3">
            <p className="text-xs font-medium text-muted-foreground">{t('market.verdict')}</p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{t(`markets.${selected.id}.verdict`)}</p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              <Field label={t('market.audience')}>{t(`markets.${selected.id}.audience`)}</Field>
              {MARKET_TEXT_KEYS.map((key) =>
                key === 'limits' ? (
                  <div key={key} className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                    <p className="text-xs font-medium text-warning">{t('market.limits')}</p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground">{t(`markets.${selected.id}.limits`)}</p>
                  </div>
                ) : (
                  <Field key={key} label={t(`market.${key}`)}>
                    {t(`markets.${selected.id}.${key}`)}
                  </Field>
                ),
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('market.rpmTitle')}</p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {(['ytLong', 'ytShorts', 'facebook'] as const).map((key) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t(`market.col.${key}`)}</dt>
                      <dd className="font-medium tabular-nums text-foreground">{formatRange(selected.rpm[key], none)}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('market.platformsTitle')}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {PLATFORM_KEYS.map((key) => {
                    const access = selected.platforms[key]
                    const { icon: Icon, className } = ACCESS_STYLE[access]
                    return (
                      <li key={key} className="flex items-start justify-between gap-2">
                        <span className="text-foreground">
                          {t(`platform.${key}`)}
                          {key === 'local' ? (
                            <span className="block text-xs text-muted-foreground">
                              {t(`markets.${selected.id}.localName`)}
                            </span>
                          ) : null}
                        </span>
                        <span className={cn('flex shrink-0 items-center gap-1 text-xs font-medium', className)}>
                          <Icon className="size-3.5" aria-hidden />
                          {t(`access.${access}`)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('market.scoresTitle')}</p>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {MARKET_SCORE_KEYS.map((key) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{t(`marketScore.${key}`)}</dt>
                      <dd>
                        <ScoreDots value={selected.scores[key]} label={t(`marketScore.${key}`)} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </article>
      </section>

      <IncomeCalculator marketId={selectedId} onMarketChange={setSelectedId} />
    </div>
  )
}

function TracksTab() {
  const { t } = useTranslation('roadmap')
  const tracks = rankedTracks()

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('table.title')}</h2>
        <div className="card-surface scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('table.track')}</th>
                {SCORE_KEYS.map((key) => (
                  <th key={key} className="px-4 py-3 font-medium">
                    {t(`score.${key}`)}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">{t('score.total')}</th>
                <th className="px-4 py-3 font-medium">{t('table.tier')}</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{t(`track.${track.id}.name`)}</td>
                  {SCORE_KEYS.map((key) => (
                    <td key={key} className="px-4 py-3">
                      <ScoreDots value={track.scores[key]} label={t(`score.${key}`)} />
                    </td>
                  ))}
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {trackTotal(track)}/{SCORE_KEYS.length * MAX_SCORE}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={TIER_TONE[track.tier]} label={t(`tier.${track.tier}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('detail.title')}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
          {tracks.map((track) => (
            <article key={track.id} className="card-surface space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">{t(`track.${track.id}.name`)}</h3>
                <StatusBadge tone={TIER_TONE[track.tier]} label={t(`tier.${track.tier}`)} />
              </div>
              <Field label={t('detail.summary')}>{t(`track.${track.id}.summary`)}</Field>
              <Field label={t('detail.aiRole')}>{t(`track.${track.id}.aiRole`)}</Field>
              <Field label={t('detail.steps')}>
                <ol className="list-decimal space-y-1 pl-5">
                  {STEP_KEYS.map((step) => (
                    <li key={step}>{t(`track.${track.id}.${step}`)}</li>
                  ))}
                </ol>
              </Field>
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <p className="text-xs font-medium text-warning">{t('detail.risk')}</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">{t(`track.${track.id}.risk`)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function PlanTab() {
  const { t } = useTranslation('roadmap')
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{t('phase.title')}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PHASE_IDS.map((phase) => (
            <div key={phase} className="card-surface space-y-2 p-5">
              <h3 className="text-sm font-semibold text-foreground">{t(`phase.${phase}.name`)}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{t(`phase.${phase}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface space-y-3 border-warning/30 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('rules.title')}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground">
          {RULE_KEYS.map((key) => (
            <li key={key}>{t(`rules.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section className="card-surface space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('ai.title')}</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {AI_MODULE_KEYS.map((key) => (
            <li key={key}>{t(`ai.${key}`)}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function MonetizationRoadmapPage() {
  const { t } = useTranslation('roadmap')
  const [tab, setTab] = useState<TabId>('markets')

  return (
    <PageShell>
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} icon={TrendingUp} />

      <PickSection />

      <PageTabs
        items={TAB_IDS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        value={tab}
        onValueChange={(value) => setTab(value as TabId)}
      />

      {tab === 'markets' ? <MarketsTab /> : null}
      {tab === 'tracks' ? <TracksTab /> : null}
      {tab === 'plan' ? <PlanTab /> : null}

      <p className="text-xs text-muted-foreground">{t('page.disclaimer')}</p>
    </PageShell>
  )
}
