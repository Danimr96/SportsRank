"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  CircleDot,
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
import { Progress } from "@/components/ui/progress";
import {
  getPickBoardType,
  organizePicksBySportHierarchy,
  type OrganizedSportBoardGroup,
} from "@/lib/domain/pick-organization";
import { getPickStartTime } from "@/lib/domain/validation";
import { formatCredits, formatUtcDateTime } from "@/lib/format";
import { getBoardVisualTheme } from "@/lib/ui/color-system";
import { getCountryFlag, getLeagueEmoji, getSportEmoji } from "@/lib/visuals";
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

type BoardFilter = "all" | "daily" | "weekly" | "other";

interface FlatBoardEvent {
  key: string;
  countryName: string;
  leagueName: string;
  eventName: string;
  startTime: Date | null;
  picks: PickWithOptions[];
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

function flattenBoardEvents(board: OrganizedSportBoardGroup): FlatBoardEvent[] {
  const flattened: FlatBoardEvent[] = [];
  for (const country of board.countries) {
    for (const league of country.leagues) {
      for (const event of league.events) {
        flattened.push({
          key: `${country.countryName}:${league.leagueName}:${event.eventKey}`,
          countryName: country.countryName,
          leagueName: league.leagueName,
          eventName: event.eventName,
          startTime: event.startTime,
          picks: event.picks,
        });
      }
    }
  }
  return flattened;
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
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
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
      const board = getPickBoardType(pick.title);
      if (board === "daily") {
        dailyCount += 1;
      } else if (board === "weekly") {
        weeklyCount += 1;
      }
    }

