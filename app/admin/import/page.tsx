import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, DatabaseZap, PenSquare } from "lucide-react";
import { ImportForm } from "@/components/admin/import-form";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserOrRedirect } from "@/lib/auth";
import { listRounds } from "@/lib/data/rounds";
import { isAdminUser } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";

export default async function AdminImportPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const admin = await isAdminUser(supabase, user.id);

  if (!admin) {
    redirect("/dashboard");
  }

  const rounds = await listRounds(supabase);
  const draftRounds = rounds.filter((round) => round.status === "draft");

  return (
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] space-y-5 px-4 py-8 md:px-6 md:py-10">
        <div className="surface-canvas space-y-5 rounded-[1.75rem] p-5 md:p-8">
        <div className="surface-forest-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl p-4">
          <div className="space-y-2">
            <Badge variant="outline">
              Admin Import
            </Badge>
            <h1 className="font-display text-3xl tracking-tight">Draft round ingestion</h1>
            <p className="text-sm text-ink/70">
              Validate raw JSON, preview sport spread and odds range, then insert safely.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
          >
            <Link href="/admin/rounds">Back to rounds</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenSquare className="size-4 text-forest" />
                Draft rounds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{draftRounds.length}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <DatabaseZap className="size-4 text-forest" />
                Source format
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink/70">JSON payload with sports + options + metadata</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="size-4 text-forest" />
                Start time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink/70">Must be ISO UTC in metadata.start_time</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Available draft rounds</CardTitle>
          </CardHeader>
          <CardContent>
            {draftRounds.length === 0 ? (
              <p className="text-sm text-ink/70">No draft rounds available.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {draftRounds.map((round) => (
                  <li
                    key={round.id}
                    className="rounded-xl border border-stone-300/70 bg-bone-50 px-3 py-2 text-ink/70"
                  >
                    <span className="font-medium text-ink">{round.name}</span>
                    <span className="ml-2 font-mono text-xs text-ink/50">{round.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ImportForm />
        </div>
      </section>
    </main>
  );
}
