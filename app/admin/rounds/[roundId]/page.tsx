import { notFound, redirect } from "next/navigation";
import {
  createPickAction,
  createPickOptionAction,
  updateRoundAction,
} from "@/app/actions/admin";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserOrRedirect } from "@/lib/auth";
import { listRoundPicksForAdmin, listSports } from "@/lib/data/admin";
import { getRoundById } from "@/lib/data/rounds";
import { isAdminUser } from "@/lib/data/users";
import { getSportDisplayName } from "@/lib/sports";
import { createClient } from "@/lib/supabase/server";
import { getActionButtonClass } from "@/lib/ui/color-system";

interface AdminRoundDetailPageProps {
  params: Promise<{ roundId: string }>;
}

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export default async function AdminRoundDetailPage({ params }: AdminRoundDetailPageProps) {
  const { roundId } = await params;
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const admin = await isAdminUser(supabase, user.id);

  if (!admin) {
    redirect("/dashboard");
  }

  const [round, sports, picks] = await Promise.all([
    getRoundById(supabase, roundId),
    listSports(supabase),
    listRoundPicksForAdmin(supabase, roundId),
  ]);

  if (!round) {
    notFound();
  }

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-5xl space-y-5 px-4 py-8">
        <div className="rounded-3xl border border-slate-200/75 bg-white/84 p-4 shadow-[0_24px_90px_-40px_rgba(8,145,178,0.65)]">
          <Badge className="w-fit border border-cyan-300/70 bg-cyan-50 text-cyan-700">
            Round Studio
          </Badge>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin · {round.name}</h1>
          <p className="mt-1 text-sm text-slate-600">Edit structure, picks, and options for this round.</p>
        </div>

        <Card className="border-slate-200/75 bg-white/86 text-slate-900">
          <CardHeader>
            <CardTitle>Round settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateRoundAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="round_id" value={round.id} />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="round_name" className="text-slate-700">Name</Label>
                <Input
                  id="round_name"
                  name="name"
                  defaultValue={round.name}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_status" className="text-slate-700">Status</Label>
                <select
                  id="round_status"
                  name="status"
                  defaultValue={round.status}
                  className="h-10 w-full rounded-md border border-slate-200/75 bg-slate-50 px-3 text-sm text-slate-900"
                >
                  <option value="draft">draft</option>
                  <option value="open">open</option>
                  <option value="locked">locked</option>
                  <option value="settled">settled</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_credits" className="text-slate-700">Starting credits</Label>
                <Input
                  id="round_credits"
                  name="starting_credits"
                  type="number"
                  min={1}
                  defaultValue={round.starting_credits}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_min_stake" className="text-slate-700">Min stake</Label>
                <Input
                  id="round_min_stake"
                  name="min_stake"
                  type="number"
                  min={1}
                  defaultValue={round.min_stake}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_max_stake" className="text-slate-700">Max stake</Label>
                <Input
                  id="round_max_stake"
                  name="max_stake"
                  type="number"
                  min={1}
                  defaultValue={round.max_stake}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_opens" className="text-slate-700">Opens at</Label>
                <Input
                  id="round_opens"
                  name="opens_at"
                  type="datetime-local"
                  defaultValue={toLocalDateTimeInput(round.opens_at)}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_closes" className="text-slate-700">Closes at</Label>
                <Input
                  id="round_closes"
                  name="closes_at"
                  type="datetime-local"
                  defaultValue={toLocalDateTimeInput(round.closes_at)}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  name="enforce_full_budget"
                  defaultChecked={round.enforce_full_budget}
                />
                Enforce full budget at lock
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" className={getActionButtonClass("primary")}>Update round</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200/75 bg-white/86 text-slate-900">
          <CardHeader>
            <CardTitle>Add pick</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPickAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="round_id" value={round.id} />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pick_title" className="text-slate-700">Title</Label>
                <Input id="pick_title" name="title" className="border-slate-200/75 bg-slate-50 text-slate-900" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pick_description" className="text-slate-700">Description</Label>
                <Input id="pick_description" name="description" className="border-slate-200/75 bg-slate-50 text-slate-900" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pick_sport" className="text-slate-700">Sport</Label>
                <select
                  id="pick_sport"
                  name="sport_id"
                  className="h-10 w-full rounded-md border border-slate-200/75 bg-slate-50 px-3 text-sm text-slate-900"
                  required
                >
                  {sports.map((sport) => (
                    <option key={sport.id} value={sport.id}>
                      {getSportDisplayName(sport)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pick_order" className="text-slate-700">Order index</Label>
                <Input
                  id="pick_order"
                  name="order_index"
                  type="number"
                  defaultValue={0}
                  className="border-slate-200/75 bg-slate-50 text-slate-900"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="is_required" defaultChecked />
                Required pick
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" className={getActionButtonClass("primary")}>Create pick</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-slate-200/75 bg-white/86 text-slate-900">
          <CardHeader>
            <CardTitle>Picks & options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {picks.map((pick) => (
              <div key={pick.id} className="rounded-lg border border-slate-200/75 bg-white/84 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{pick.title}</p>
                    <p className="text-sm text-slate-500">{getSportDisplayName(pick.sport)}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {pick.is_required ? "required" : "optional"}
                  </span>
                </div>

                <ul className="mb-3 space-y-1 text-sm">
                  {pick.options.map((option) => (
                    <li key={option.id} className="flex justify-between rounded border border-slate-200/75 bg-slate-100/75 px-2 py-1">
                      <span>{option.label}</span>
                      <span className="text-slate-500">{option.odds.toFixed(2)}x</span>
                    </li>
                  ))}
                </ul>

                <form action={createPickOptionAction} className="grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="round_id" value={round.id} />
                  <input type="hidden" name="pick_id" value={pick.id} />
                  <Input
                    name="label"
                    placeholder="Option label"
                    className="border-slate-200/75 bg-slate-50 text-slate-900"
                    required
                  />
                  <Input
                    name="odds"
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Odds"
                    className="border-slate-200/75 bg-slate-50 text-slate-900"
                    required
                  />
                  <Button type="submit" className={getActionButtonClass("primary")}>Add option</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
