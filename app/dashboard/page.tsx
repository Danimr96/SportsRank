import { saveProfileAction } from "@/app/actions/profile";
import { AppHeader } from "@/components/layout/app-header";
import { EntryBuilder } from "@/components/picks/entry-builder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserOrRedirect } from "@/lib/auth";
import { getOrCreateEntry, listEntrySelections } from "@/lib/data/entries";
import { getCurrentOpenRound, listRoundPicksWithOptions } from "@/lib/data/rounds";
import { getProfileByUserId } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";
import { getActionButtonClass } from "@/lib/ui/color-system";

export default async function DashboardPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const [profile, round] = await Promise.all([
    getProfileByUserId(supabase, user.id),
    getCurrentOpenRound(supabase),
  ]);

  if (!profile) {
    return (
      <main className="min-h-screen app-shell text-slate-900">
        <AppHeader userEmail={user.email} />
        <section className="mx-auto w-full max-w-xl px-4 py-14 md:px-6">
          <Card className="border-stone-200 bg-white">
            <CardHeader>
              <CardTitle className="font-display text-2xl">Create your profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveProfileAction} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-stone-700">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    required
                    minLength={3}
                    maxLength={32}
                    className="border-stone-200 bg-white text-stone-900"
                  />
                </div>
                <Button type="submit" className={getActionButtonClass("primary")}>
                  Save profile
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  if (!round) {
    return (
      <main className="min-h-screen app-shell text-slate-900">
        <AppHeader userEmail={user.email} />
        <section className="mx-auto w-full max-w-4xl px-4 py-14 md:px-6">
          <Card className="border-stone-200 bg-white">
            <CardHeader>
              <CardTitle className="font-display text-2xl">No open round right now</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-stone-600">
                The next weekly round will appear here once an admin opens it.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const entry = await getOrCreateEntry(supabase, {
    round_id: round.id,
    user_id: user.id,
    credits_start: round.starting_credits,
  });

  const [picks, selections] = await Promise.all([
    listRoundPicksWithOptions(supabase, round.id),
    listEntrySelections(supabase, entry.id),
  ]);

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6 md:py-10">
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
