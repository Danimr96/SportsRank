import { notFound, redirect } from "next/navigation";
import { updateOptionResultAction } from "@/app/actions/admin";
import { SettleRoundButton } from "@/components/admin/settle-round-button";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import { listRoundPicksForAdmin } from "@/lib/data/admin";
import { getRoundById } from "@/lib/data/rounds";
import { isAdminUser } from "@/lib/data/users";
import { getSportDisplayName } from "@/lib/sports";
import { createClient } from "@/lib/supabase/server";

interface AdminSettleRoundPageProps {
  params: Promise<{ roundId: string }>;
}

export default async function AdminSettleRoundPage({ params }: AdminSettleRoundPageProps) {
  const { roundId } = await params;
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const admin = await isAdminUser(supabase, user.id);

  if (!admin) {
    redirect("/dashboard");
  }

  const [round, picks] = await Promise.all([
    getRoundById(supabase, roundId),
    listRoundPicksForAdmin(supabase, roundId),
  ]);

  if (!round) {
    notFound();
  }

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/75 bg-white/84 p-4 shadow-[0_24px_90px_-40px_rgba(8,145,178,0.65)]">
          <div className="space-y-2">
            <Badge className="w-fit border border-cyan-300/70 bg-cyan-50 text-cyan-700">
              Settlement Desk
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">Admin settle · {round.name}</h1>
            <p className="text-sm text-slate-600">Mark market results and settle all entries.</p>
          </div>
          <SettleRoundButton roundId={round.id} disabled={round.status === "settled"} />
        </div>

        <Card className="border-slate-200/75 bg-white/86 text-slate-900">
          <CardHeader>
            <CardTitle>Mark pick option results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {picks.map((pick) => (
              <div key={pick.id} className="rounded-lg border border-slate-200/75 bg-white/84 p-4">
                <p className="font-medium">{pick.title}</p>
                <p className="mb-3 text-sm text-slate-500">{getSportDisplayName(pick.sport)}</p>

                <div className="space-y-2">
                  {pick.options.map((option) => (
                    <form
                      key={option.id}
                      action={updateOptionResultAction}
                      className="flex flex-wrap items-center gap-2 rounded border border-slate-200/75 bg-slate-100/70 p-2"
                    >
                      <input type="hidden" name="round_id" value={round.id} />
                      <input type="hidden" name="option_id" value={option.id} />
                      <span className="min-w-40 text-sm font-medium">{option.label}</span>
                      <span className="text-sm text-slate-500">{option.odds.toFixed(2)}x</span>
                      <select
                        name="result"
                        defaultValue={option.result}
                        className="h-9 rounded-md border border-slate-200/75 bg-slate-50 px-2 text-sm text-slate-900"
                      >
                        <option value="pending">pending</option>
                        <option value="win">win</option>
                        <option value="lose">lose</option>
                        <option value="void">void</option>
                      </select>
                      <button
                        type="submit"
                        className="h-9 rounded-md border border-slate-300/75 bg-white/75 px-3 text-sm text-slate-900 hover:bg-white/80"
                      >
                        Save
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
