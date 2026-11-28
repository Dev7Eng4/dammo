import { Brain } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { fetchTrendRadar } from "../../api/radar";
import { useAbortableEffect } from "../../hooks";
import { cn } from "../../lib/cn";
import type {
  RemakeVerdict,
  TrendRadarFilters,
  TrendRadarItem,
  TrendRadarResponse,
} from "../../types/radar";
import { Select, StatusBadge, type StatusTone } from "../ui";
import { RemakeVerdictCell } from "./RemakeVerdictCell";

const DAY_OPTIONS = [1, 3, 7, 30] as const;
const VERDICTS: RemakeVerdict[] = ["do", "maybe", "skip"];

function formatViews(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function heatTone(heat: number): StatusTone {
  if (heat >= 80) return "danger";
  if (heat >= 50) return "warning";
  return "info";
}

/** Hot videos found by the jp-psy-trends brain or the Claude Code skill, filterable by cluster K1–K11. */
export function TrendRadarPanel() {
  const { t, i18n } = useTranslation(["radar", "common"]);
  const [filters, setFilters] = useState<TrendRadarFilters>({ days: 7 });
  const [data, setData] = useState<TrendRadarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useAbortableEffect(
    async (signal) => {
      setLoading(true);
      setError(null);
      try {
        setData(await fetchTrendRadar(filters, { signal }));
      } catch (err) {
        if (signal.aborted) return;
        setError(err instanceof Error ? err.message : t("page.loadError"));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [filters, reloadKey],
  );

  const dayOptions = DAY_OPTIONS.map((days) => ({
    value: String(days),
    label: t("trends.days", { count: days }),
  }));
  const chips = (data?.clusters ?? []).filter(
    (c) => c.count > 0 || /^K\d+$/.test(c.id),
  );
  const items: TrendRadarItem[] = data?.items ?? [];
  const lastRun = data?.lastRunAt
    ? new Date(data.lastRunAt).toLocaleString(i18n.language)
    : t("status.never");

  function formatAge(hours?: number): string {
    if (hours === undefined) return "?";
    return hours < 48
      ? t("unit.hours", { value: Math.round(hours) })
      : t("unit.days", { value: Math.round(hours / 24) });
  }

  function clusterChipLabel(id: string, name: string): string {
    if (id === "off") return t("trends.offNiche");
    if (id === "none") return t("trends.untagged");
    const label = t(`common:cluster.${id}`, { defaultValue: name });
    return /^K\d+$/.test(id) ? `${id} ${label}` : label;
  }

  function selectVerdict(verdict?: RemakeVerdict) {
    setFilters((prev) => ({
      ...prev,
      verdict: prev.verdict === verdict ? undefined : verdict,
    }));
  }

  function selectCluster(id?: string) {
    setFilters((prev) => ({
      ...prev,
      cluster: prev.cluster === id ? undefined : id,
    }));
  }

  return (
    <div className="space-y-4">
      <div className="card-surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <p className="text-muted-foreground">{t("trends.intro")}</p>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {t("trends.lastRun")}:{" "}
            <span className="text-foreground">{lastRun}</span>
          </span>
          <Link
            to="/brains"
            className="inline-flex items-center gap-1 text-secondary-400 hover:text-secondary-300"
          >
            <Brain className="size-4" />
            {t("trends.openBrain")}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("trends.seenWithin")}
          <Select
            className="w-32"
            options={dayOptions}
            value={String(filters.days)}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, days: Number(value) }))
            }
          />
        </label>
        <div className="flex flex-wrap items-center gap-2" title={t("verdict.hint")}>
          <span className="text-sm text-muted-foreground">{t("verdict.label")}</span>
          <button
            type="button"
            onClick={() => selectVerdict(undefined)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              !filters.verdict
                ? "border-primary-500 bg-primary-500/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("verdict.all")}
          </button>
          {VERDICTS.map((verdict) => (
            <button
              key={verdict}
              type="button"
              onClick={() => selectVerdict(verdict)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filters.verdict === verdict
                  ? "border-primary-500 bg-primary-500/15 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`verdict.${verdict}`)} · {data?.verdicts?.[verdict] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => selectCluster(undefined)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            !filters.cluster
              ? "border-primary-500 bg-primary-500/15 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {t("trends.allClusters")} · {data?.total ?? 0}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            title={
              chip.count
                ? t("trends.chipTitle", {
                    top: formatViews(chip.topViewsPerHour),
                  })
                : undefined
            }
            onClick={() => selectCluster(chip.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              filters.cluster === chip.id
                ? "border-primary-500 bg-primary-500/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
              chip.count === 0 && "opacity-50",
            )}
          >
            {clusterChipLabel(chip.id, chip.name)} ·{" "}
            {chip.count}
          </button>
        ))}
      </div>

      {error ? (
        <div className="card-surface p-6 text-center">
          <p className="text-danger">{error}</p>
          <button
            type="button"
            className="mt-3 text-sm text-secondary-400 hover:text-secondary-300"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            {t("page.retry")}
          </button>
        </div>
      ) : loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          {data?.total ? t("empty.noResult") : t("trends.empty")}
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3" title={t("verdict.hint")}>
                  {t("verdict.label")}
                </th>
                <th className="px-4 py-3">{t("trends.heat")}</th>
                <th className="px-4 py-3">{t("table.video")}</th>
                <th className="px-4 py-3">{t("trends.cluster")}</th>
                <th className="px-4 py-3">{t("trends.channel")}</th>
                <th className="px-4 py-3 text-right">{t("table.age")}</th>
                <th className="px-4 py-3 text-right">{t("table.perHour")}</th>
                <th className="px-4 py-3 text-right">{t("trends.ratio")}</th>
                <th className="px-4 py-3">{t("trends.source")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr
                  key={item.videoId}
                  className={loading ? "opacity-60" : undefined}
                >
                  <td className="px-4 py-3 align-top">
                    <RemakeVerdictCell
                      verdict={item.verdict}
                      reasons={item.verdictReasons}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      tone={heatTone(item.heat)}
                      label={String(Math.round(item.heat))}
                    />
                  </td>
                  <td className="max-w-md px-4 py-3">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-foreground hover:text-secondary-400 hover:underline"
                      title={item.title}
                    >
                      {item.title}
                    </a>
                    {item.reason ? (
                      <p
                        className="mt-1 line-clamp-2 text-xs text-muted-foreground"
                        title={item.reason}
                      >
                        {item.reason}
                      </p>
                    ) : null}
                    {item.format ? (
                      <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {item.format}
                      </span>
                    ) : null}
                    {item.sourceType && item.sourceType !== "narrated" ? (
                      <span
                        className={
                          item.topicOnly
                            ? "ml-1 mt-1 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"
                            : "ml-1 mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        }
                        title={item.topicOnly ? t("trends.topicOnlyHint") : undefined}
                      >
                        {t(`trends.sourceType.${item.sourceType}`, {
                          defaultValue: item.sourceTypeName ?? item.sourceType,
                        })}
                        {item.topicOnly ? ` · ${t("trends.topicOnly")}` : ""}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {item.cluster === "off" ? (
                      <span className="text-xs text-muted-foreground">
                        {t("trends.offNiche")}
                      </span>
                    ) : item.cluster ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">
                          {item.cluster}
                          {item.clusterUnsure ? "?" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t(`common:cluster.${item.cluster}`, {
                            defaultValue: item.clusterName ?? "",
                          })}
                        </span>
                        {item.subCluster ? (
                          <span className="text-[11px] text-muted-foreground">
                            + {item.subCluster}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("trends.untagged")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.channelId ? (
                      <a
                        href={`https://www.youtube.com/channel/${item.channelId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-foreground hover:underline"
                      >
                        {item.channel}
                      </a>
                    ) : (
                      item.channel
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatAge(item.ageHours)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className="font-semibold text-foreground">
                      {formatViews(item.viewsPerHour)}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      {formatViews(item.views)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.channelRatio !== undefined
                      ? `×${item.channelRatio >= 10 ? Math.round(item.channelRatio) : item.channelRatio}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {t(`trends.from.${item.source}`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
