import { CalendarBoard } from "@/components/calendar/calendar-board";
import { AppHeader } from "@/components/layout/app-header";
import { Countdown } from "@/components/layout/countdown";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import { getEntryByRoundAndUser, listEntrySelections } from "@/lib/data/entries";
import { getCurrentOpenRound, listRoundPicksWithOptions, listRounds } from "@/lib/data/rounds";
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

export default async function CalendarPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

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

  const [picks, entry] = await Promise.all([
    listRoundPicksWithOptions(supabase, round.id),
    getEntryByRoundAndUser(supabase, round.id, user.id),
  ]);

  const selections = entry ? await listEntrySelections(supabase, entry.id) : [];

  return (
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] px-4 py-8 md:px-6 md:py-10">
        <div className="surface-canvas space-y-5 rounded-[1.75rem] p-5 md:p-8">
          <header className="surface-subtle rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <Badge variant="outline">Calendar</Badge>
                <h1 className="font-display text-display-md text-ink">Event calendar</h1>
                <p className="text-sm text-ink/70">
                  Track upcoming events, compare implied probabilities, and review your active picks.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-300/70 bg-bone-50 px-4 py-3 text-sm">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Round closes in</p>
                <Countdown closesAt={round.closes_at} />
              </div>
            </div>
          </header>

          {picks.length === 0 ? (
            <section className="surface-subtle rounded-2xl p-6">
              <p className="text-sm text-ink/70">
                No picks imported for this round yet. Use admin import/generate to populate events.
              </p>
            </section>
          ) : (
            <CalendarBoard round={round} picks={picks} selections={selections} />
          )}
        </div>
      </section>
    </main>
  );
}
