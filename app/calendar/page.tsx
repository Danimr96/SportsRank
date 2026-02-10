import { CalendarBoard } from "@/components/calendar/calendar-board";
import { AppHeader } from "@/components/layout/app-header";
import { Countdown } from "@/components/layout/countdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import {
  listFeaturedEventsForDate,
  listUpcomingEvents,
  listUpcomingEventsFromRoundPicks,
} from "@/lib/data/events";
import { getCurrentOpenRound, listRounds } from "@/lib/data/rounds";
import { getDateKeyInTimeZone } from "@/lib/timezone";
import type { CalendarEvent } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

function getCalendarRound(
  openRound: Awaited<ReturnType<typeof getCurrentOpenRound>>,
  rounds: Awaited<ReturnType<typeof listRounds>>,
) {
  if (openRound) {
    return openRound;
  }

  return rounds[0] ?? null;
}

function mergeCalendarEvents(
  directEvents: CalendarEvent[],
  fallbackEvents: CalendarEvent[],
): CalendarEvent[] {
  const merged = new Map<string, CalendarEvent>();

  const push = (event: CalendarEvent) => {
    const key = `${event.sport_slug}|${event.league}|${event.start_time}|${event.home ?? ""}|${event.away ?? ""}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, event);
      return;
    }
    if (existing.provider !== "events" && event.provider === "events") {
      merged.set(key, event);
    }
  };

  for (const event of directEvents) {
    push(event);
  }
  for (const event of fallbackEvents) {
    push(event);
  }

  return Array.from(merged.values()).sort((left, right) =>
    left.start_time.localeCompare(right.start_time),
  );
}

export default async function CalendarPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const now = new Date();

  const [openRound, rounds] = await Promise.all([
    getCurrentOpenRound(supabase),
    listRounds(supabase),
  ]);

  const round = getCalendarRound(openRound, rounds);

  if (!round) {
    return (
      <main className="min-h-screen app-shell text-ink">
        <AppHeader userEmail={user.email} />
        <section className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6">
          <Card className="border-stone-300/60 bg-bone-50">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Calendar unavailable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink/70">
                There are no rounds available yet. Create or open a round first.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const featuredDate = getDateKeyInTimeZone(now, "Europe/Madrid");
  const oneWeekAheadIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const toIso = new Date(
    Math.max(Date.parse(round.closes_at), Date.parse(oneWeekAheadIso)),
  ).toISOString();
  const fromIso = now.toISOString();

  const [eventsFromTable, fallbackEventsFromPicks, featuredEvents] = await Promise.all([
    listUpcomingEvents(supabase, { fromIso, toIso }),
    listUpcomingEventsFromRoundPicks(supabase, {
      roundId: round.id,
      fromIso,
      toIso,
    }),
    listFeaturedEventsForDate(supabase, featuredDate),
  ]);
  const events = mergeCalendarEvents(eventsFromTable, fallbackEventsFromPicks);

  return (
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-6 md:py-10">
        <div className="surface-canvas space-y-4 rounded-[1.75rem] p-4 md:p-8">
          <header className="surface-subtle rounded-2xl p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="outline">Calendar</Badge>
                <h1 className="font-display text-[clamp(1.45rem,1.1rem+1.2vw,2.4rem)] leading-[1.05] text-ink">
                  Event calendar
                </h1>
                <p className="text-xs text-ink/70 md:text-sm">
                  Upcoming events (today to round close) by sport and league.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-300/70 bg-bone-50 px-4 py-3 text-sm">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Round closes in</p>
                <Countdown closesAt={round.closes_at} />
              </div>
            </div>
          </header>

          {events.length === 0 ? (
            <section className="surface-subtle rounded-2xl p-6">
              <p className="text-sm text-ink/70">
                No events available in this window yet.
              </p>
            </section>
          ) : (
            <CalendarBoard
              round={round}
              events={events}
              featuredDate={featuredDate}
              featuredEvents={featuredEvents}
            />
          )}
        </div>
      </section>
    </main>
  );
}
