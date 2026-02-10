"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatCredits,
  formatOddsEuropean,
  formatPercentSpanish,
  formatUtcDateTime,
  normalizedProbabilityFromOdds,
} from "@/lib/format";
import { getPickBoardType } from "@/lib/domain/pick-organization";
import { getPickStartTime } from "@/lib/domain/validation";
import { getCountryFlag, getLeagueEmoji, getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";
import type { EntrySelection, PickWithOptions, Round } from "@/lib/types";

type BoardFilter = "all" | "daily" | "weekly" | "other";
type CalendarView = "month" | "week";

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

interface DayStats {
  events: number;
  picks: number;
  selected: number;
}

interface SportGroup {
  sportSlug: string;
  sportName: string;
  events: EventRow[];
  picksCount: number;
  selectedCount: number;
}

const BOARD_FILTERS: BoardFilter[] = ["all", "daily", "weekly", "other"];
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

function boardBadgeVariant(board: BoardFilter): "default" | "secondary" | "outline" {
  if (board === "daily") return "default";
  if (board === "weekly") return "secondary";
  return "outline";
}

function dayKeyFromDate(date: Date): string {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

function parseDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function startOfUtcWeekMonday(date: Date): Date {
  const safeDate = startOfUtcDay(date);
  const weekday = safeDate.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  return addUtcDays(safeDate, offset);
}

function formatMonthYear(date: Date): string {
  const month = MONTH_LABELS[date.getUTCMonth()] ?? "Unknown";
  return `${month} ${date.getUTCFullYear()}`;
}

function formatUtcDayLabel(date: Date): string {
  const weekday = WEEKDAY_LABELS[(date.getUTCDay() + 6) % 7] ?? "Day";
  const month = MONTH_LABELS[date.getUTCMonth()] ?? "Month";
  return `${weekday} ${date.getUTCDate()} ${month.slice(0, 3)}`;
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

  return Array.from(map.values())
    .map((event) => ({
      ...event,
      picks: event.picks.sort((left, right) => left.order_index - right.order_index),
    }))
    .sort((left, right) => {
      const leftTime = left.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      if (left.sportSlug !== right.sportSlug) {
        if (left.sportSlug === "soccer") return -1;
        if (right.sportSlug === "soccer") return 1;
        return left.sportSlug.localeCompare(right.sportSlug);
      }
      return left.eventName.localeCompare(right.eventName);
    });
}

function buildSportGroups(
  events: EventRow[],
  selectionByPickId: Map<string, EntrySelection>,
): SportGroup[] {
  const map = new Map<string, SportGroup>();

  for (const event of events) {
    const current = map.get(event.sportSlug);
    const selectedInEvent = event.picks.reduce(
      (sum, pick) => sum + Number(selectionByPickId.has(pick.id)),
      0,
    );

    if (!current) {
      map.set(event.sportSlug, {
        sportSlug: event.sportSlug,
        sportName: event.sportName,
        events: [event],
        picksCount: event.picks.length,
        selectedCount: selectedInEvent,
      });
      continue;
    }

    current.events.push(event);
    current.picksCount += event.picks.length;
    current.selectedCount += selectedInEvent;
  }

  return Array.from(map.values())
    .map((group) => ({
      ...group,
      events: group.events.sort((left, right) => {
        const leftTime = left.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightTime = right.startTime?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      }),
    }))
    .sort((left, right) => {
      if (left.sportSlug === "soccer" && right.sportSlug !== "soccer") return -1;
      if (right.sportSlug === "soccer" && left.sportSlug !== "soccer") return 1;
      return left.sportName.localeCompare(right.sportName);
    });
}

interface CalendarBoardProps {
  round: Round;
  picks: PickWithOptions[];
  selections: EntrySelection[];
}

export function CalendarBoard({ round, picks, selections }: CalendarBoardProps) {
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [boardFilter, setBoardFilter] = useState<BoardFilter>("all");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => dayKeyFromDate(new Date()));
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfUtcMonth(new Date()));
  const [weekCursor, setWeekCursor] = useState<Date>(() => startOfUtcWeekMonday(new Date()));
  const [daySportFilter, setDaySportFilter] = useState<string>("all");

  const selectionByPickId = useMemo(
    () => new Map(selections.map((selection) => [selection.pick_id, selection])),
    [selections],
  );

  const eventRows = useMemo(() => buildEventRows(picks), [picks]);

  const availableSports = useMemo(() => {
    return Array.from(new Set(eventRows.map((event) => event.sportSlug))).sort((left, right) => {
      if (left === "soccer" && right !== "soccer") return -1;
      if (right === "soccer" && left !== "soccer") return 1;
      return left.localeCompare(right);
    });
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
  }, [boardFilter, eventRows, sportFilter]);

  const calendarData = useMemo(() => {
    const byDay = new Map<string, EventRow[]>();
    const dayStats = new Map<string, DayStats>();
    const unscheduled: EventRow[] = [];

    for (const event of filteredEvents) {
      if (!event.startTime) {
        unscheduled.push(event);
        continue;
      }

      const dayKey = dayKeyFromDate(event.startTime);
      const events = byDay.get(dayKey) ?? [];
      events.push(event);
      byDay.set(dayKey, events);

      const selectedInEvent = event.picks.reduce(
        (sum, pick) => sum + Number(selectionByPickId.has(pick.id)),
        0,
      );
      const stats = dayStats.get(dayKey) ?? { events: 0, picks: 0, selected: 0 };
      stats.events += 1;
      stats.picks += event.picks.length;
      stats.selected += selectedInEvent;
      dayStats.set(dayKey, stats);
    }

    const dayKeys = Array.from(byDay.keys()).sort((left, right) => left.localeCompare(right));

    return {
      byDay,
      dayStats,
      dayKeys,
      unscheduled,
    };
  }, [filteredEvents, selectionByPickId]);

  useEffect(() => {
    if (calendarData.dayKeys.length === 0) {
      return;
    }

    if (!calendarData.dayKeys.includes(selectedDayKey)) {
      const fallback = calendarData.dayKeys[0];
      if (!fallback) {
        return;
      }
      setSelectedDayKey(fallback);
      const date = parseDayKey(fallback);
      setMonthCursor(startOfUtcMonth(date));
      setWeekCursor(startOfUtcWeekMonday(date));
    }
  }, [calendarData.dayKeys, selectedDayKey]);

  const selectedDate = useMemo(() => parseDayKey(selectedDayKey), [selectedDayKey]);
  const selectedEvents = useMemo(
    () => calendarData.byDay.get(selectedDayKey) ?? [],
    [calendarData.byDay, selectedDayKey],
  );

  const sportGroups = useMemo(
    () => buildSportGroups(selectedEvents, selectionByPickId),
    [selectedEvents, selectionByPickId],
  );

  useEffect(() => {
    if (
      daySportFilter !== "all" &&
      !sportGroups.some((group) => group.sportSlug === daySportFilter)
    ) {
      setDaySportFilter("all");
    }
  }, [daySportFilter, sportGroups]);

  const visibleSportGroups = useMemo(() => {
    if (daySportFilter === "all") {
      return sportGroups;
    }
    return sportGroups.filter((group) => group.sportSlug === daySportFilter);
  }, [daySportFilter, sportGroups]);

  const monthCells = useMemo(() => {
    const monthStart = startOfUtcMonth(monthCursor);
    const gridStart = startOfUtcWeekMonday(monthStart);
    const monthEnd = endOfUtcMonth(monthCursor);
    const gridEnd = addUtcDays(startOfUtcWeekMonday(monthEnd), 6);
    const cells: Date[] = [];

    for (
      let cursor = gridStart;
      cursor.getTime() <= gridEnd.getTime();
      cursor = addUtcDays(cursor, 1)
    ) {
      cells.push(cursor);
    }

    return cells;
  }, [monthCursor]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => addUtcDays(weekCursor, index));
  }, [weekCursor]);

  function selectDay(day: Date): void {
    const dayKey = dayKeyFromDate(day);
    setSelectedDayKey(dayKey);
    setMonthCursor(startOfUtcMonth(day));
    setWeekCursor(startOfUtcWeekMonday(day));
  }

  function renderDayButton(day: Date, isMonthCell: boolean) {
    const dayKey = dayKeyFromDate(day);
    const stats = calendarData.dayStats.get(dayKey);
    const isSelected = dayKey === selectedDayKey;
    const inCurrentMonth = day.getUTCMonth() === monthCursor.getUTCMonth();

    return (
      <button
        key={`${isMonthCell ? "month" : "week"}:${dayKey}`}
        type="button"
        onClick={() => selectDay(day)}
        className={cn(
          "h-full min-h-[84px] rounded-xl border px-2.5 py-2 text-left transition-all",
          isSelected
            ? "border-forest bg-forest/10 shadow-[0_8px_18px_-16px_rgba(1,51,40,0.55)]"
            : "border-stone-300/70 bg-bone-50 hover:border-forest/35 hover:bg-bone-100/70",
          isMonthCell && !inCurrentMonth && "opacity-45",
        )}
      >
        <p className="text-xs font-medium text-ink">
          {WEEKDAY_LABELS[(day.getUTCDay() + 6) % 7]} {day.getUTCDate()}
        </p>
        <div className="mt-1.5 space-y-1">
          <p className="text-[11px] text-ink/65">{stats?.events ?? 0} events</p>
          <p className="text-[11px] text-ink/65">
            {stats?.selected ?? 0}/{stats?.picks ?? 0} picks selected
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <section className="surface-subtle rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Calendar feed</Badge>
          <Badge variant="secondary">{round.name}</Badge>
          <Badge variant="outline">{filteredEvents.length} events</Badge>
          <Badge variant="outline">{picks.length} picks</Badge>
        </div>
        <p className="mt-2 text-xs text-ink/70 md:text-sm">
          Real month/week board. Tap a day to inspect matches grouped by sport.
        </p>
      </section>

      <section className="surface-subtle space-y-3 rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Board</p>
          {BOARD_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setBoardFilter(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
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
              "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
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
                "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
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

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="surface-subtle rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCalendarView("month")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                  calendarView === "month"
                    ? "border-forest bg-forest text-bone"
                    : "border-stone-400/70 text-ink hover:bg-bone-100",
                )}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("week")}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-all",
                  calendarView === "week"
                    ? "border-forest bg-forest text-bone"
                    : "border-stone-400/70 text-ink hover:bg-bone-100",
                )}
              >
                Week
              </button>
            </div>

            <div className="inline-flex items-center gap-1 rounded-full border border-stone-300/70 bg-bone-50 px-1 py-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  if (calendarView === "month") {
                    setMonthCursor(
                      startOfUtcMonth(
                        new Date(
                          Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() - 1, 1),
                        ),
                      ),
                    );
                    return;
                  }
                  setWeekCursor(addUtcDays(weekCursor, -7));
                }}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <p className="min-w-[134px] text-center text-xs font-medium text-ink">
                {calendarView === "month"
                  ? formatMonthYear(monthCursor)
                  : `Week of ${formatUtcDayLabel(weekCursor)}`}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  if (calendarView === "month") {
                    setMonthCursor(
                      startOfUtcMonth(
                        new Date(
                          Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 1),
                        ),
                      ),
                    );
                    return;
                  }
                  setWeekCursor(addUtcDays(weekCursor, 7));
                }}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <p
                key={`weekday:${label}`}
                className="text-center text-[11px] uppercase tracking-[0.12em] text-ink/55"
              >
                {label}
              </p>
            ))}
          </div>

          {calendarView === "month" ? (
            <div className="mt-2 grid grid-cols-7 gap-2">
              {monthCells.map((day) => renderDayButton(day, true))}
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-7 gap-2">
              {weekDays.map((day) => renderDayButton(day, false))}
            </div>
          )}

          {calendarData.unscheduled.length > 0 ? (
            <div className="mt-3 rounded-xl border border-clay/35 bg-clay/10 px-3 py-2">
              <p className="text-xs text-ink/75">
                {calendarData.unscheduled.length} events without `start_time` are hidden from the
                calendar grid.
              </p>
            </div>
          ) : null}
        </article>

        <article className="surface-subtle rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Selected day</p>
              <h3 className="font-display text-xl text-ink">{formatUtcDayLabel(selectedDate)}</h3>
            </div>
            <Badge variant="outline">{selectedEvents.length} events</Badge>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDaySportFilter("all")}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
                daySportFilter === "all"
                  ? "border-forest bg-forest text-bone"
                  : "border-stone-400/70 text-ink hover:bg-bone-100",
              )}
            >
              All sports
            </button>
            {sportGroups.map((group) => (
              <button
                key={`day-filter:${group.sportSlug}`}
                type="button"
                onClick={() => setDaySportFilter(group.sportSlug)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
                  daySportFilter === group.sportSlug
                    ? "border-forest bg-forest text-bone"
                    : "border-stone-400/70 text-ink hover:bg-bone-100",
                )}
              >
                {getSportEmoji(group.sportSlug)} {group.sportName}
              </button>
            ))}
          </div>

          {visibleSportGroups.length === 0 ? (
            <div className="mt-3 rounded-xl border border-stone-300/70 bg-bone-50 p-4">
              <p className="text-sm text-ink/70">No events for this day and filter set.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {visibleSportGroups.map((group) => (
                <section key={`sport-group:${group.sportSlug}`} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-ink">
                      {getSportEmoji(group.sportSlug)} {group.sportName}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{group.events.length} events</Badge>
                      <Badge variant="outline">
                        {group.selectedCount}/{group.picksCount} selected
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {group.events.map((event) => (
                      <article
                        key={event.key}
                        className="rounded-xl border border-stone-300/70 bg-bone-50 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{event.eventName}</p>
                            <p className="truncate text-[11px] text-ink/65">
                              {getCountryFlag(event.countryName)} {event.countryName} ·{" "}
                              {getLeagueEmoji(event.leagueName)} {event.leagueName}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {event.startTime ? formatUtcDateTime(event.startTime) : "Missing start_time"}
                          </Badge>
                        </div>

                        <div className="mt-2.5 space-y-2">
                          {event.picks.map((pick) => {
                            const selection = selectionByPickId.get(pick.id);
                            const marketOdds = pick.options.map((option) => option.odds);
                            const board = getPickBoardType(pick.title);

                            return (
                              <div
                                key={pick.id}
                                className="rounded-lg border border-stone-300/70 bg-bone px-2.5 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-ink">{cleanPickTitle(pick.title)}</p>
                                  <Badge variant={boardBadgeVariant(board)}>{board}</Badge>
                                </div>
                                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                                  {pick.options.map((option) => {
                                    const isSelected = selection?.pick_option_id === option.id;
                                    return (
                                      <div
                                        key={option.id}
                                        className={cn(
                                          "rounded-lg border px-2 py-1.5 text-[11px]",
                                          isSelected
                                            ? "border-forest/35 bg-forest/10 text-ink"
                                            : "border-stone-300/70 bg-bone text-ink/75",
                                        )}
                                      >
                                        <p className="font-medium">{option.label}</p>
                                        <p>
                                          Cuota {formatOddsEuropean(option.odds)} · Prob.{" "}
                                          {formatPercentSpanish(
                                            normalizedProbabilityFromOdds(option.odds, marketOdds),
                                          )}
                                        </p>
                                        {isSelected && selection ? (
                                          <p className="text-forest">
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
          )}
        </article>
      </section>
    </div>
  );
}
