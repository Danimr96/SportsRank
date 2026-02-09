"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  Coins,
  Lightbulb,
  Layers3,
  Sparkles,
  Wallet,
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
import {
  buildStakeSuggestions,
  computeProjectedRankRange,
  projectEntryRange,
  type LiveSimulationInput,
  type SimulationScenario,
  type SimulationSelectionInput,
} from "@/lib/domain/simulator";
import { getPickStartTime } from "@/lib/domain/validation";
import { formatCredits, formatUtcDateTime } from "@/lib/format";
import { trackEvent } from "@/lib/telemetry/client";
import { getCountryFlag, getLeagueEmoji, getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";
import type { Entry, EntrySelection, PickWithOptions, Round } from "@/lib/types";

interface EntryBuilderProps {
  round: Round;
  entry: Entry;
  picks: PickWithOptions[];
  initialSelections: EntrySelection[];
  initialNowMs: number;
  coachEntries: LiveSimulationInput[];
  coachLoadError?: string | null;
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

interface BoardTheme {
  panel: string;
  dot: string;
  badge: "default" | "secondary" | "outline";
}

const BOARD_FILTERS: BoardFilter[] = ["all", "daily", "weekly", "other"];

const BOARD_THEME: Record<Exclude<BoardFilter, "all">, BoardTheme> = {
  daily: {
    panel: "border-forest/30 bg-forest/5",
    dot: "bg-forest",
    badge: "default",
  },
  weekly: {
    panel: "border-clay/35 bg-clay/10",
    dot: "bg-clay",
    badge: "secondary",
  },
  other: {
    panel: "border-stone-300 bg-bone-50",
    dot: "bg-stone-500",
    badge: "outline",
  },
};

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

function defaultNodeCollapsed(nodeKey: string): boolean {
  if (nodeKey.startsWith("sport:")) {
    return true;
  }
  if (nodeKey.includes(":event:")) {
    return true;
  }
  return false;
}

function filterChipClass(active: boolean): string {
  return cn(
    "inline-flex h-9 items-center rounded-full border px-3.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors",
    active
      ? "border-forest bg-forest text-bone"
      : "border-stone-400/70 bg-transparent text-ink hover:bg-bone-100",
  );
}

function boardFilterLabel(value: BoardFilter): string {
  if (value === "all") {
    return "All boards";
  }
  return value;
}

function scenarioLabel(scenario: SimulationScenario): string {
  if (scenario === "conservative") {
    return "Conservador";
  }
  if (scenario === "aggressive") {
    return "Agresivo";
  }
  return "Base";
}

function formatRank(rank: number | null): string {
  if (!rank) {
    return "—";
  }
  return `#${rank}`;
}

export function EntryBuilder({
  round,
  entry,
  picks,
  initialSelections,
  initialNowMs,
  coachEntries,
  coachLoadError = null,
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
  const [scenario, setScenario] = useState<SimulationScenario>("base");
  const [nowMs, setNowMs] = useState(initialNowMs);
  const [isPendingSelection, startSelectionTransition] = useTransition();
  const [isPendingLock, startLockTransition] = useTransition();
  const [isPendingUnlock, startUnlockTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void trackEvent({
      name: "view_dashboard",
      payload: {
        roundId: round.id,
      },
    });
  }, [round.id]);

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

  const sportExposure = useMemo(() => {
    return organizedSports
      .map((sport) => {
        const pulse = sportPulse.get(sport.sportSlug);
        return {
          sportSlug: sport.sportSlug,
          displayName: sport.displayName,
          selected: pulse?.selected ?? 0,
          total: pulse?.total ?? sport.picksCount,
          spent: pulse?.spent ?? 0,
        };
      })
      .filter((sport) => sport.total > 0);
  }, [organizedSports, sportPulse]);

  const simulationSelections = useMemo<SimulationSelectionInput[]>(() => {
    const pickById = new Map(picks.map((pick) => [pick.id, pick]));
    return Object.entries(selections)
      .map(([pickId, local]) => {
        const pick = pickById.get(pickId);
        if (!pick) {
          return null;
        }

        const selectedOption = pick.options.find((option) => option.id === local.pickOptionId);
        if (!selectedOption) {
          return null;
        }

        const pickStart = getPickStartTime(pick);
        const editable =
          canEditEntry &&
          Boolean(pickStart) &&
          (pickStart ? pickStart.getTime() > nowMs : false);

        return {
          pickId: pick.id,
          pickTitle: pick.title,
          sportSlug: pick.sport.slug,
          stake: local.stake,
          odds: selectedOption.odds,
          result: selectedOption.result,
          marketOdds: pick.options.map((option) => option.odds),
          editable,
        };
      })
      .filter((selection): selection is SimulationSelectionInput => Boolean(selection));
  }, [picks, selections, canEditEntry, nowMs]);

  const mergedCoachEntries = useMemo<LiveSimulationInput[]>(() => {
    const localEntry: LiveSimulationInput = {
      entryId: entry.id,
      userId: entry.user_id,
      username: "You",
      lockedAt: entry.locked_at,
      creditsStart: entry.credits_start,
      selections: simulationSelections,
    };

    const map = new Map<string, LiveSimulationInput>();
    for (const externalEntry of coachEntries) {
      map.set(externalEntry.entryId, externalEntry);
    }
    map.set(localEntry.entryId, localEntry);
    return Array.from(map.values());
  }, [coachEntries, entry, simulationSelections]);

  const entryProjection = useMemo(
    () =>
      projectEntryRange(
        {
          entryId: entry.id,
          userId: entry.user_id,
          username: "You",
          lockedAt: entry.locked_at,
          creditsStart: entry.credits_start,
          selections: simulationSelections,
        },
        scenario,
      ),
    [entry, scenario, simulationSelections],
  );

  const projectedRank = useMemo(
    () => computeProjectedRankRange(mergedCoachEntries, entry.user_id, scenario),
    [entry.user_id, mergedCoachEntries, scenario],
  );

  const coachSuggestions = useMemo(
    () =>
      buildStakeSuggestions({
        round,
        picks,
        selections: simulationSelections,
        creditsStart: entry.credits_start,
      }),
    [entry.credits_start, picks, round, simulationSelections],
  );

  const pulse = useMemo(() => {
    const upcoming = picks.reduce((sum, pick) => {
      const start = getPickStartTime(pick);
      if (!start || start.getTime() <= nowMs) {
        return sum;
      }
      return sum + 1;
    }, 0);

    const missionsDone =
      Number(picksCount >= 3) +
      Number(boardStats.sportsCount >= 2) +
      Number(creditsSpent >= round.min_stake * 3);

    return {
      upcoming,
      missionsDone,
      missionsTotal: 3,
    };
  }, [boardStats.sportsCount, creditsSpent, nowMs, picks, picksCount, round.min_stake]);

  function isNodeCollapsed(nodeKey: string): boolean {
    return collapsedNodes[nodeKey] ?? defaultNodeCollapsed(nodeKey);
  }

  function toggleNode(nodeKey: string): void {
    setCollapsedNodes((current) => ({
      ...current,
      [nodeKey]: !isNodeCollapsed(nodeKey),
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

  function saveSelection(
    payload: { pickId: string; pickOptionId: string; stake: number },
    source: "drawer" | "suggestion",
  ): void {
    startSelectionTransition(async () => {
      const result = await upsertSelectionAction({
        entryId: entry.id,
        pickId: payload.pickId,
        pickOptionId: payload.pickOptionId,
        stake: payload.stake,
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
        [payload.pickId]: {
          pickOptionId: payload.pickOptionId,
          stake: payload.stake,
        },
      }));

      if (source === "drawer") {
        setActivePickId(null);
        await trackEvent({
          name: "save_selection",
          payload: {
            roundId: round.id,
            pickId: payload.pickId,
            stake: payload.stake,
          },
        });
      } else {
        await trackEvent({
          name: "apply_suggestion",
          payload: {
            roundId: round.id,
            pickId: payload.pickId,
            stake: payload.stake,
          },
        });
      }
    });
  }

  function handleApplySuggestion(suggestionId: string): void {
    const suggestion = coachSuggestions.find((item) => item.id === suggestionId);
    if (!suggestion?.pickId || !suggestion.suggestedStake) {
      return;
    }

    const current = selections[suggestion.pickId];
    if (!current) {
      setFeedback("Suggestion cannot be applied because the pick has no active selection yet.");
      return;
    }

    saveSelection(
      {
        pickId: suggestion.pickId,
        pickOptionId: current.pickOptionId,
        stake: suggestion.suggestedStake,
      },
      "suggestion",
    );
  }

  function handleLock(): void {
    startLockTransition(async () => {
      const result = await lockEntryAction({ entryId: entry.id });
      if (!result.ok) {
        const details = result.errors?.join(" ");
        setFeedback(details ? `${result.error} ${details}` : result.error ?? "Lock failed.");
        return;
      }

      await trackEvent({
        name: "lock_entry",
        payload: {
          roundId: round.id,
          picksCount,
          creditsSpent,
        },
      });

      setShowLockSuccess(true);
      window.setTimeout(() => {
        setShowLockSuccess(false);
        router.refresh();
      }, 900);
    });
  }

  function handleUnlock(): void {
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
  }

  return (
    <div className="space-y-7 pb-32">
      <section className="space-y-5">
        <header className="surface-subtle surface-forest-soft rounded-3xl p-5 md:p-7">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(240px,0.8fr)] lg:items-end">
            <div className="space-y-3">
              <Badge variant="outline" className="text-[10px]">Friday main screen</Badge>
              <div className="space-y-1.5">
                <h1 className="font-display text-display-md text-ink">{round.name}</h1>
                <p className="max-w-xl text-sm text-ink/70">
                  Focus decisions first: deploy credits, track timing, and manage exposure.
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-forest/20 bg-bone-50/80 p-4 lg:px-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Credits remaining</p>
              <p className="font-display text-[clamp(2rem,1.8vw+1.2rem,3rem)] leading-none text-ink">
                {formatCredits(creditsRemaining)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Spent {formatCredits(creditsSpent)} / {formatCredits(entry.credits_start)}</Badge>
                <Badge variant="outline">Picks selected {picksCount}</Badge>
              </div>
            </div>

            <div className="surface-forest space-y-3 rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-on-forest/75">Time to close</p>
              <div className="flex items-center gap-2 text-on-forest">
                <Clock3 className="size-4 text-on-forest/75" />
                <Countdown closesAt={round.closes_at} className="text-on-forest" />
              </div>
              {isEntryLocked ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-bone/45 bg-bone/15 text-on-forest hover:bg-bone/25"
                  onClick={handleUnlock}
                  disabled={!canUnlock || isPendingUnlock}
                >
                  {isPendingUnlock ? "Unlocking..." : "Unlock entry"}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleLock}
                  disabled={!canLock || isPendingLock}
                >
                  {isPendingLock ? "Locking..." : "Lock entry"}
                </Button>
              )}
              <p className={cn("text-xs", isEntryLocked ? "text-on-forest/75" : "text-clay-100")}>
                {isEntryLocked
                  ? unlockDisabledReason ?? "Entry can be unlocked while round remains open."
                  : lockDisabledReason ?? "Entry is ready to lock."}
              </p>
            </div>
          </div>
        </header>

        <section className="surface-subtle surface-forest-soft space-y-4 rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[11px] uppercase tracking-[0.14em] text-ink/60">Board</p>
            {BOARD_FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                className={filterChipClass(boardFilter === value)}
                onClick={() => setBoardFilter(value)}
              >
                {boardFilterLabel(value)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[11px] uppercase tracking-[0.14em] text-ink/60">Sport</p>
            <button
              type="button"
              className={filterChipClass(sportFilter === "all")}
              onClick={() => setSportFilter("all")}
            >
              All sports
            </button>
            {organizedSports.map((sport) => (
              <button
                key={`filter:${sport.sportId}`}
                type="button"
                className={filterChipClass(sportFilter === sport.sportSlug)}
                onClick={() => setSportFilter(sport.sportSlug)}
              >
                {getSportEmoji(sport.sportSlug)} {sport.displayName}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={filterChipClass(false)}
              onClick={() => setSportPanelsCollapsed(false)}
            >
              Expand sports
            </button>
            <button
              type="button"
              className={filterChipClass(false)}
              onClick={() => setSportPanelsCollapsed(true)}
            >
              Collapse sports
            </button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <article className="surface-subtle surface-forest-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Portfolio posture</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs text-ink/65">Window</p>
                <p className="text-sm font-medium text-ink">{isClosed ? "Closed" : "Open"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink/65">Status</p>
                <p className="text-sm font-medium text-ink">{isEntryLocked ? "Locked" : "Editable"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-ink/65">Ready to lock</p>
                <p className="text-sm font-medium text-ink">{canLock ? "Yes" : "No"}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-ink/60">
                <span>Budget flow</span>
                <span>{Math.round(progressValue)}%</span>
              </div>
              <Progress value={progressValue} />
            </div>
          </article>

          <article className="surface-subtle surface-clay-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Board mix & constraints</p>
            <div className="mt-3 space-y-2 text-sm text-ink/75">
              <p className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5"><Coins className="size-3.5" /> Daily picks</span>
                <span className="font-medium text-ink">{boardStats.dailyCount}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5"><Layers3 className="size-3.5" /> Weekly picks</span>
                <span className="font-medium text-ink">{boardStats.weeklyCount}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5" /> Sports active</span>
                <span className="font-medium text-ink">{boardStats.sportsCount}</span>
              </p>
              <p className="pt-1 text-xs text-ink/65">
                Stake limits {round.min_stake} - {round.max_stake} ·{" "}
                {round.enforce_full_budget ? "Full budget required before lock." : "Unused cash is allowed."}
              </p>
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <article className="surface-subtle rounded-2xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Live coach</p>
                <h3 className="mt-1 inline-flex items-center gap-1.5 text-lg font-medium text-ink">
                  <Sparkles className="size-4 text-forest" />
                  Scenario simulator
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["conservative", "base", "aggressive"] as SimulationScenario[]).map(
                  (scenarioValue) => (
                    <button
                      key={scenarioValue}
                      type="button"
                      className={filterChipClass(scenario === scenarioValue)}
                      onClick={() => {
                        setScenario(scenarioValue);
                        void trackEvent({
                          name: "open_simulator",
                          payload: {
                            roundId: round.id,
                            scenario: scenarioValue,
                          },
                        });
                      }}
                    >
                      {scenarioLabel(scenarioValue)}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink/55">Current</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {formatRank(projectedRank.currentRank)}
                </p>
              </div>
              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink/55">
                  {scenarioLabel(scenario)}
                </p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {formatRank(projectedRank.scenarioRank)}
                </p>
              </div>
              <div className="rounded-xl border border-forest/30 bg-forest/10 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink/55">Best</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {formatRank(projectedRank.bestRank)}
                </p>
              </div>
              <div className="rounded-xl border border-clay/35 bg-clay/12 px-3 py-2">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink/55">Worst</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {formatRank(projectedRank.worstRank)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-ink/60">
                  {scenarioLabel(scenario)} projection
                </p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {formatCredits(entryProjection.scenarioCreditsEnd)} credits
                </p>
                <p className="mt-1 text-xs text-ink/65">
                  Range {formatCredits(entryProjection.minCreditsEnd)} →{" "}
                  {formatCredits(entryProjection.maxCreditsEnd)} · Cash{" "}
                  {formatCredits(entryProjection.cashRemaining)}
                </p>
                <p className="mt-1 text-xs text-ink/60">
                  Volatility {formatCredits(entryProjection.volatilityRange)}
                </p>
              </div>

              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Around your rank</p>
                <div className="mt-2 space-y-1.5">
                  {projectedRank.around.map((row) => (
                    <div
                      key={row.entryId}
                      className={cn(
                        "flex items-center justify-between rounded-lg border border-stone-300/70 px-2.5 py-1.5 text-xs",
                        row.userId === entry.user_id && "border-forest/40 bg-forest/10",
                      )}
                    >
                      <span className="truncate text-ink/85">
                        #{row.rank} {row.username}
                      </span>
                      <span className="text-ink/70">{formatCredits(row.score)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {coachLoadError ? (
              <p className="mt-3 rounded-lg border border-clay/35 bg-clay/10 px-3 py-2 text-xs text-clay">
                Live coach is running on partial data in this session: {coachLoadError}
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.12em] text-ink/60">
                <Lightbulb className="size-3.5 text-forest" />
                Suggestions
              </p>
              {coachSuggestions.length === 0 ? (
                <p className="text-sm text-ink/70">
                  Portfolio balance looks stable for now. Keep monitoring event windows.
                </p>
              ) : (
                <div className="space-y-2">
                  {coachSuggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-ink">{suggestion.title}</p>
                          <p className="text-xs text-ink/65">{suggestion.description}</p>
                        </div>
                        {suggestion.suggestedStake && suggestion.pickId ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isPendingSelection}
                            onClick={() => handleApplySuggestion(suggestion.id)}
                          >
                            Apply {formatCredits(suggestion.suggestedStake)}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>

          <article className="surface-subtle surface-clay-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Daily pulse</p>
            <h3 className="mt-1 text-lg font-medium text-ink">Habit loop</h3>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Upcoming events</p>
                <p className="mt-1 text-2xl font-semibold text-ink">{pulse.upcoming}</p>
                <p className="text-xs text-ink/65">
                  Events still available to review before kickoff.
                </p>
              </div>

              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Weekly missions</p>
                <p className="mt-1 text-sm text-ink/80">
                  {pulse.missionsDone} of {pulse.missionsTotal} completed
                </p>
                <div className="mt-2">
                  <Progress value={(pulse.missionsDone / pulse.missionsTotal) * 100} />
                </div>
                <ul className="mt-2 space-y-1 text-xs text-ink/70">
                  <li>{picksCount >= 3 ? "✓" : "•"} Build at least 3 picks</li>
                  <li>{boardStats.sportsCount >= 2 ? "✓" : "•"} Diversify across 2+ sports</li>
                  <li>
                    {creditsSpent >= round.min_stake * 3 ? "✓" : "•"} Deploy at least{" "}
                    {formatCredits(round.min_stake * 3)} credits
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Reminders</p>
                <ul className="mt-2 space-y-1 text-xs text-ink/70">
                  {creditsRemaining >= round.min_stake ? (
                    <li>• You still have {formatCredits(creditsRemaining)} credits available.</li>
                  ) : null}
                  {!isEntryLocked && !isClosed ? (
                    <li>• Entry remains editable until round close and event start time.</li>
                  ) : null}
                  {pulse.upcoming <= 3 ? <li>• Check kickoff windows before they lock edits.</li> : null}
                  {isEntryLocked ? <li>• Entry is locked. You can unlock while the round is open.</li> : null}
                </ul>
              </div>
            </div>
          </article>
        </section>

        <section className="space-y-4">
          {filteredSports.length === 0 ? (
            <div className="surface-subtle rounded-2xl p-6">
              <p className="text-sm text-ink/70">No picks for this filter set.</p>
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
                className="surface-subtle hover-lift overflow-hidden rounded-2xl"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: sportIndex * 0.03 }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-300/55 px-4 py-3">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-left"
                    onClick={() => toggleNode(sportKey)}
                  >
                    {sportCollapsed ? (
                      <ChevronRight className="size-4 text-ink/55" />
                    ) : (
                      <ChevronDown className="size-4 text-ink/55" />
                    )}
                    <span className="text-lg">{getSportEmoji(sport.sportSlug)}</span>
                    <span className="text-base font-medium text-ink">{sport.displayName}</span>
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
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      {sport.boards.map((board) => {
                        const boardKey = `${sportKey}:board:${board.boardType}`;
                        const boardCollapsed = isNodeCollapsed(boardKey);
                        const events = flattenBoardEvents(board);
                        const theme = BOARD_THEME[board.boardType];

                        return (
                          <section key={boardKey} className="space-y-3">
                            <div className={cn("rounded-xl border px-3 py-2", theme.panel)}>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 text-left"
                                onClick={() => toggleNode(boardKey)}
                              >
                                <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                                  {boardCollapsed ? (
                                    <ChevronRight className="size-4 text-ink/55" />
                                  ) : (
                                    <ChevronDown className="size-4 text-ink/55" />
                                  )}
                                  <span className={cn("size-2.5 rounded-full", theme.dot)} />
                                  {board.label}
                                </span>
                                <Badge variant={theme.badge}>{board.picksCount}</Badge>
                              </button>
                            </div>

                            <AnimatePresence initial={false}>
                              {!boardCollapsed ? (
                                <motion.div
                                  className="space-y-3"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.18, ease: "easeOut" }}
                                >
                                  {events.map((event) => {
                                    const eventKey = `${boardKey}:event:${event.key}`;
                                    const eventCollapsed = isNodeCollapsed(eventKey);
                                    return (
                                      <section
                                        key={eventKey}
                                        className="rounded-xl border border-stone-300/55 bg-bone-50"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-300/55 px-3 py-2.5">
                                          <button
                                            type="button"
                                            className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                                            onClick={() => toggleNode(eventKey)}
                                          >
                                            {eventCollapsed ? (
                                              <ChevronRight className="size-4 shrink-0 text-ink/55" />
                                            ) : (
                                              <ChevronDown className="size-4 shrink-0 text-ink/55" />
                                            )}
                                            <div className="min-w-0">
                                              <p className="truncate text-sm font-medium text-ink">{event.eventName}</p>
                                              <p className="truncate text-xs text-ink/65">
                                                {getCountryFlag(event.countryName)} {event.countryName} ·{" "}
                                                {getLeagueEmoji(event.leagueName)} {event.leagueName} ·{" "}
                                                {event.startTime
                                                  ? formatUtcDateTime(event.startTime)
                                                  : "Missing start_time"}
                                              </p>
                                            </div>
                                          </button>
                                          <Badge variant="outline">{event.picks.length} picks</Badge>
                                        </div>

                                        <AnimatePresence initial={false}>
                                          {!eventCollapsed ? (
                                            <motion.div
                                              className="px-3"
                                              initial={{ opacity: 0, height: 0 }}
                                              animate={{ opacity: 1, height: "auto" }}
                                              exit={{ opacity: 0, height: 0 }}
                                              transition={{ duration: 0.16, ease: "easeOut" }}
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
                                                      void trackEvent({
                                                        name: "open_pick_drawer",
                                                        payload: {
                                                          roundId: round.id,
                                                          pickId: pick.id,
                                                        },
                                                      });
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

        {sportExposure.length > 0 ? (
          <section className="surface-subtle surface-forest-soft rounded-2xl p-4">
            <p className="mb-3 text-[11px] uppercase tracking-[0.14em] text-ink/60">Sport exposure</p>
            <div className="space-y-2.5">
              {sportExposure.map((sport) => (
                <div key={`exposure:${sport.sportSlug}`} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink/85">
                      {getSportEmoji(sport.sportSlug)} {sport.displayName}
                    </span>
                    <span className="text-ink/70">
                      {sport.selected}/{sport.total} · {formatCredits(sport.spent)}
                    </span>
                  </div>
                  <Progress value={sport.total ? (sport.selected / sport.total) * 100 : 0} />
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      {feedback ? <p className="text-sm text-clay">{feedback}</p> : null}

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
          saveSelection({ pickId, pickOptionId, stake }, "drawer");
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
        onLock={handleLock}
        onUnlock={handleUnlock}
      />

      <AnimatePresence>
        {showLockSuccess ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="surface-subtle rounded-2xl px-8 py-6 text-center"
              initial={{ y: 8, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 6, scale: 0.98 }}
            >
              <p className="text-lg font-medium text-ink">Entry locked</p>
              <p className="text-sm text-ink/65">You can unlock while the round remains open.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showUnlockSuccess ? (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="surface-subtle rounded-2xl px-8 py-6 text-center"
              initial={{ y: 8, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 6, scale: 0.98 }}
            >
              <p className="text-lg font-medium text-ink">Entry unlocked</p>
              <p className="text-sm text-ink/65">Continue editing available picks.</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
