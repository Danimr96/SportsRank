"use client";

import { useMemo, useState, type ComponentType } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CalendarRange,
  Gauge,
  Medal,
  PiggyBank,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  computeAnalyticsDashboard,
  filterAnalyticsRows,
  type AnalyticsSelectionRow,
} from "@/lib/domain/analytics";
import { formatCredits } from "@/lib/format";
import { getSportDisplayName } from "@/lib/sports";
import { getActionButtonClass } from "@/lib/ui/color-system";
import { getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";

interface AnalyticsDashboardProps {
  userRows: AnalyticsSelectionRow[];
  globalRows: AnalyticsSelectionRow[];
  globalError?: string | null;
}

type Scope = "me" | "global";
type BoardFilter = "all" | "daily" | "weekly" | "other";

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

export function AnalyticsDashboard({
  userRows,
  globalRows,
  globalError = null,
}: AnalyticsDashboardProps) {
  const [scope, setScope] = useState<Scope>("me");
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");

  const sourceRows = scope === "me" ? userRows : globalRows;

  const availableSports = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of sourceRows) {
      if (!map.has(row.sportSlug)) {
        map.set(row.sportSlug, getSportDisplayName({ slug: row.sportSlug, name: row.sportName }));
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

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/92 text-slate-900 shadow-[0_52px_140px_-68px_rgba(37,99,235,0.62)]">
        <div className="pointer-events-none absolute inset-0 opacity-85">
          <div className="absolute -top-16 left-8 h-52 w-52 rounded-full bg-cyan-600/24 blur-3xl" />
          <div className="absolute right-12 top-6 h-44 w-44 rounded-full bg-violet-600/16 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-emerald-600/18 blur-3xl" />
        </div>
        <CardHeader className="relative space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <Badge className="w-fit border border-cyan-400/60 bg-cyan-100 text-cyan-900">
                Performance Lab
              </Badge>
              <CardTitle className="text-2xl tracking-tight">Analytics</CardTitle>
              <p className="text-sm text-slate-600">
                Track your edge by sport, board, weekday, and stake profile.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={scope === "me" ? "default" : "outline"}
                className={
                  scope === "me"
                    ? getActionButtonClass("primary")
                    : "border-slate-300/80 bg-white/75 text-slate-900 hover:bg-white/80"
                }
                onClick={() => setScope("me")}
              >
                My performance
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "global" ? "default" : "outline"}
                className={
                  scope === "global"
                    ? getActionButtonClass("primary")
                    : "border-slate-300/80 bg-white/75 text-slate-900 hover:bg-white/80"
                }
                onClick={() => setScope("global")}
              >
                Global market
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200/75 bg-white/75 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-600">Board filter</p>
              <div className="flex flex-wrap gap-2">
                {(["all", "daily", "weekly", "other"] as BoardFilter[]).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={boardFilter === value ? "default" : "outline"}
                    className={
                      boardFilter === value
                        ? getActionButtonClass("secondary")
                        : "border-slate-300/80 bg-white/75 text-slate-700 hover:bg-white/80"
                    }
                    onClick={() => setBoardFilter(value)}
                  >
                    {value === "all" ? "All boards" : value}
                  </Button>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/75 bg-white/75 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-slate-600">Sport filter</p>
              <div className="flex max-h-20 flex-wrap gap-2 overflow-auto pr-1">
                <Button
                  type="button"
                  size="sm"
                  variant={sportFilter === "all" ? "default" : "outline"}
                  className={
                    sportFilter === "all"
                      ? getActionButtonClass("success")
                      : "border-slate-300/80 bg-white/75 text-slate-700 hover:bg-white/80"
                  }
                  onClick={() => setSportFilter("all")}
                >
                  All sports
                </Button>
                {availableSports.map((sport) => (
                  <Button
                    key={sport.slug}
                    type="button"
                    size="sm"
                    variant={sportFilter === sport.slug ? "default" : "outline"}
                    className={
                      sportFilter === sport.slug
                        ? getActionButtonClass("success")
                        : "border-slate-300/80 bg-white/75 text-slate-700 hover:bg-white/80"
                    }
                    onClick={() => setSportFilter(sport.slug)}
                  >
                    {getSportEmoji(sport.slug)} {sport.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {scope === "global" && globalError ? (
            <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Global analytics unavailable: {globalError}
            </p>
          ) : null}
        </CardHeader>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Selections"
          value={String(dashboard.summary.selections)}
          icon={Activity}
          tone="cyan"
        />
        <MetricCard
          title="Invested"
          value={formatCredits(dashboard.summary.totalStake)}
          icon={PiggyBank}
          tone="violet"
        />
        <MetricCard
          title="Recovered"
          value={formatCredits(dashboard.summary.totalPayout)}
          icon={TrendingUp}
          tone="emerald"
        />
        <MetricCard
          title="Net"
          value={`${dashboard.summary.totalNet >= 0 ? "+" : ""}${formatCredits(
            dashboard.summary.totalNet,
          )}`}
          icon={dashboard.summary.totalNet >= 0 ? TrendingUp : TrendingDown}
          tone={dashboard.summary.totalNet >= 0 ? "emerald" : "rose"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="rounded-2xl border-slate-200/75 bg-white/84 text-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-cyan-600" />
              By sport
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.bySport.length === 0 ? (
              <p className="text-sm text-slate-500">No settled data for the selected filters.</p>
            ) : (
              dashboard.bySport.map((item, index) => (
                <motion.div
                  key={item.key}
                  className="space-y-1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-900">
                      {getSportEmoji(item.key)} {item.label}
                    </span>
                    <span>
                      stake {formatCredits(item.totalStake)} · ROI {formatPercent(item.roiPercent)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/80">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-600 via-violet-600 to-emerald-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${ratio(item.totalStake, maxSportStake)}%` }}
                      transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.03 }}
                    />
                  </div>
                </motion.div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/75 bg-white/84 text-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-cyan-600" />
              Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataRow
              label="ROI"
              value={formatPercent(dashboard.summary.roiPercent)}
              tone={dashboard.summary.roiPercent >= 0 ? "text-emerald-700" : "text-rose-700"}
            />
            <DataRow
              label="Recovery rate"
              value={formatPercent(dashboard.summary.recoveryPercent)}
              tone="text-cyan-700"
            />
            <DataRow
              label="Avg stake"
              value={formatCredits(Math.round(dashboard.summary.averageStake))}
              tone="text-slate-900"
            />
            <DataRow
              label="Hit profile"
              value={`${dashboard.summary.winCount}W / ${dashboard.summary.refundCount}V / ${dashboard.summary.lossCount}L`}
              tone="text-slate-700"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-slate-200/75 bg-white/84 text-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="size-4 text-cyan-600" />
              Weekday rhythm
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.byWeekday.map((item, index) => (
              <motion.div
                key={item.key}
                className="rounded-xl border border-slate-200/75 bg-white/75 p-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.02 }}
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-700">{item.label}</span>
                  <span className="text-slate-500">
                    {formatCredits(item.totalStake)} staked · {formatPercent(item.roiPercent)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/80">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-violet-600/85 to-cyan-600/85"
                    initial={{ width: 0 }}
                    animate={{ width: `${ratio(item.totalStake, maxWeekdayStake)}%` }}
                    transition={{ duration: 0.35, delay: index * 0.02 }}
                  />
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200/75 bg-white/84 text-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="size-4 text-cyan-600" />
              Board and stake profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Board performance</p>
              {dashboard.byBoard.map((item) => (
                <div key={item.key} className="rounded-xl border border-slate-200/75 bg-white/75 p-2">
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium text-slate-900">{item.label}</p>
                    <p className={cn("text-xs", item.roiPercent >= 0 ? "text-emerald-700" : "text-rose-700")}>
                      {formatPercent(item.roiPercent)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">
                    stake {formatCredits(item.totalStake)} · payout {formatCredits(item.totalPayout)}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Stake profile</p>
              {dashboard.byStakeBucket.map((item) => (
                <div key={item.key} className="rounded-xl border border-slate-200/75 bg-white/75 p-2">
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-600">{item.selections} picks</p>
                  </div>
                  <p className="text-xs text-slate-500">
                    staked {formatCredits(item.totalStake)} · net{" "}
                    <span className={item.totalNet >= 0 ? "text-emerald-700" : "text-rose-700"}>
                      {item.totalNet >= 0 ? "+" : ""}
                      {formatCredits(item.totalNet)}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-slate-200/75 bg-white/84 text-slate-900">
        <CardContent className="pt-6">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Medal className="size-3.5 text-cyan-600" />
            Scope: {scope === "me" ? "My portfolio" : "Global settled sample"} · Rows:{" "}
            {filteredRows.length}
          </p>
        </CardContent>
      </Card>
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
    <div className="flex items-center justify-between rounded-xl border border-slate-200/75 bg-white/75 px-3 py-2 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={cn("font-medium", tone)}>{value}</span>
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
  tone: "cyan" | "violet" | "emerald" | "rose";
}) {
  const palette =
    tone === "cyan"
      ? "border-cyan-400/45 bg-cyan-100/85 text-cyan-900 shadow-[0_16px_34px_-24px_rgba(8,145,178,0.5)]"
      : tone === "violet"
        ? "border-violet-400/45 bg-violet-100/85 text-violet-900 shadow-[0_16px_34px_-24px_rgba(109,40,217,0.5)]"
        : tone === "emerald"
          ? "border-emerald-400/45 bg-emerald-100/85 text-emerald-900 shadow-[0_16px_34px_-24px_rgba(5,150,105,0.5)]"
          : "border-rose-400/45 bg-rose-100/85 text-rose-900 shadow-[0_16px_34px_-24px_rgba(225,29,72,0.45)]";

  return (
    <Card className={cn("rounded-2xl border text-slate-900", palette)}>
      <CardContent className="pt-5">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide">
          <Icon className="size-3.5" />
          {title}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
