"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatUtcDateTime } from "@/lib/format";
import { getDateKeyInTimeZone } from "@/lib/timezone";
import { getCountryFlag, getLeagueEmoji, getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";
import type { CalendarEvent, FeaturedEvent, Round } from "@/lib/types";

type CalendarView = "month" | "week";

interface CalendarEventRow {
  id: string;
  sportSlug: string;
  league: string;
  startTime: Date;
  home: string;
  away: string;
  status: string;
  country: string;
}

interface DayStats {
  events: number;
  featured: number;
}

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

function parseDayKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
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

function statusTone(status: string): "outline" | "secondary" | "default" {
  const normalized = status.trim().toLowerCase();
  if (normalized === "live") {
    return "default";
  }
  if (normalized === "final") {
    return "secondary";
  }
  return "outline";
}

function normalizeEventRow(event: CalendarEvent): CalendarEventRow | null {
  const start = new Date(event.start_time);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const home = typeof event.home === "string" && event.home.trim().length > 0 ? event.home.trim() : "Home";
  const away = typeof event.away === "string" && event.away.trim().length > 0 ? event.away.trim() : "Away";
  const metadataCountry =
    event.metadata && typeof event.metadata["country"] === "string"
      ? event.metadata["country"]
      : "General";

  return {
    id: event.id,
    sportSlug: event.sport_slug,
    league: event.league,
    startTime: start,
    home,
    away,
    status: event.status,
    country: metadataCountry,
  };
}

interface CalendarBoardProps {
  round: Round;
  events: CalendarEvent[];
  featuredDate: string;
  featuredEvents: FeaturedEvent[];
}

export function CalendarBoard({
  round,
  events,
  featuredDate,
  featuredEvents,
}: CalendarBoardProps) {
  const [calendarView, setCalendarView] = useState<CalendarView>("month");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() =>
    getDateKeyInTimeZone(new Date(), "Europe/Madrid"),
  );
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfUtcMonth(new Date()));
  const [weekCursor, setWeekCursor] = useState<Date>(() => startOfUtcWeekMonday(new Date()));

  const featuredByEventId = useMemo(
    () =>
      new Map(
        featuredEvents.map((event) => [event.event_id, event.bucket]),
      ),
    [featuredEvents],
  );

  const rows = useMemo(
    () =>
      events
        .map(normalizeEventRow)
        .filter((row): row is CalendarEventRow => Boolean(row))
        .sort((left, right) => left.startTime.getTime() - right.startTime.getTime()),
    [events],
  );

  const availableSports = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.sportSlug))).sort((left, right) => {
      if (left === "soccer" && right !== "soccer") return -1;
      if (right === "soccer" && left !== "soccer") return 1;
      return left.localeCompare(right);
    });
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (sportFilter === "all") {
      return rows;
    }
    return rows.filter((row) => row.sportSlug === sportFilter);
  }, [rows, sportFilter]);

  const calendarData = useMemo(() => {
    const byDay = new Map<string, CalendarEventRow[]>();
    const dayStats = new Map<string, DayStats>();

    for (const row of filteredRows) {
      const dayKey = getDateKeyInTimeZone(row.startTime, "Europe/Madrid");
      const dayRows = byDay.get(dayKey) ?? [];
      dayRows.push(row);
      byDay.set(dayKey, dayRows);

      const featured = featuredByEventId.has(row.id);
      const stats = dayStats.get(dayKey) ?? { events: 0, featured: 0 };
      stats.events += 1;
      stats.featured += Number(featured);
      dayStats.set(dayKey, stats);
    }

    const dayKeys = Array.from(byDay.keys()).sort((left, right) => left.localeCompare(right));
    return { byDay, dayStats, dayKeys };
  }, [featuredByEventId, filteredRows]);

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
  const selectedRows = useMemo(
    () => calendarData.byDay.get(selectedDayKey) ?? [],
    [calendarData.byDay, selectedDayKey],
  );

  const leagueGroups = useMemo(() => {
    const groups = new Map<string, CalendarEventRow[]>();

    for (const row of selectedRows) {
      const key = `${row.sportSlug}::${row.league}`;
      const items = groups.get(key) ?? [];
      items.push(row);
      groups.set(key, items);
    }

    return Array.from(groups.entries())
      .map(([key, items]) => {
        const first = items[0];
        return {
          key,
          sportSlug: first?.sportSlug ?? "unknown",
          league: first?.league ?? "Unknown league",
          items: items.sort((left, right) => left.startTime.getTime() - right.startTime.getTime()),
        };
      })
      .sort((left, right) => left.league.localeCompare(right.league));
  }, [selectedRows]);

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

  const weekCells = useMemo(
    () => Array.from({ length: 7 }, (_value, index) => addUtcDays(weekCursor, index)),
    [weekCursor],
  );

  const displayedCells = calendarView === "month" ? monthCells : weekCells;

  return (
    <div className="space-y-4">
      <section className="surface-subtle rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Featured date</p>
            <p className="text-sm font-medium text-ink">
              {featuredDate} · {featuredEvents.length} featured events
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={calendarView === "month" ? "default" : "outline"}
              size="sm"
              onClick={() => setCalendarView("month")}
            >
              Month
            </Button>
            <Button
              type="button"
              variant={calendarView === "week" ? "default" : "outline"}
              size="sm"
              onClick={() => setCalendarView("week")}
            >
              Week
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.11em]",
              sportFilter === "all"
                ? "border-forest bg-forest text-bone"
                : "border-stone-300/70 bg-bone text-ink hover:border-forest/35",
            )}
            onClick={() => setSportFilter("all")}
          >
            All sports
          </button>
          {availableSports.map((sport) => (
            <button
              key={`sport-filter-${sport}`}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-[0.11em]",
                sportFilter === sport
                  ? "border-forest bg-forest text-bone"
                  : "border-stone-300/70 bg-bone text-ink hover:border-forest/35",
              )}
              onClick={() => setSportFilter(sport)}
            >
              {getSportEmoji(sport)} {sport}
            </button>
          ))}
        </div>
      </section>

      <section className="surface-subtle rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Schedule window</p>
            <p className="text-sm text-ink/80">{formatMonthYear(calendarView === "month" ? monthCursor : weekCursor)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => {
                if (calendarView === "month") {
                  setMonthCursor(
                    new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() - 1, 1)),
                  );
                  return;
                }
                setWeekCursor(addUtcDays(weekCursor, -7));
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0"
              onClick={() => {
                if (calendarView === "month") {
                  setMonthCursor(
                    new Date(Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 1)),
                  );
                  return;
                }
                setWeekCursor(addUtcDays(weekCursor, 7));
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-[11px] uppercase tracking-[0.11em] text-ink/60">
          {WEEKDAY_LABELS.map((label) => (
            <div key={`calendar-weekday-${label}`}>{label}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {displayedCells.map((cellDate) => {
            const dayKey = getDateKeyInTimeZone(cellDate, "Europe/Madrid");
            const stats = calendarData.dayStats.get(dayKey);
            const inMonth = cellDate.getUTCMonth() === monthCursor.getUTCMonth();
            const isActive = dayKey === selectedDayKey;

            return (
              <button
                key={`calendar-cell-${dayKey}`}
                type="button"
                className={cn(
                  "min-h-20 rounded-xl border px-2 py-2 text-left transition-colors",
                  isActive
                    ? "border-forest bg-forest/10"
                    : "border-stone-300/70 bg-bone-50 hover:border-forest/35",
                  calendarView === "month" && !inMonth && "opacity-40",
                )}
                onClick={() => setSelectedDayKey(dayKey)}
              >
                <p className="text-sm font-medium text-ink">{cellDate.getUTCDate()}</p>
                {stats ? (
                  <>
                    <p className="text-[11px] text-ink/70">{stats.events} events</p>
                    {stats.featured > 0 ? (
                      <p className="text-[11px] text-forest">{stats.featured} featured</p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-[11px] text-ink/45">No events</p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface-subtle rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Selected day</p>
            <p className="text-sm font-medium text-ink">{formatUtcDayLabel(selectedDate)}</p>
          </div>
          <Badge variant="outline">Round #{round.name}</Badge>
        </div>

        {leagueGroups.length === 0 ? (
          <p className="text-sm text-ink/65">No events for this day/filter.</p>
        ) : (
          <div className="space-y-3">
            {leagueGroups.map((group) => (
              <article
                key={`league-group-${group.key}`}
                className="rounded-xl border border-stone-300/70 bg-bone-50 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    {getSportEmoji(group.sportSlug)} {getLeagueEmoji(group.league)} {group.league}
                  </p>
                  <Badge variant="outline">{group.items.length} events</Badge>
                </div>
                <div className="space-y-2">
                  {group.items.map((event) => {
                    const featuredBucket = featuredByEventId.get(event.id);
                    return (
                      <div
                        key={`event-row-${event.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-300/70 bg-bone px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {event.home} vs {event.away}
                          </p>
                          <p className="truncate text-xs text-ink/65">
                            {getCountryFlag(event.country)} {event.country} · {formatUtcDateTime(event.startTime)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusTone(event.status)}>{event.status}</Badge>
                          {featuredBucket ? (
                            <Badge variant="default">Featured · {featuredBucket}</Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
