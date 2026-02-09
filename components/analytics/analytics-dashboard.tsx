"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarRange,
  Gauge,
  Medal,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeAnalyticsDashboard,
  filterAnalyticsRows,
  type AnalyticsSelectionRow,
} from "@/lib/domain/analytics";
import {
  computeLiveLeaderboard,
  type LiveLeaderboardEntryInput,
} from "@/lib/domain/ranking";
import { formatCredits } from "@/lib/format";
import { getSportDisplayName } from "@/lib/sports";
import { getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";

interface RoundLeaderboardDataset {
  roundId: string;
  roundName: string;
  roundStatus: string;
  closesAt: string;
  entries: LiveLeaderboardEntryInput[];
  loadError?: string | null;
}

interface AnalyticsDashboardProps {
  currentUserId: string;
  userRows: AnalyticsSelectionRow[];
  globalRows: AnalyticsSelectionRow[];
  leaderboardDatasets: RoundLeaderboardDataset[];
  globalError?: string | null;
}

type Scope = "me" | "global";
type BoardFilter = "all" | "daily" | "weekly" | "other";
type AnalyticsView = "live" | "jornada" | "historical";

function formatPercent(value: number): string {
  const fixed = Math.round(value * 10) / 10;
  const sign = fixed > 0 ? "+" : "";
  return `${sign}${fixed.toFixed(1)}%`;
}

function ratio(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatScore(value: number, mode: "credits" | "net"): string {
  const rounded = Math.round(value);
  if (mode === "credits") {
    return formatCredits(rounded);
  }
  return `${rounded >= 0 ? "+" : ""}${formatCredits(rounded)}`;
}

function humanizeSlug(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRoundStatus(status: string): string {
  if (status === "open") return "live";
  if (status === "locked") return "locked";
  if (status === "settled") return "settled";
  return status;
}

export function AnalyticsDashboard({
  currentUserId,
  userRows,
  globalRows,
  leaderboardDatasets,
  globalError = null,
}: AnalyticsDashboardProps) {
  const [scope, setScope] = useState<Scope>("me");
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [rankingRoundId, setRankingRoundId] = useState<string>(
    leaderboardDatasets[0]?.roundId ?? "",
  );
  const [rankingSportFilter, setRankingSportFilter] = useState<string>("all");
  const [view, setView] = useState<AnalyticsView>("live");

  const sourceRows = scope === "me" ? userRows : globalRows;

  const availableSports = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of sourceRows) {
      if (!map.has(row.sportSlug)) {
        map.set(
          row.sportSlug,
          getSportDisplayName({ slug: row.sportSlug, name: row.sportName }),
        );
      }
    }

    return Array.from(map.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((left, right) => {
        if (left.slug === "soccer" && right.slug !== "soccer") {
          return -1;
        }
        if (right.slug === "soccer" && left.slug !== "soccer") {
          return 1;
        }
        return left.name.localeCompare(right.name);
      });
  }, [sourceRows]);

  const filteredRows = useMemo(
    () =>
      filterAnalyticsRows(sourceRows, {
        boardType: boardFilter,
        sportSlug: sportFilter,
      }),
    [boardFilter, sourceRows, sportFilter],
  );

  const dashboard = useMemo(
    () => computeAnalyticsDashboard(filteredRows),
    [filteredRows],
  );

  const maxSportStake = dashboard.bySport.reduce(
    (max, item) => Math.max(max, item.totalStake),
    0,
  );
  const maxWeekdayStake = dashboard.byWeekday.reduce(
    (max, item) => Math.max(max, item.totalStake),
    0,
  );

  const selectedRound = useMemo(() => {
    if (leaderboardDatasets.length === 0) {
      return null;
    }
    return (
      leaderboardDatasets.find((dataset) => dataset.roundId === rankingRoundId) ??
      leaderboardDatasets[0]
    );
  }, [leaderboardDatasets, rankingRoundId]);

  const availableRankingSports = useMemo(() => {
    if (!selectedRound) {
      return [];
    }
    const set = new Set<string>();
    for (const entry of selectedRound.entries) {
      for (const selection of entry.selections) {
        set.add(selection.sportSlug);
      }
    }
    return Array.from(set).sort((left, right) => {
      if (left === "soccer" && right !== "soccer") return -1;
      if (right === "soccer" && left !== "soccer") return 1;
      return left.localeCompare(right);
    });
  }, [selectedRound]);

  useEffect(() => {
    const firstDataset = leaderboardDatasets[0];
    if (!rankingRoundId && firstDataset) {
      setRankingRoundId(firstDataset.roundId);
    }
  }, [leaderboardDatasets, rankingRoundId]);

  useEffect(() => {
    if (
      rankingSportFilter !== "all" &&
      !availableRankingSports.includes(rankingSportFilter)
    ) {
      setRankingSportFilter("all");
    }
  }, [availableRankingSports, rankingSportFilter]);

  const liveRanking = useMemo(() => {
    if (!selectedRound) {
      return null;
    }
    return computeLiveLeaderboard(selectedRound.entries, {
      currentUserId,
      sportSlug: rankingSportFilter,
    });
  }, [currentUserId, rankingSportFilter, selectedRound]);

  const historicalRows = useMemo(() => {
    return leaderboardDatasets
      .filter((dataset) => dataset.roundStatus === "settled")
      .map((dataset) => {
        const result = computeLiveLeaderboard(dataset.entries, {
          currentUserId,
          sportSlug: rankingSportFilter,
        });
        const me = result.rows.find((row) => row.user_id === currentUserId) ?? null;
        return {
          roundId: dataset.roundId,
          roundName: dataset.roundName,
          closesAt: dataset.closesAt,
          participants: result.rows.length,
          rank: result.myRange.currentRank,
          score: me?.currentScore ?? null,
          mode: result.mode,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.closesAt).getTime() - new Date(left.closesAt).getTime(),
      );
  }, [currentUserId, leaderboardDatasets, rankingSportFilter]);

  const roundSnapshots = useMemo(() => {
    return leaderboardDatasets
      .map((dataset) => {
        const result = computeLiveLeaderboard(dataset.entries, {
          currentUserId,
          sportSlug: rankingSportFilter,
        });
        return {
          roundId: dataset.roundId,
          roundName: dataset.roundName,
          roundStatus: dataset.roundStatus,
          closesAt: dataset.closesAt,
          participants: result.rows.length,
          range: result.myRange,
          mode: result.mode,
        };
      })
      .sort(
        (left, right) =>
          new Date(right.closesAt).getTime() - new Date(left.closesAt).getTime(),
      );
  }, [currentUserId, leaderboardDatasets, rankingSportFilter]);

  return (
    <div className="space-y-6">
      <section className="surface-subtle surface-forest-soft rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Badge variant="outline">Analytics Studio</Badge>
            <h1 className="font-display text-display-md text-ink">Performance & live leaderboard</h1>
            <p className="max-w-2xl text-sm text-ink/70">
              Control your edge by sport and board, then inspect your potential leaderboard range
              for each jornada.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={scope === "me" ? "default" : "outline"}
              onClick={() => setScope("me")}
            >
              My portfolio
            </Button>
            <Button
              type="button"
              size="sm"
              variant={scope === "global" ? "default" : "outline"}
              onClick={() => setScope("global")}
            >
              Global settled
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              { key: "live", label: "Live" },
              { key: "jornada", label: "Por jornada" },
              { key: "historical", label: "Histórico" },
            ] as Array<{ key: AnalyticsView; label: string }>
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                view === item.key
                  ? "border-forest bg-forest text-bone"
                  : "border-stone-400/70 text-ink hover:bg-bone-100",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-forest/20 bg-bone-50 p-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink/55">Board filter</p>
            <div className="flex flex-wrap gap-2">
              {(["all", "daily", "weekly", "other"] as BoardFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBoardFilter(value)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                    boardFilter === value
                      ? "border-forest bg-forest text-bone"
                      : "border-stone-400/70 text-ink hover:bg-bone-100",
                  )}
                >
                  {value === "all" ? "all boards" : value}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-clay/30 bg-bone-50 p-4">
            <p className="mb-2 text-[11px] uppercase tracking-[0.12em] text-ink/55">Sport filter</p>
            <div className="flex max-h-24 flex-wrap gap-2 overflow-auto pr-1">
              <button
                type="button"
                onClick={() => setSportFilter("all")}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                  sportFilter === "all"
                    ? "border-forest bg-forest text-bone"
                    : "border-stone-400/70 text-ink hover:bg-bone-100",
                )}
              >
                All sports
              </button>
              {availableSports.map((sport) => (
                <button
                  key={sport.slug}
                  type="button"
                  onClick={() => setSportFilter(sport.slug)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                    sportFilter === sport.slug
                      ? "border-forest bg-forest text-bone"
                      : "border-stone-400/70 text-ink hover:bg-bone-100",
                  )}
                >
                  {getSportEmoji(sport.slug)} {sport.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {scope === "global" && globalError ? (
          <p className="mt-4 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Global analytics unavailable: {globalError}
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Selections"
          value={String(dashboard.summary.selections)}
          icon={Activity}
          tone="neutral"
        />
        <MetricCard
          title="Invested"
          value={formatCredits(dashboard.summary.totalStake)}
          icon={PiggyBank}
          tone="neutral"
        />
        <MetricCard
          title="Recovered"
          value={formatCredits(dashboard.summary.totalPayout)}
          icon={TrendingUp}
          tone={dashboard.summary.totalPayout >= dashboard.summary.totalStake ? "positive" : "neutral"}
        />
        <MetricCard
          title="Net"
          value={`${dashboard.summary.totalNet >= 0 ? "+" : ""}${formatCredits(
            dashboard.summary.totalNet,
          )}`}
          icon={dashboard.summary.totalNet >= 0 ? TrendingUp : TrendingDown}
          tone={dashboard.summary.totalNet >= 0 ? "positive" : "negative"}
        />
      </div>

      <div
        className={cn(
          "grid gap-4",
          view === "historical" ? "xl:grid-cols-[1.2fr_1fr]" : "xl:grid-cols-1",
        )}
      >
        {view === "historical" ? (
          <section className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="size-4 text-forest" />
                  Performance by sport
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.bySport.length === 0 ? (
                  <p className="text-sm text-ink/60">No settled data for current filters.</p>
                ) : (
                  dashboard.bySport.map((item, index) => (
                    <motion.div
                      key={item.key}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      className="space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs text-ink/65">
                        <span className="font-medium text-ink">
                          {getSportEmoji(item.key)} {item.label}
                        </span>
                        <span>
                          {formatCredits(item.totalStake)} staked · ROI {formatPercent(item.roiPercent)}
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-bone-100">
                        <motion.div
                          className="h-full rounded-full bg-forest"
                          initial={{ width: 0 }}
                          animate={{ width: `${ratio(item.totalStake, maxSportStake)}%` }}
                          transition={{ duration: 0.35, ease: "easeOut", delay: index * 0.02 }}
                        />
                      </div>
                    </motion.div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarRange className="size-4 text-forest" />
                    Weekday rhythm
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {dashboard.byWeekday.map((item, index) => (
                    <motion.div
                      key={item.key}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                    >
                      <div className="mb-1 flex items-center justify-between text-xs text-ink/65">
                        <span>{item.label}</span>
                        <span>{formatCredits(item.totalStake)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-bone-100">
                        <div
                          className="h-full rounded-full bg-forest"
                          style={{ width: `${ratio(item.totalStake, maxWeekdayStake)}%` }}
                        />
                      </div>
                    </motion.div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Gauge className="size-4 text-forest" />
                    Efficiency
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <DataRow
                    label="ROI"
                    value={formatPercent(dashboard.summary.roiPercent)}
                    tone={dashboard.summary.roiPercent >= 0 ? "text-forest" : "text-clay"}
                  />
                  <DataRow
                    label="Recovery"
                    value={formatPercent(dashboard.summary.recoveryPercent)}
                  />
                  <DataRow
                    label="Avg stake"
                    value={formatCredits(Math.round(dashboard.summary.averageStake))}
                  />
                  <DataRow
                    label="Hit profile"
                    value={`${dashboard.summary.winCount}W · ${dashboard.summary.refundCount}V · ${dashboard.summary.lossCount}L`}
                  />
                </CardContent>
              </Card>
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <Card className="rounded-2xl">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="size-4 text-forest" />
                  Live leaderboard
                </CardTitle>
                <Badge variant="outline">
                  {selectedRound ? formatRoundStatus(selectedRound.roundStatus) : "unavailable"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {leaderboardDatasets.map((dataset) => (
                  <button
                    key={dataset.roundId}
                    type="button"
                    onClick={() => setRankingRoundId(dataset.roundId)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                      (selectedRound?.roundId ?? "") === dataset.roundId
                        ? "border-forest bg-forest text-bone"
                        : "border-stone-400/70 text-ink hover:bg-bone-100",
                    )}
                  >
                    {dataset.roundName}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setRankingSportFilter("all")}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                    rankingSportFilter === "all"
                      ? "border-forest bg-forest text-bone"
                      : "border-stone-400/70 text-ink hover:bg-bone-100",
                  )}
                >
                  All sports
                </button>
                {availableRankingSports.map((sportSlug) => (
                  <button
                    key={sportSlug}
                    type="button"
                    onClick={() => setRankingSportFilter(sportSlug)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                      rankingSportFilter === sportSlug
                        ? "border-forest bg-forest text-bone"
                        : "border-stone-400/70 text-ink hover:bg-bone-100",
                    )}
                  >
                    {getSportEmoji(sportSlug)}{" "}
                    {getSportDisplayName({ slug: sportSlug, name: humanizeSlug(sportSlug) })}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!liveRanking ? (
                <p className="text-sm text-ink/60">No leaderboard data available.</p>
              ) : (
                <>
                  {selectedRound?.loadError ? (
                    <p className="rounded-xl border border-clay/35 bg-clay/10 px-3 py-2 text-xs text-clay">
                      Live ranking not available for this round in current session: {selectedRound.loadError}
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <RankPill
                      label="Current"
                      value={
                        liveRanking.myRange.currentRank
                          ? `#${liveRanking.myRange.currentRank}`
                          : "—"
                      }
                      icon={Medal}
                    />
                    <RankPill
                      label="Best case"
                      value={
                        liveRanking.myRange.bestRank
                          ? `#${liveRanking.myRange.bestRank}`
                          : "—"
                      }
                      icon={ArrowUp}
                    />
                    <RankPill
                      label="Worst case"
                      value={
                        liveRanking.myRange.worstRank
                          ? `#${liveRanking.myRange.worstRank}`
                          : "—"
                      }
                      icon={ArrowDown}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-ink/55">
                      Jornada classification
                    </p>
                    <div className="space-y-1.5">
                      {liveRanking.rows.slice(0, 12).map((row) => (
                        <div
                          key={row.entry_id}
                          className={cn(
                            "rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2 text-sm transition-all",
                            row.user_id === currentUserId && "border-forest/60 bg-forest/10",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate font-medium text-ink">
                              #{row.rank} {row.username}
                            </p>
                            <p className="text-xs text-ink/70">
                              {formatScore(row.currentScore, liveRanking.mode)}
                            </p>
                          </div>
                          <p className="mt-0.5 text-xs text-ink/60">
                            Potential range:{" "}
                            {formatScore(row.minScore, liveRanking.mode)} →{" "}
                            {formatScore(row.maxScore, liveRanking.mode)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {view === "historical" ? (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Historical classification</CardTitle>
              </CardHeader>
              <CardContent>
                {historicalRows.length === 0 ? (
                  <p className="text-sm text-ink/60">No settled rounds available yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {historicalRows.map((row) => (
                      <div
                        key={row.roundId}
                        className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink">{row.roundName}</p>
                          <p className="text-xs text-ink/70">
                            {row.rank ? `#${row.rank}` : "Not ranked"}
                          </p>
                        </div>
                        <p className="text-xs text-ink/60">
                          {row.participants} players ·{" "}
                          {row.score === null ? "No score" : formatScore(row.score, row.mode)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {view === "jornada" ? (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Clasificación por jornada</CardTitle>
              </CardHeader>
              <CardContent>
                {roundSnapshots.length === 0 ? (
                  <p className="text-sm text-ink/60">No rounds available.</p>
                ) : (
                  <div className="space-y-1.5">
                    {roundSnapshots.map((row) => (
                      <div
                        key={row.roundId}
                        className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink">{row.roundName}</p>
                          <Badge variant="outline">{formatRoundStatus(row.roundStatus)}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-ink/65">
                          Actual {row.range.currentRank ? `#${row.range.currentRank}` : "—"} ·
                          Mejor {row.range.bestRank ? ` #${row.range.bestRank}` : " —"} ·
                          Peor {row.range.worstRank ? ` #${row.range.worstRank}` : " —"}
                        </p>
                        <p className="text-xs text-ink/60">
                          {row.participants} players
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {view === "live" ? (
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="text-base">Live position band</CardTitle>
              </CardHeader>
              <CardContent>
                {!liveRanking ? (
                  <p className="text-sm text-ink/60">No live data available.</p>
                ) : (
                  <div className="space-y-2">
                    <DataRow
                      label="Current rank"
                      value={
                        liveRanking.myRange.currentRank
                          ? `#${liveRanking.myRange.currentRank}`
                          : "—"
                      }
                    />
                    <DataRow
                      label="Best potential"
                      value={
                        liveRanking.myRange.bestRank ? `#${liveRanking.myRange.bestRank}` : "—"
                      }
                      tone="text-forest"
                    />
                    <DataRow
                      label="Worst potential"
                      value={
                        liveRanking.myRange.worstRank
                          ? `#${liveRanking.myRange.worstRank}`
                          : "—"
                      }
                      tone="text-clay"
                    />
                    <p className="text-xs text-ink/65">
                      Ranking mode:{" "}
                      {liveRanking.mode === "credits"
                        ? "credits + remaining cash"
                        : "net P&L by sport"}
                      .
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2 text-sm">
      <span className="text-ink/70">{label}</span>
      <span className={cn("font-medium text-ink", tone)}>{value}</span>
    </div>
  );
}

function RankPill({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-forest/22 bg-forest/8 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-ink/55">
        <Icon className="size-3.5 text-forest" />
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-ink">{value}</p>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: "neutral" | "positive" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "border-forest/35 bg-forest/10 text-forest"
      : tone === "negative"
        ? "border-clay/45 bg-clay/15 text-clay"
        : "border-forest/20 bg-bone-50 text-ink";

  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-5">
        <p className={cn("flex items-center gap-2 text-xs uppercase tracking-[0.11em]", toneClass)}>
          <Icon className="size-3.5" />
          {title}
        </p>
        <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}
