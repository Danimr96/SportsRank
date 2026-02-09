"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCredits, formatOddsEuropean, formatPercentSpanish, formatUtcDateTime, normalizedProbabilityFromOdds } from "@/lib/format";
import { getPickBoardType } from "@/lib/domain/pick-organization";
import { getPickStartTime } from "@/lib/domain/validation";
import { getCountryFlag, getLeagueEmoji, getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";
import type { EntrySelection, PickWithOptions, Round } from "@/lib/types";

type BoardFilter = "all" | "daily" | "weekly" | "other";

interface EventRow {
  key: string;
  sportSlug: string;
  sportName: string;
  eventName: string;
  leagueName: string;
  countryName: string;
  startTime: Date | null;
  picks: PickWithOptions[];
}

interface DayGroup {
  key: string;
  label: string;
  events: EventRow[];
}

const BOARD_FILTERS: BoardFilter[] = ["all", "daily", "weekly", "other"];

function getMetadataText(pick: PickWithOptions, key: string): string | null {
  const raw = pick.metadata?.[key];
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanPickTitle(title: string): string {
  return title.replace(/^\[(DAILY|WEEK)\]\s*/i, "").trim();
}

function formatUtcDayLabel(date: Date): string {
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function dayKeyFromDate(date: Date): string {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function buildEventRows(picks: PickWithOptions[]): EventRow[] {
  const map = new Map<string, EventRow>();

  for (const pick of picks) {
    const startTime = getPickStartTime(pick);
    const eventName = getMetadataText(pick, "event") ?? cleanPickTitle(pick.title);
    const leagueName = getMetadataText(pick, "league") ?? "Unknown league";
    const countryName = getMetadataText(pick, "country") ?? "General";
    const key = `${pick.sport.id}:${leagueName}:${eventName}:${startTime?.toISOString() ?? "no-start"}`;

    const current = map.get(key);
    if (!current) {
      map.set(key, {
        key,
        sportSlug: pick.sport.slug,
        sportName: pick.sport.name,
        eventName,
        leagueName,
        countryName,
        startTime,
        picks: [pick],
      });
      continue;
    }

    current.picks.push(pick);
  }

  const rows = Array.from(map.values()).map((event) => ({
    ...event,
    picks: event.picks.sort((left, right) => left.order_index - right.order_index),
  }));

  return rows.sort((left, right) => {
    const leftTime = left.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (left.sportSlug !== right.sportSlug) {
      return left.sportSlug.localeCompare(right.sportSlug);
    }
    return left.eventName.localeCompare(right.eventName);
  });
}

function groupByDay(events: EventRow[]): DayGroup[] {
  const grouped = new Map<string, DayGroup>();

  for (const event of events) {
    const key = event.startTime ? dayKeyFromDate(event.startTime) : "unscheduled";
    const label = event.startTime ? formatUtcDayLabel(event.startTime) : "Unscheduled";
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { key, label, events: [event] });
      continue;
    }
    current.events.push(event);
  }

  return Array.from(grouped.values()).sort((left, right) => {
    if (left.key === "unscheduled") return 1;
    if (right.key === "unscheduled") return -1;
    return left.key.localeCompare(right.key);
  });
}

function boardBadgeVariant(board: BoardFilter): "default" | "secondary" | "outline" {
  if (board === "daily") return "default";
  if (board === "weekly") return "secondary";
  return "outline";
}

interface CalendarBoardProps {
  round: Round;
  picks: PickWithOptions[];
  selections: EntrySelection[];
}

export function CalendarBoard({ round, picks, selections }: CalendarBoardProps) {
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");

  const selectionByPickId = useMemo(
    () => new Map(selections.map((selection) => [selection.pick_id, selection])),
    [selections],
  );

  const eventRows = useMemo(() => buildEventRows(picks), [picks]);

  const availableSports = useMemo(() => {
    return Array.from(new Set(eventRows.map((event) => event.sportSlug))).sort();
  }, [eventRows]);

  const filteredEvents = useMemo(() => {
    return eventRows.filter((event) => {
      if (sportFilter !== "all" && event.sportSlug !== sportFilter) {
        return false;
      }
      if (boardFilter === "all") {
        return true;
      }
      return event.picks.some((pick) => getPickBoardType(pick.title) === boardFilter);
    });
  }, [eventRows, sportFilter, boardFilter]);

  const groups = useMemo(() => groupByDay(filteredEvents), [filteredEvents]);

  return (
    <div className="space-y-5">
      <section className="surface-subtle rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Calendar feed</Badge>
          <Badge variant="secondary">{round.name}</Badge>
          <Badge variant="outline">{filteredEvents.length} events</Badge>
          <Badge variant="outline">{picks.length} picks</Badge>
        </div>
        <p className="mt-3 text-sm text-ink/70">
          Upcoming events with market options, normalized probability and your current picks.
        </p>
      </section>

      <section className="surface-subtle space-y-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Board</p>
          {BOARD_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBoardFilter(value)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
                boardFilter === value
                  ? "border-forest bg-forest text-bone"
                  : "border-stone-400/70 text-ink hover:bg-bone-100",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Sport</p>
          <button
            type="button"
            onClick={() => setSportFilter("all")}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
              sportFilter === "all"
                ? "border-forest bg-forest text-bone"
                : "border-stone-400/70 text-ink hover:bg-bone-100",
            )}
          >
            All
          </button>
          {availableSports.map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() => setSportFilter(sport)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
                sportFilter === sport
                  ? "border-forest bg-forest text-bone"
                  : "border-stone-400/70 text-ink hover:bg-bone-100",
              )}
            >
              {getSportEmoji(sport)} {sport}
            </button>
          ))}
        </div>
      </section>

      {groups.length === 0 ? (
        <section className="surface-subtle rounded-2xl p-6">
          <p className="text-sm text-ink/70">No events for the selected filters.</p>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl text-ink">{group.label}</h2>
            <Badge variant="outline">{group.events.length} events</Badge>
          </div>

          <div className="space-y-3">
            {group.events.map((event) => (
              <article key={event.key} className="surface-subtle hover-lift rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-ink">
                      {getSportEmoji(event.sportSlug)} {event.eventName}
                    </p>
                    <p className="truncate text-xs text-ink/65">
                      {getCountryFlag(event.countryName)} {event.countryName} ·{" "}
                      {getLeagueEmoji(event.leagueName)} {event.leagueName}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {event.startTime ? formatUtcDateTime(event.startTime) : "Missing start_time"}
                  </Badge>
                </div>

                <div className="mt-3 space-y-2.5">
                  {event.picks.map((pick) => {
                    const selection = selectionByPickId.get(pick.id);
                    const marketOdds = pick.options.map((option) => option.odds);
                    const pickBoard = getPickBoardType(pick.title);

                    return (
                      <div key={pick.id} className="rounded-xl border border-stone-300/60 bg-bone-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-ink">{cleanPickTitle(pick.title)}</p>
                          <Badge variant={boardBadgeVariant(pickBoard)}>{pickBoard}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {pick.options.map((option) => {
                            const isSelected = selection?.pick_option_id === option.id;
                            return (
                              <div
                                key={option.id}
                                className={cn(
                                  "rounded-lg border px-2.5 py-2 text-xs",
                                  isSelected
                                    ? "border-forest bg-forest/10 text-ink"
                                    : "border-stone-300/70 bg-bone text-ink/75",
                                )}
                              >
                                <p className="font-medium">{option.label}</p>
                                <p className="mt-0.5">
                                  Cuota {formatOddsEuropean(option.odds)} · Prob.{" "}
                                  {formatPercentSpanish(
                                    normalizedProbabilityFromOdds(option.odds, marketOdds),
                                  )}
                                </p>
                                {isSelected && selection ? (
                                  <p className="mt-0.5 text-forest">
                                    Your pick · Stake {formatCredits(selection.stake)}
                                  </p>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
