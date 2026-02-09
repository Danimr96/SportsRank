import { AppHeader } from "@/components/layout/app-header";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { getUserOrRedirect } from "@/lib/auth";
import { listGlobalAnalyticsRows, listUserAnalyticsRows } from "@/lib/data/analytics";
import { listRoundLeaderboardEntryInputs } from "@/lib/data/leaderboard";
import { getCurrentOpenRound, listRounds } from "@/lib/data/rounds";
import { createClient } from "@/lib/supabase/server";

export default async function AnalyticsPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const userRowsPromise = listUserAnalyticsRows(supabase, user.id);
  const roundsPromise = listRounds(supabase);
  const liveRoundPromise = getCurrentOpenRound(supabase);

  let globalRows: Awaited<ReturnType<typeof listGlobalAnalyticsRows>> = [];
  let globalError: string | null = null;

  try {
    globalRows = await listGlobalAnalyticsRows(supabase);
  } catch (error) {
    globalError = (error as Error).message;
  }

  const [userRows, rounds, liveRound] = await Promise.all([
    userRowsPromise,
    roundsPromise,
    liveRoundPromise,
  ]);

  const candidateRounds = [
    ...(liveRound ? [liveRound] : []),
    ...rounds.filter((round) => round.status === "settled").slice(0, 9),
  ].filter(
    (round, index, list) => list.findIndex((candidate) => candidate.id === round.id) === index,
  );

  const leaderboardDatasets = await Promise.all(
    candidateRounds.map(async (round) => {
      let entries: Awaited<ReturnType<typeof listRoundLeaderboardEntryInputs>> = [];
      let loadError: string | null = null;

      try {
        entries = await listRoundLeaderboardEntryInputs(supabase, round.id);
      } catch (error) {
        loadError = (error as Error).message;
      }

      return {
        roundId: round.id,
        roundName: round.name,
        roundStatus: round.status,
        closesAt: round.closes_at,
        entries,
        loadError,
      };
    }),
  );

  return (
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] px-4 py-8 md:px-6 md:py-10">
        <div className="surface-canvas rounded-[1.75rem] p-5 md:p-8">
        <AnalyticsDashboard
          currentUserId={user.id}
          userRows={userRows}
          globalRows={globalRows}
          globalError={globalError}
          leaderboardDatasets={leaderboardDatasets}
        />
        </div>
      </section>
    </main>
  );
}
