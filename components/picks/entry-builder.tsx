"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDollarSign,
  Clock3,
  Flame,
  Gem,
  Layers3,
  ShieldCheck,
  Sparkles,
  Target,
  Wallet,
  Zap,
} from "lucide-react";
import {
  lockEntryAction,
  unlockEntryAction,
  upsertSelectionAction,
} from "@/app/actions/entry";
import { Countdown } from "@/components/layout/countdown";
import { FridayDock } from "@/components/layout/friday-dock";
import { PickCard } from "@/components/picks/pick-card";
import { PickDrawer } from "@/components/picks/pick-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { organizePicksBySportHierarchy } from "@/lib/domain/pick-organization";
import { getPickStartTime } from "@/lib/domain/validation";
import { formatCredits, formatUtcDateTime } from "@/lib/format";
import {
  getActionButtonClass,
  getBoardVisualTheme,
  getSportVisualTheme,
} from "@/lib/ui/color-system";
import { getBoardEmoji, getCountryFlag, getLeagueEmoji, getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";
import type { Entry, EntrySelection, PickWithOptions, Round } from "@/lib/types";

interface EntryBuilderProps {
  round: Round;
  entry: Entry;
  picks: PickWithOptions[];
  initialSelections: EntrySelection[];
  initialNowMs: number;
}

interface LocalSelection {
  pickOptionId: string;
  stake: number;
}

function mapSelections(selections: EntrySelection[]): Record<string, LocalSelection> {
  return selections.reduce<Record<string, LocalSelection>>((acc, selection) => {
    acc[selection.pick_id] = {
      pickOptionId: selection.pick_option_id,
      stake: selection.stake,
    };
    return acc;
  }, {});
}

export function EntryBuilder({
  round,
  entry,
  picks,
  initialSelections,
  initialNowMs,
}: EntryBuilderProps) {
  const router = useRouter();
  const [selections, setSelections] = useState<Record<string, LocalSelection>>(
    mapSelections(initialSelections),
  );
  const [activePickId, setActivePickId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showLockSuccess, setShowLockSuccess] = useState(false);
  const [showUnlockSuccess, setShowUnlockSuccess] = useState(false);
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [isPendingSelection, startSelectionTransition] = useTransition();
  const [isPendingLock, startLockTransition] = useTransition();
  const [isPendingUnlock, startUnlockTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const isEntryLocked = entry.status === "locked";
  const isSettled = entry.status === "settled";
  const isClosed = new Date(round.closes_at).getTime() <= nowMs;
  const canEditEntry = !isEntryLocked && !isSettled && !isClosed;

  const creditsSpent = Object.values(selections).reduce(
    (sum, selection) => sum + selection.stake,
    0,
  );
  const creditsRemaining = entry.credits_start - creditsSpent;
  const picksCount = Object.keys(selections).length;

  const hasStakeOutOfRange = Object.values(selections).some(
    (selection) =>
      selection.stake < round.min_stake || selection.stake > round.max_stake,
  );

  const canLock =
    !isEntryLocked &&
    !isSettled &&
    !isClosed &&
    creditsSpent <= entry.credits_start &&
    !hasStakeOutOfRange &&
    (!round.enforce_full_budget || creditsSpent === entry.credits_start);

  const canUnlock = isEntryLocked && !isSettled && !isClosed;

  const lockDisabledReason =
    isEntryLocked
      ? "Entry is already locked."
      : isSettled
        ? "Entry is already settled."
        : isClosed
          ? "Round has already closed."
          : creditsSpent > entry.credits_start
            ? "Credits spent cannot exceed total weekly credits."
            : hasStakeOutOfRange
              ? `Each stake must be between ${round.min_stake} and ${round.max_stake}.`
              : round.enforce_full_budget && creditsSpent !== entry.credits_start
                ? "This round requires spending the full budget before lock."
                : undefined;

  const unlockDisabledReason =
    isSettled
      ? "Settled entries cannot be unlocked."
      : !isEntryLocked
        ? "Entry is already editable."
        : isClosed
          ? "Round has already closed."
          : undefined;

  const organizedSports = useMemo(() => organizePicksBySportHierarchy(picks), [picks]);

  const activePick = picks.find((pick) => pick.id === activePickId) ?? null;

  const progressValue =
    entry.credits_start === 0
      ? 0
      : Math.max(0, Math.min(100, (creditsSpent / entry.credits_start) * 100));

  const boardStats = useMemo(() => {
    let dailyCount = 0;
    let weeklyCount = 0;

    for (const pick of picks) {
      const title = pick.title.toUpperCase();
      if (title.startsWith("[DAILY]")) {
        dailyCount += 1;
      } else if (title.startsWith("[WEEK]")) {
        weeklyCount += 1;
      }
    }

    return {
      dailyCount,
      weeklyCount,
      sportsCount: new Set(picks.map((pick) => pick.sport.id)).size,
    };
  }, [picks]);

  const dailyBoardTheme = getBoardVisualTheme("daily");
  const weeklyBoardTheme = getBoardVisualTheme("weekly");

  const sportPulse = useMemo(() => {
    const pickById = new Map(picks.map((pick) => [pick.id, pick]));
    const map = new Map<
      string,
      {
        total: number;
        selected: number;
        spent: number;
        daily: number;
        weekly: number;
      }
    >();

    for (const pick of picks) {
      const key = pick.sport.slug;
      const current = map.get(key) ?? {
        total: 0,
        selected: 0,
        spent: 0,
        daily: 0,
        weekly: 0,
      };
      current.total += 1;
      const title = pick.title.toUpperCase();
      if (title.startsWith("[DAILY]")) {
        current.daily += 1;
      } else if (title.startsWith("[WEEK]")) {
        current.weekly += 1;
      }
      map.set(key, current);
    }

    for (const [pickId, selection] of Object.entries(selections)) {
      const pick = pickById.get(pickId);
      if (!pick) {
        continue;
      }
      const key = pick.sport.slug;
      const current = map.get(key);
      if (!current) {
        continue;
      }
      current.selected += 1;
      current.spent += selection.stake;
    }

    return map;
  }, [picks, selections]);

  function isNodeCollapsed(nodeKey: string): boolean {
    return collapsedNodes[nodeKey] ?? false;
  }

  function toggleNode(nodeKey: string): void {
    setCollapsedNodes((current) => ({
      ...current,
      [nodeKey]: !current[nodeKey],
    }));
  }

  function setSportPanelsCollapsed(collapsed: boolean): void {
    setCollapsedNodes((current) => {
      const next = { ...current };
      for (const sport of organizedSports) {
        next[`sport:${sport.sportId}`] = collapsed;
      }
      return next;
    });
  }

  return (
    <div className="space-y-6 pb-32">
      <Card className="relative overflow-hidden rounded-3xl border border-slate-300/70 bg-[linear-gradient(145deg,rgba(255,251,242,0.97),rgba(250,246,236,0.95)),radial-gradient(circle_at_16%_8%,rgba(8,145,178,0.14),transparent_42%),radial-gradient(circle_at_86%_6%,rgba(109,40,217,0.12),transparent_38%),radial-gradient(circle_at_56%_100%,rgba(5,150,105,0.12),transparent_42%)] text-slate-900 shadow-[0_56px_150px_-74px_rgba(37,99,235,0.42)]">
        <div className="pointer-events-none absolute inset-0 opacity-85">
          <div className="absolute -top-16 left-8 h-52 w-52 rounded-full bg-cyan-600/26 blur-3xl" />
          <div className="absolute right-12 top-6 h-44 w-44 rounded-full bg-violet-600/18 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-emerald-600/20 blur-3xl" />
        </div>

        <CardHeader className="relative space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <Badge className="w-fit border border-cyan-700/35 bg-cyan-200/70 text-cyan-950">
                Friday Main Screen
              </Badge>
              <CardTitle className="text-2xl tracking-tight">{round.name}</CardTitle>
              <p className="text-sm text-slate-600">
                Portfolio flow: Sport → Board → Country → League → Event.
              </p>
            </div>
            <div className="rounded-xl border border-slate-300/70 bg-[#fff9ef]/85 px-3 py-2">
              <Countdown closesAt={round.closes_at} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn("border-cyan-700/25 bg-cyan-100/70 text-cyan-950", getActionButtonClass("neutral"))}
              onClick={() => setSportPanelsCollapsed(false)}
            >
              Expand sports
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn("border-violet-700/25 bg-violet-100/70 text-violet-950", getActionButtonClass("neutral"))}
              onClick={() => setSportPanelsCollapsed(true)}
            >
              Collapse sports
            </Button>
            {organizedSports.slice(0, 8).map((sport) => (
              <Badge key={sport.sportId} variant="outline" className="border-slate-300/80 bg-white/75 text-slate-700">
                {sport.displayName}
              </Badge>
            ))}
          </div>
        </CardHeader>

        <CardContent className="relative space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.9fr]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-cyan-700/25 bg-gradient-to-br from-cyan-200/82 to-blue-100/74 p-3 shadow-[0_14px_34px_-24px_rgba(12,74,110,0.34)]">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                    <CircleDollarSign className="size-4 text-cyan-600" />
                    Credits spent
                  </p>
                  <p className="mt-1 text-xl font-semibold">
                    {formatCredits(creditsSpent)} / {formatCredits(entry.credits_start)}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-700/25 bg-gradient-to-br from-emerald-200/82 to-teal-100/74 p-3 shadow-[0_14px_34px_-24px_rgba(5,150,105,0.3)]">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                    <Wallet className="size-4 text-cyan-600" />
                    Remaining cash
                  </p>
                  <p className="mt-1 text-xl font-semibold">{formatCredits(creditsRemaining)}</p>
                </div>
                <div className="rounded-xl border border-violet-700/25 bg-gradient-to-br from-violet-200/82 to-fuchsia-100/74 p-3 shadow-[0_14px_34px_-24px_rgba(109,40,217,0.3)]">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                    <Layers3 className="size-4 text-cyan-600" />
                    Picks selected
                  </p>
                  <p className="mt-1 text-xl font-semibold">{picksCount}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className={cn("rounded-xl border p-3", dailyBoardTheme.statCardClassName)}>
                  <p className="text-xs uppercase tracking-wide text-emerald-800">Daily board</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-900">
                    {boardStats.dailyCount} picks
                  </p>
                </div>
                <div className={cn("rounded-xl border p-3", weeklyBoardTheme.statCardClassName)}>
                  <p className="text-xs uppercase tracking-wide text-violet-800">Weekly board</p>
                  <p className="mt-1 text-lg font-semibold text-violet-900">
                    {boardStats.weeklyCount} picks
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-700/35 bg-gradient-to-br from-cyan-200/78 to-blue-100/72 p-3 shadow-[0_16px_34px_-24px_rgba(8,145,178,0.48)]">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-cyan-800">
                    <Gem className="size-3.5" />
                    Active sports
                  </p>
                  <p className="mt-1 text-lg font-semibold text-cyan-900">{boardStats.sportsCount}</p>
                </div>
              </div>

              <div className="rounded-xl border border-blue-700/20 bg-gradient-to-r from-blue-100/66 via-cyan-100/48 to-violet-100/44 p-3">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                  <span>Budget flow</span>
                  <span>{Math.round(progressValue)}%</span>
                </div>
                <Progress value={progressValue} className="h-2 bg-white/80" />
              </div>

              <div className="rounded-xl border border-amber-700/22 bg-gradient-to-r from-amber-100/68 via-orange-100/45 to-rose-100/40 p-3">
                <p className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                  <Flame className="size-3.5 text-cyan-600" />
                  Weekly constraints
                </p>
                <p className="text-xs text-slate-600">
                  Stake limits: {round.min_stake} - {round.max_stake}
                  {round.enforce_full_budget
                    ? " | full budget required to lock"
                    : " | cash can remain unspent"}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-indigo-700/20 bg-gradient-to-br from-indigo-100/64 via-violet-100/46 to-cyan-100/42 p-4">
                <p className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                  <Zap className="size-3.5 text-cyan-600" />
                  Live posture
                </p>
                <div className="flex items-center gap-4">
                    <div
                      className="relative grid h-28 w-28 place-items-center rounded-full"
                      style={{
                        background: `conic-gradient(rgba(12,74,110,0.92) ${progressValue}%, rgba(100,116,139,0.22) ${progressValue}% 100%)`,
                      }}
                    >
                    <div className="grid h-20 w-20 place-items-center rounded-full bg-[#fff9ef]">
                      <p className="text-sm font-semibold">{Math.round(progressValue)}%</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">spent</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <p className="flex items-center gap-2 text-slate-600">
                      <Clock3 className="size-3.5 text-cyan-600" />
                      Window {isClosed ? "closed" : "open"}
                    </p>
                    <p className="flex items-center gap-2 text-slate-600">
                      <Target className="size-3.5 text-cyan-600" />
                      {canLock ? "Ready to lock" : "Not ready to lock"}
                    </p>
                    <p className="flex items-center gap-2 text-slate-600">
                      <ShieldCheck className="size-3.5 text-cyan-600" />
                      {isEntryLocked ? "Entry locked" : "Entry editable"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-700/20 bg-gradient-to-br from-emerald-100/62 via-cyan-100/44 to-blue-100/38 p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-600">
                  Sport exposure
                </p>
                <div className="space-y-2">
                  {organizedSports.map((sport) => {
                    const pulse = sportPulse.get(sport.sportSlug);
                    const selected = pulse?.selected ?? 0;
                    const spent = pulse?.spent ?? 0;
                    const fill = pulse && pulse.total > 0 ? (selected / pulse.total) * 100 : 0;

                    return (
                      <div key={`pulse:${sport.sportId}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-700">{sport.displayName}</span>
                          <span className="text-slate-500">
                            {selected}/{pulse?.total ?? sport.picksCount} · {formatCredits(spent)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#fff6ea]/85">
                          <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-600 via-violet-600 to-emerald-600"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(0, Math.min(fill, 100))}%` }}
                            transition={{ duration: 0.25 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {isEntryLocked ? (
            <p className="flex items-center gap-2 text-sm text-cyan-600">
              <Sparkles className="size-4" />
              Entry is locked. Unlock it to continue editing while the round is still open.
            </p>
          ) : null}

          {feedback ? <p className="text-sm text-rose-600">{feedback}</p> : null}
        </CardContent>
      </Card>

      {organizedSports.map((sport) => {
        const sportKey = `sport:${sport.sportId}`;
        const sportCollapsed = isNodeCollapsed(sportKey);
        const sportTheme = getSportVisualTheme(sport.sportSlug);
        const pulse = sportPulse.get(sport.sportSlug);
        const selectedCount = pulse?.selected ?? 0;
        const spentCredits = pulse?.spent ?? 0;
        const dailyCount = pulse?.daily ?? 0;
        const weeklyCount = pulse?.weekly ?? 0;

        return (
          <section
            key={sportKey}
            className="space-y-3 rounded-3xl border border-slate-300/75 bg-[#fff9ef]/90 p-3 shadow-[0_32px_78px_-52px_rgba(30,64,175,0.36)]"
          >
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-3",
                sportTheme.sectionClassName,
              )}
            >
              <button
                type="button"
                className="inline-flex items-center gap-2 text-left text-lg font-semibold text-slate-900"
                onClick={() => toggleNode(sportKey)}
              >
                {sportCollapsed ? (
                  <ChevronRight className="size-4 text-slate-600" />
                ) : (
                  <ChevronDown className="size-4 text-slate-600" />
                )}
                <span>{getSportEmoji(sport.sportSlug)}</span>
                {sport.displayName}
              </button>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-slate-300/80 bg-white/75 text-slate-700">
                  {sport.picksCount} picks
                </Badge>
                <Badge variant="outline" className="border-cyan-400/45 bg-cyan-100 text-cyan-900">
                  {selectedCount} selected
                </Badge>
                <Badge variant="outline" className="border-violet-400/45 bg-violet-100 text-violet-900">
                  {formatCredits(spentCredits)} staked
                </Badge>
                <Badge variant="outline" className="border-emerald-400/45 bg-emerald-100 text-emerald-900">
                  {dailyCount} daily / {weeklyCount} weekly
                </Badge>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {!sportCollapsed ? (
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, height: 0, y: -6 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {sport.boards.map((board) => {
                    const boardKey = `${sportKey}:board:${board.boardType}`;
                    const boardCollapsed = isNodeCollapsed(boardKey);
                    const boardTheme = getBoardVisualTheme(board.boardType);

                    return (
                      <section key={boardKey} className="space-y-3">
                        <div
                          className={cn(
                            "rounded-2xl border px-3 py-2 shadow-inner",
                            boardTheme.panelClassName,
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 text-left text-sm font-semibold text-slate-900"
                              onClick={() => toggleNode(boardKey)}
                            >
                              {boardCollapsed ? (
                                <ChevronRight className="size-4 text-slate-600" />
                              ) : (
                                <ChevronDown className="size-4 text-slate-600" />
                              )}
                              <Circle
                                className={cn(
                                  "size-2.5 fill-current",
                                  boardTheme.dotClassName,
                                )}
                              />
                              <span>{getBoardEmoji(board.boardType)}</span>
                              {board.label}
                            </button>
                            <Badge className={boardTheme.badgeClassName}>{board.picksCount}</Badge>
                          </div>
                        </div>

                        <AnimatePresence initial={false}>
                          {!boardCollapsed ? (
                            <motion.div
                              className="space-y-4"
                              initial={{ opacity: 0, height: 0, y: -6 }}
                              animate={{ opacity: 1, height: "auto", y: 0 }}
                              exit={{ opacity: 0, height: 0, y: -6 }}
                              transition={{ duration: 0.18 }}
                            >
                              {board.countries.map((country) => {
                                const countryKey = `${boardKey}:country:${country.countryName}`;
                                const countryCollapsed = isNodeCollapsed(countryKey);

                                return (
                                  <section
                                    key={countryKey}
                                    className="rounded-2xl border border-slate-200/75 bg-[#fffaf2]/84 p-3"
                                  >
                                    <div className="mb-2 flex items-center justify-between">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-2 text-left text-sm font-semibold uppercase tracking-wide text-slate-700"
                                        onClick={() => toggleNode(countryKey)}
                                      >
                                        {countryCollapsed ? (
                                          <ChevronRight className="size-4 text-slate-600" />
                                        ) : (
                                          <ChevronDown className="size-4 text-slate-600" />
                                        )}
                                        <span>{getCountryFlag(country.countryName)}</span>
                                        {country.countryName}
                                      </button>
                                      <Badge variant="outline" className="border-slate-300/80 bg-white/75 text-slate-600">
                                        {country.picksCount}
                                      </Badge>
                                    </div>

                                    <AnimatePresence initial={false}>
                                      {!countryCollapsed ? (
                                        <motion.div
                                          className="space-y-4"
                                          initial={{ opacity: 0, height: 0, y: -6 }}
                                          animate={{ opacity: 1, height: "auto", y: 0 }}
                                          exit={{ opacity: 0, height: 0, y: -6 }}
                                          transition={{ duration: 0.18 }}
                                        >
                                          {country.leagues.map((league) => {
                                            const leagueKey = `${countryKey}:league:${league.leagueName}`;
                                            const leagueCollapsed = isNodeCollapsed(leagueKey);

                                            return (
                                              <section key={leagueKey}>
                                                <div className="mb-2 flex items-center justify-between rounded-xl border border-slate-200/75 bg-[#f7f1e7]/85 px-3 py-2">
                                                  <button
                                                    type="button"
                                                    className="inline-flex items-center gap-2 text-left text-sm font-medium text-slate-900"
                                                    onClick={() => toggleNode(leagueKey)}
                                                  >
                                                    {leagueCollapsed ? (
                                                      <ChevronRight className="size-4 text-slate-600" />
                                                    ) : (
                                                      <ChevronDown className="size-4 text-slate-600" />
                                                    )}
                                                    <span>{getLeagueEmoji(league.leagueName)}</span>
                                                    {league.leagueName}
                                                  </button>
                                                  <p className="text-xs text-slate-500">{league.picksCount} picks</p>
                                                </div>

                                                <AnimatePresence initial={false}>
                                                  {!leagueCollapsed ? (
                                                    <motion.div
                                                      className="space-y-3"
                                                      initial={{ opacity: 0, height: 0, y: -6 }}
                                                      animate={{ opacity: 1, height: "auto", y: 0 }}
                                                      exit={{ opacity: 0, height: 0, y: -6 }}
                                                      transition={{ duration: 0.18 }}
                                                    >
                                                      {league.events.map((eventGroup) => {
                                                        const eventKey = `${leagueKey}:event:${eventGroup.eventKey}`;
                                                        const eventCollapsed = isNodeCollapsed(eventKey);

                                                        return (
                                                          <section
                                                            key={eventKey}
                                                            className="rounded-xl border border-slate-200/75 bg-[#fffdf8]/86 p-3"
                                                          >
                                                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                                              <button
                                                                type="button"
                                                                className="inline-flex items-center gap-2 text-left text-sm font-semibold text-slate-900"
                                                                onClick={() => toggleNode(eventKey)}
                                                              >
                                                                {eventCollapsed ? (
                                                                  <ChevronRight className="size-4 text-slate-600" />
                                                                ) : (
                                                                  <ChevronDown className="size-4 text-slate-600" />
                                                                )}
                                                                <span aria-hidden>🎫</span>
                                                                {eventGroup.eventName}
                                                              </button>
                                                              <div className="flex items-center gap-2">
                                                                <Badge
                                                                  variant="outline"
                                                                  className="border-slate-300/80 bg-white/75 text-slate-600"
                                                                >
                                                                  {eventGroup.picks.length} picks
                                                                </Badge>
                                                                <p className="text-xs text-slate-500">
                                                                  {eventGroup.startTime
                                                                    ? formatUtcDateTime(eventGroup.startTime)
                                                                    : "Missing start_time"}
                                                                </p>
                                                              </div>
                                                            </div>

                                                            <AnimatePresence initial={false}>
                                                              {!eventCollapsed ? (
                                                                <motion.div
                                                                  className="grid gap-3 lg:grid-cols-2"
                                                                  initial={{ opacity: 0, height: 0, y: -6 }}
                                                                  animate={{ opacity: 1, height: "auto", y: 0 }}
                                                                  exit={{ opacity: 0, height: 0, y: -6 }}
                                                                  transition={{ duration: 0.18 }}
                                                                >
                                                                  {eventGroup.picks.map((pick) => {
                                                                    const selection = selections[pick.id];
                                                                    const selectedOption = pick.options.find(
                                                                      (option) => option.id === selection?.pickOptionId,
                                                                    );

                                                                    const startTime = getPickStartTime(pick);
                                                                    const eventStartText = startTime
                                                                      ? formatUtcDateTime(startTime)
                                                                      : "Missing start_time";

                                                                    const pickLockReason = isSettled
                                                                      ? "Locked: round settled"
                                                                      : isEntryLocked
                                                                        ? "Locked: entry locked"
                                                                        : isClosed
                                                                          ? "Locked: week closed"
                                                                          : !startTime
                                                                            ? "Locked: missing event start"
                                                                            : startTime.getTime() <= nowMs
                                                                              ? "Locked: event started"
                                                                              : undefined;

                                                                    return (
                                                                      <PickCard
                                                                        key={pick.id}
                                                                        pick={pick}
                                                                        selectedLabel={selectedOption?.label}
                                                                        selectedStake={selection?.stake}
                                                                        selectedOdds={selectedOption?.odds}
                                                                        eventStartText={eventStartText}
                                                                        lockReason={pickLockReason}
                                                                        disabled={Boolean(pickLockReason) || !canEditEntry}
                                                                        accentClassName={sportTheme.accentClassName}
                                                                        onOpen={() => {
                                                                          setFeedback(null);
                                                                          setActivePickId(pick.id);
                                                                        }}
                                                                      />
                                                                    );
                                                                  })}
                                                                </motion.div>
                                                              ) : null}
                                                            </AnimatePresence>
                                                          </section>
                                                        );
                                                      })}
                                                    </motion.div>
                                                  ) : null}
                                                </AnimatePresence>
                                              </section>
                                            );
                                          })}
                                        </motion.div>
                                      ) : null}
                                    </AnimatePresence>
                                  </section>
                                );
                              })}
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </section>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );
      })}

      {organizedSports.length === 0 ? (
        <Card className="border border-slate-200/75 bg-[#fffaf2]/84 text-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm">No picks available for this round.</p>
          </CardContent>
        </Card>
      ) : null}

      <PickDrawer
        pick={activePick}
        open={Boolean(activePick)}
        minStake={round.min_stake}
        maxStake={round.max_stake}
        initialOptionId={activePick ? selections[activePick.id]?.pickOptionId : undefined}
        initialStake={activePick ? selections[activePick.id]?.stake : undefined}
        pending={isPendingSelection}
        onClose={() => setActivePickId(null)}
        onConfirm={({ pickId, pickOptionId, stake }) => {
          startSelectionTransition(async () => {
            const result = await upsertSelectionAction({
              entryId: entry.id,
              pickId,
              pickOptionId,
              stake,
            });

            if (!result.ok) {
              const details = result.errors?.join(" ");
              setFeedback(
                details
                  ? `${result.error ?? "Could not save selection."} ${details}`
                  : result.error ?? "Could not save selection.",
              );
              return;
            }

            setSelections((current) => ({
              ...current,
              [pickId]: {
                pickOptionId,
                stake,
              },
            }));
            setActivePickId(null);
          });
        }}
      />

      <FridayDock
        creditsSpent={creditsSpent}
        creditsRemaining={creditsRemaining}
        creditsStart={entry.credits_start}
        picksCount={picksCount}
        isLocked={isEntryLocked}
        canLock={canLock}
        canUnlock={canUnlock}
        lockDisabledReason={lockDisabledReason}
        unlockDisabledReason={unlockDisabledReason}
        isLocking={isPendingLock}
        isUnlocking={isPendingUnlock}
        onLock={() => {
          startLockTransition(async () => {
            const result = await lockEntryAction({ entryId: entry.id });
            if (!result.ok) {
              const details = result.errors?.join(" ");
              setFeedback(details ? `${result.error} ${details}` : result.error ?? "Lock failed.");
              return;
            }

            setShowLockSuccess(true);
            window.setTimeout(() => {
              setShowLockSuccess(false);
              router.refresh();
            }, 900);
          });
        }}
        onUnlock={() => {
          startUnlockTransition(async () => {
            const result = await unlockEntryAction({ entryId: entry.id });
            if (!result.ok) {
              setFeedback(result.error ?? "Unlock failed.");
              return;
            }

            setShowUnlockSuccess(true);
            window.setTimeout(() => {
              setShowUnlockSuccess(false);
              router.refresh();
            }, 700);
          });
        }}
      />

      <AnimatePresence>
        {showLockSuccess ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-white/82 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="rounded-2xl border border-cyan-300/40 bg-white px-8 py-6 text-center shadow-xl"
              initial={{ y: 20, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 10, scale: 0.95 }}
            >
              <p className="text-lg font-semibold text-cyan-600">Entry locked</p>
              <p className="text-sm text-slate-600">You can unlock while the round stays open.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showUnlockSuccess ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-white/78 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="rounded-2xl border border-emerald-300/40 bg-white px-8 py-6 text-center shadow-xl"
              initial={{ y: 20, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 10, scale: 0.95 }}
            >
              <p className="text-lg font-semibold text-emerald-600">Entry unlocked</p>
              <p className="text-sm text-slate-600">Continue editing available picks.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
