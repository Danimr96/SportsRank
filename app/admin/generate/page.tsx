import Link from "next/link";
import { redirect } from "next/navigation";
import { GenerateForm } from "@/components/admin/generate-form";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import { listSports } from "@/lib/data/admin";
import { listRounds } from "@/lib/data/rounds";
import { isAdminUser } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";

function toDateTimeLocalInput(value: Date): string {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default async function AdminGeneratePage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const admin = await isAdminUser(supabase, user.id);

  if (!admin) {
    redirect("/dashboard");
  }

  const [rounds, sports] = await Promise.all([listRounds(supabase), listSports(supabase)]);
  const draftRounds = rounds
    .filter((round) => round.status === "draft")
    .map((round) => ({ id: round.id, name: round.name }));

  const now = new Date();
  const end = new Date(now.getTime() + 72 * 3600 * 1000);

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-slate-200/75 bg-white/84 p-4 shadow-[0_24px_90px_-40px_rgba(8,145,178,0.65)]">
          <div className="space-y-2">
            <Badge className="w-fit border border-cyan-300/70 bg-cyan-50 text-cyan-700">
              Generator Lab
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">Admin · Generate</h1>
            <p className="text-sm text-slate-600">Create deterministic mock packs before real provider rollout.</p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-slate-300/80 bg-white/75 text-slate-900 hover:bg-white/80"
          >
            <Link href="/admin/rounds">Back to rounds</Link>
          </Button>
        </div>

        <Card className="border-slate-200/75 bg-white/86 text-slate-900">
          <CardHeader>
            <CardTitle>Provider mode</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">
              This route uses MockProvider only. It is deterministic and ready to swap with a real
              odds provider implementation.
            </p>
          </CardContent>
        </Card>

        {draftRounds.length === 0 ? (
          <Card className="border-slate-200/75 bg-white/86 text-slate-900">
            <CardHeader>
              <CardTitle>No draft rounds available</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">
                Create a draft round before running generation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <GenerateForm
            draftRounds={draftRounds}
            sportSlugs={sports.map((sport) => sport.slug)}
            defaultStart={toDateTimeLocalInput(now)}
            defaultEnd={toDateTimeLocalInput(end)}
          />
        )}
      </section>
    </main>
  );
}