    return {
      dailyCount,
      weeklyCount,
      sportsCount: new Set(picks.map((pick) => pick.sport.id)).size,
    };
  }, [picks]);

  const sportPulse = useMemo(() => {
    const pickById = new Map(picks.map((pick) => [pick.id, pick]));
    const map = new Map<
      string,
      {
        total: number;
        selected: number;
        spent: number;
      }
    >();

    for (const pick of picks) {
      const key = pick.sport.slug;
      const current = map.get(key) ?? { total: 0, selected: 0, spent: 0 };
      current.total += 1;
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

  const filteredSports = useMemo(() => {
    return organizedSports
      .map((sport) => {
        const boards =
          boardFilter === "all"
            ? sport.boards
            : sport.boards.filter((board) => board.boardType === boardFilter);
        const picksInView = boards.reduce((sum, board) => sum + board.picksCount, 0);
        return {
          ...sport,
          boards,
          picksCount: picksInView,
        };
      })
      .filter((sport) => {
        if (sportFilter !== "all" && sport.sportSlug !== sportFilter) {
          return false;
        }
        return sport.picksCount > 0;
      });
  }, [organizedSports, boardFilter, sportFilter]);

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
    <div className="space-y-8 pb-32">
      <section className="space-y-6">
        <header className="grid gap-5 border-b border-stone-200 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Current round</p>
            <h1 className="font-display text-display-md text-ink">{round.name}</h1>
            <p className="max-w-2xl text-sm text-stone-600">
              Build picks calmly. Primary focus: credits, active selections, and lock timing.
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Time to close</p>
            <Countdown closesAt={round.closes_at} />
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Credits remaining</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{formatCredits(creditsRemaining)}</p>
          </article>
          <article className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Credits spent</p>
            <p className="mt-1 text-2xl font-semibold text-ink">
              {formatCredits(creditsSpent)} / {formatCredits(entry.credits_start)}
            </p>
          </article>
          <article className="rounded-lg border border-stone-200 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Picks selected</p>
            <p className="mt-1 text-2xl font-semibold text-ink">{picksCount}</p>
          </article>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <div className="sticky top-20 z-20 space-y-3 rounded-lg border border-stone-200 bg-[#faf9f7]/95 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-2 text-xs uppercase tracking-[0.14em] text-stone-500">Board</p>
                {(["all", "daily", "weekly", "other"] as BoardFilter[]).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={boardFilter === value ? "default" : "outline"}
                    className={cn("h-8", boardFilter === value ? "" : "text-stone-600")}
                    onClick={() => setBoardFilter(value)}
                  >
                    {value === "all" ? "All boards" : value}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="mr-2 text-xs uppercase tracking-[0.14em] text-stone-500">Sport</p>
                <Button
                  type="button"
                  size="sm"
                  variant={sportFilter === "all" ? "default" : "outline"}
                  className={cn("h-8", sportFilter === "all" ? "" : "text-stone-600")}
                  onClick={() => setSportFilter("all")}
                >
                  All sports
                </Button>
                {organizedSports.map((sport) => (
                  <Button
                    key={`filter:${sport.sportId}`}
                    type="button"
                    size="sm"
                    variant={sportFilter === sport.sportSlug ? "default" : "outline"}
                    className={cn("h-8", sportFilter === sport.sportSlug ? "" : "text-stone-600")}
                    onClick={() => setSportFilter(sport.sportSlug)}
                  >
                    {getSportEmoji(sport.sportSlug)} {sport.displayName}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-stone-600"
                  onClick={() => setSportPanelsCollapsed(false)}
                >
                  Expand sports
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-stone-600"
                  onClick={() => setSportPanelsCollapsed(true)}
                >
                  Collapse sports
                </Button>
              </div>
            </div>

            <section className="space-y-5">
              {filteredSports.length === 0 ? (
                <div className="rounded-lg border border-stone-200 bg-white p-6">
                  <p className="text-sm text-stone-600">No picks for this filter set.</p>
                </div>
              ) : null}

              {filteredSports.map((sport, sportIndex) => {
                const sportKey = `sport:${sport.sportId}`;
                const sportCollapsed = isNodeCollapsed(sportKey);
                const pulse = sportPulse.get(sport.sportSlug);
                const selectedCount = pulse?.selected ?? 0;
                const spentCredits = pulse?.spent ?? 0;

                return (
                  <motion.section
                    key={sportKey}
                    className="rounded-xl border border-stone-200 bg-white"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, delay: sportIndex * 0.03 }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 text-left"
                        onClick={() => toggleNode(sportKey)}
                      >
                        {sportCollapsed ? (
                          <ChevronRight className="size-4 text-stone-500" />
                        ) : (
                          <ChevronDown className="size-4 text-stone-500" />
                        )}
                        <span className="text-lg">{getSportEmoji(sport.sportSlug)}</span>
                        <span className="text-lg font-medium text-stone-900">{sport.displayName}</span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{sport.picksCount} picks</Badge>
                        <Badge variant="secondary">{selectedCount} selected</Badge>
                        <Badge variant="outline">{formatCredits(spentCredits)} staked</Badge>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {!sportCollapsed ? (
                        <motion.div
                          className="space-y-4 px-4 py-4"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                        >
                          {sport.boards.map((board) => {
                            const boardKey = `${sportKey}:board:${board.boardType}`;
                            const boardCollapsed = isNodeCollapsed(boardKey);
                            const boardTheme = getBoardVisualTheme(board.boardType);
                            const events = flattenBoardEvents(board);

                            return (
                              <section key={boardKey} className="space-y-3">
                                <div
                                  className={cn(
                                    "flex items-center justify-between rounded-md border px-3 py-2",
                                    boardTheme.panelClassName,
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 text-left text-sm font-medium text-stone-900"
                                    onClick={() => toggleNode(boardKey)}
                                  >
                                    {boardCollapsed ? (
                                      <ChevronRight className="size-4 text-stone-500" />
                                    ) : (
                                      <ChevronDown className="size-4 text-stone-500" />
                                    )}
                                    <CircleDot className={cn("size-3", boardTheme.dotClassName)} />
                                    {board.label}
                                  </button>
                                  <Badge className={boardTheme.badgeClassName}>{board.picksCount}</Badge>
                                </div>

                                <AnimatePresence initial={false}>
                                  {!boardCollapsed ? (
                                    <motion.div
                                      className="space-y-4"
                                      initial={{ opacity: 0, height: 0 }}
                                      animate={{ opacity: 1, height: "auto" }}
                                      exit={{ opacity: 0, height: 0 }}
                                      transition={{ duration: 0.16, ease: "easeOut" }}
                                    >
                                      {events.map((event) => {
                                        const eventKey = `${boardKey}:event:${event.key}`;
                                        const eventCollapsed = isNodeCollapsed(eventKey);
                                        return (
                                          <section
                                            key={eventKey}
                                            className="rounded-md border border-stone-200 bg-[#fcfcfb]"
                                          >
                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-3 py-2.5">
                                              <button
                                                type="button"
                                                className="inline-flex items-center gap-2 text-left"
                                                onClick={() => toggleNode(eventKey)}
                                              >
                                                {eventCollapsed ? (
                                                  <ChevronRight className="size-4 text-stone-500" />
                                                ) : (
                                                  <ChevronDown className="size-4 text-stone-500" />
                                                )}
                                                <div className="space-y-0.5">
                                                  <p className="text-xs uppercase tracking-[0.14em] text-stone-500">
                                                    {getCountryFlag(event.countryName)} {event.countryName} ·{" "}
                                                    {getLeagueEmoji(event.leagueName)} {event.leagueName}
                                                  </p>
                                                  <p className="text-sm font-medium text-stone-900">{event.eventName}</p>
                                                </div>
                                              </button>
                                              <div className="text-right">
                                                <p className="text-xs text-stone-500">
                                                  {event.startTime
                                                    ? formatUtcDateTime(event.startTime)
                                                    : "Missing start_time"}
                                                </p>
                                                <p className="text-xs text-stone-500">{event.picks.length} picks</p>
                                              </div>
                                            </div>

                                            <AnimatePresence initial={false}>
                                              {!eventCollapsed ? (
                                                <motion.div
                                                  className="px-3"
                                                  initial={{ opacity: 0, height: 0 }}
                                                  animate={{ opacity: 1, height: "auto" }}
                                                  exit={{ opacity: 0, height: 0 }}
                                                  transition={{ duration: 0.14, ease: "easeOut" }}
                                                >
                                                  {event.picks.map((pick) => {
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
                  </motion.section>
                );
              })}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
            <section className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Portfolio posture</p>
              <p className="mt-3 text-sm text-stone-700">
                <span className="font-medium text-stone-900">Window:</span> {isClosed ? "Closed" : "Open"}
              </p>
              <p className="mt-1 text-sm text-stone-700">
                <span className="font-medium text-stone-900">Status:</span>{" "}
                {isEntryLocked ? "Entry locked" : "Entry editable"}
              </p>
              <p className="mt-1 text-sm text-stone-700">
                <span className="font-medium text-stone-900">Ready to lock:</span> {canLock ? "Yes" : "No"}
              </p>
              <div className="mt-4">
                <Progress value={progressValue} className="h-1.5 bg-stone-100" />
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="mb-3 text-xs uppercase tracking-[0.14em] text-stone-500">Board mix</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">Daily</span>
                  <span className="font-medium text-stone-900">{boardStats.dailyCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">Weekly</span>
                  <span className="font-medium text-stone-900">{boardStats.weeklyCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">Sports active</span>
                  <span className="font-medium text-stone-900">{boardStats.sportsCount}</span>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-stone-200 bg-white p-4">
              <p className="mb-2 text-xs uppercase tracking-[0.14em] text-stone-500">Constraints</p>
              <p className="text-sm text-stone-700">
                Stake limits {round.min_stake} - {round.max_stake}
              </p>
              <p className="text-sm text-stone-700">
                {round.enforce_full_budget ? "Full budget required for lock." : "Unused cash is allowed."}
              </p>
            </section>
          </aside>
        </div>
      </section>

      {feedback ? <p className="text-sm text-rose-600">{feedback}</p> : null}

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
            className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/18 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="rounded-lg border border-stone-200 bg-white px-8 py-6 text-center shadow-xl"
              initial={{ y: 8, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 6, scale: 0.98 }}
            >
              <p className="text-lg font-medium text-stone-900">Entry locked</p>
              <p className="text-sm text-stone-600">You can unlock while the round remains open.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showUnlockSuccess ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/18 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="rounded-lg border border-stone-200 bg-white px-8 py-6 text-center shadow-xl"
              initial={{ y: 8, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 6, scale: 0.98 }}
            >
              <p className="text-lg font-medium text-stone-900">Entry unlocked</p>
              <p className="text-sm text-stone-600">Continue editing available picks.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
