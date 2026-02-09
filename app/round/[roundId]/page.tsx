import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { EntryBuilder } from "@/components/picks/entry-builder";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import {
  getEntryByRoundAndUser,
  getOrCreateEntry,
  listEntrySelections,
} from "@/lib/data/entries";
import { getRoundById, listRoundPicksWithOptions } from "@/lib/data/rounds";
import { createClient } from "@/lib/supabase/server";

interface RoundPageProps {
  params: Promise<{ roundId: string }>;
}

export default async function RoundPage({ params }: RoundPageProps) {
  const { roundId } = await params;
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const round = await getRoundById(supabase, roundId);

  if (!round) {
    notFound();
  }

  const existingEntry = await getEntryByRoundAndUser(supabase, round.id, user.id);
  const canCreateEntry =
    round.status === "open" && new Date(round.closes_at).getTime() > Date.now();

  const entry = existingEntry
    ? existingEntry
    : canCreateEntry
      ? await getOrCreateEntry(supabase, {
          round_id: round.id,
          user_id: user.id,
          credits_start: round.starting_credits,
        })
      : null;

  if (!entry) {
    return (
      <main className="min-h-screen app-shell text-slate-900">
        <AppHeader userEmail={user.email} />
        <section className="mx-auto w-full max-w-4xl px-4 py-12">
          <Card className="border-slate-200/75 bg-white/86">
            <CardHeader>
              <CardTitle>No entry for this round</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                This round is not open for new entries, and you do not have an existing entry.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const [picks, selections] = await Promise.all([
    listRoundPicksWithOptions(supabase, round.id),
    listEntrySelections(supabase, entry.id),
  ]);

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <EntryBuilder
          round={round}
          entry={entry}
          picks={picks}
          initialSelections={selections}
          initialNowMs={Date.now()}
        />
      </section>
    </main>
  );
}
