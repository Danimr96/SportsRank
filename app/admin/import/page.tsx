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
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl border border-slate-200/75 bg-white/84 p-4 shadow-[0_24px_90px_-40px_rgba(8,145,178,0.65)] backdrop-blur">
          <div className="space-y-2">
            <Badge className="w-fit border border-cyan-300/70 bg-cyan-50 text-cyan-700">
              Admin Import
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight">Draft round ingestion</h1>
            <p className="text-sm text-slate-600">
              Validate raw JSON, preview sport spread and odds range, then insert safely.
            </p>
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

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl border-slate-200/75 bg-white/84">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenSquare className="size-4 text-cyan-300" />
                Draft rounds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{draftRounds.length}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/75 bg-white/84">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <DatabaseZap className="size-4 text-cyan-300" />
                Source format
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">JSON payload with sports + options + metadata</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-slate-200/75 bg-white/84">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="size-4 text-cyan-300" />
                Start time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">Must be ISO UTC in metadata.start_time</p>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-slate-200/75 bg-white/84">
          <CardHeader>
            <CardTitle>Available draft rounds</CardTitle>
          </CardHeader>
          <CardContent>
            {draftRounds.length === 0 ? (
              <p className="text-sm text-slate-600">No draft rounds available.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {draftRounds.map((round) => (
                  <li
                    key={round.id}
                    className="rounded-xl border border-slate-200/75 bg-white/75 px-3 py-2 text-slate-600"
                  >
                    <span className="font-medium text-slate-900">{round.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-500">{round.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ImportForm />
      </section>
    </main>
  );
}
