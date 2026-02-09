import { notFound } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalUser } from "@/lib/auth";
import { computeLeaderboard } from "@/lib/domain/ranking";
import { listSettledLeaderboardEntries } from "@/lib/data/leaderboard";
import { getRoundById } from "@/lib/data/rounds";
import { createClient } from "@/lib/supabase/server";

interface LeaderboardPageProps {
  params: Promise<{ roundId: string }>;
}

export default async function LeaderboardPage({ params }: LeaderboardPageProps) {
  const { roundId } = await params;
  const user = await getOptionalUser();
  const supabase = await createClient();
  const round = await getRoundById(supabase, roundId);

  if (!round) {
    notFound();
  }

  if (round.status !== "settled") {
    return (
      <main className="min-h-screen app-shell text-slate-900">
        <AppHeader userEmail={user?.email} />
        <section className="mx-auto w-full max-w-4xl px-4 py-12">
          <Card className="border-slate-200/75 bg-white/86 text-slate-900">
            <CardHeader>
              <CardTitle>Leaderboard unavailable</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                The round must be settled before leaderboard rankings are shown.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    );
  }

  const entries = await listSettledLeaderboardEntries(supabase, round.id);
  const rows = computeLeaderboard(entries);

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user?.email} />
      <section className="mx-auto w-full max-w-4xl space-y-5 px-4 py-8">
        <div className="rounded-3xl border border-slate-200/75 bg-white/84 p-4 shadow-[0_24px_90px_-40px_rgba(8,145,178,0.65)]">
          <Badge className="w-fit border border-cyan-300/70 bg-cyan-50 text-cyan-700">
            Settled leaderboard
          </Badge>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{round.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ranking is sorted by credits end, tie-breaker by earlier lock time.
          </p>
        </div>
        <LeaderboardTable rows={rows} />
      </section>
    </main>
  );
}
