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
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] space-y-5 px-4 py-8 md:px-6 md:py-10">
        <div className="surface-canvas space-y-5 rounded-[1.75rem] p-5 md:p-8">
        <div className="surface-forest-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl p-4">
          <div className="space-y-2">
            <Badge variant="outline">
              Generator Lab
            </Badge>
            <h1 className="font-display text-3xl tracking-tight">Admin · Generate</h1>
            <p className="text-sm text-ink/70">Create deterministic mock packs before real provider rollout.</p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
          >
            <Link href="/admin/rounds">Back to rounds</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Provider mode</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink/70">
              This route uses MockProvider only. It is deterministic and ready to swap with a real
              odds provider implementation.
            </p>
          </CardContent>
        </Card>

        {draftRounds.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No draft rounds available</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink/70">
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
        </div>
      </section>
    </main>
  );
}
