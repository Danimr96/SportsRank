import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import { listRecentEntriesByUser } from "@/lib/data/entries";
import { formatCredits, formatUtcDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function HistoryPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const entries = await listRecentEntriesByUser(supabase, user.id, 15);
  const settledCount = entries.filter((entry) => entry.status === "settled").length;
  const totalRounds = entries.length;
  const avgEnd =
    settledCount > 0
      ? Math.round(
          entries
            .filter((entry) => entry.credits_end !== null)
            .reduce((sum, entry) => sum + (entry.credits_end ?? 0), 0) / settledCount,
        )
      : 0;

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
        <div className="rounded-3xl border border-slate-200/75 bg-white/84 p-4 shadow-[0_24px_90px_-40px_rgba(8,145,178,0.65)]">
          <div className="space-y-2">
            <Badge className="w-fit border border-cyan-300/70 bg-cyan-50 text-cyan-700">
              Portfolio history
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">History</h1>
            <p className="text-sm text-slate-600">
              Review your latest rounds and settlement outcomes.
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200/75 bg-white/75 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Tracked rounds</p>
              <p className="mt-1 text-xl font-semibold">{totalRounds}</p>
            </div>
            <div className="rounded-xl border border-emerald-300/70 bg-emerald-50 p-3">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Settled rounds</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{settledCount}</p>
            </div>
            <div className="rounded-xl border border-violet-300/70 bg-violet-50 p-3">
              <p className="text-xs uppercase tracking-wide text-violet-700">Avg settled end</p>
              <p className="mt-1 text-xl font-semibold text-violet-700">{formatCredits(avgEnd)}</p>
            </div>
          </div>
        </div>

        <Card className="rounded-2xl border border-slate-200/75 bg-white/84 text-slate-900">
          <CardHeader>
            <CardTitle>Recent entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200/75 text-slate-500">
                    <th className="py-2">Round</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Start</th>
                    <th className="py-2">End</th>
                    <th className="py-2">Locked</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-200/75 last:border-b-0">
                      <td className="py-2">
                        <Link
                          href={`/round/${entry.round_id}`}
                          className="font-medium text-cyan-700 hover:text-cyan-800 hover:underline"
                        >
                          {entry.round_name}
                        </Link>
                      </td>
                      <td className="py-2">{entry.status}</td>
                      <td className="py-2">{formatCredits(entry.credits_start)}</td>
                      <td className="py-2">
                        {entry.credits_end !== null ? formatCredits(entry.credits_end) : "-"}
                      </td>
                      <td className="py-2 text-slate-500">
                        {entry.locked_at
                          ? formatUtcDateTime(new Date(entry.locked_at))
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
