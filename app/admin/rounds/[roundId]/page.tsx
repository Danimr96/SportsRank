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
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] space-y-5 px-4 py-8 md:px-6 md:py-10">
        <div className="surface-canvas space-y-5 rounded-[1.75rem] p-5 md:p-8">
        <div className="surface-forest-soft rounded-2xl p-4">
          <Badge variant="outline">
            Round Studio
          </Badge>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Admin · {round.name}</h1>
          <p className="mt-1 text-sm text-ink/70">Edit structure, picks, and options for this round.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Round settings</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateRoundAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="round_id" value={round.id} />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="round_name" className="text-ink/80">Name</Label>
                <Input
                  id="round_name"
                  name="name"
                  defaultValue={round.name}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_status" className="text-ink/80">Status</Label>
                <select
                  id="round_status"
                  name="status"
                  defaultValue={round.status}
                  className="h-10 w-full rounded-md border border-stone-300/70 bg-bone-50 px-3 text-sm text-ink"
                >
                  <option value="draft">draft</option>
                  <option value="open">open</option>
                  <option value="locked">locked</option>
                  <option value="settled">settled</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_credits" className="text-ink/80">Starting credits</Label>
                <Input
                  id="round_credits"
                  name="starting_credits"
                  type="number"
                  min={1}
                  defaultValue={round.starting_credits}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_min_stake" className="text-ink/80">Min stake</Label>
                <Input
                  id="round_min_stake"
                  name="min_stake"
                  type="number"
                  min={1}
                  defaultValue={round.min_stake}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_max_stake" className="text-ink/80">Max stake</Label>
                <Input
                  id="round_max_stake"
                  name="max_stake"
                  type="number"
                  min={1}
                  defaultValue={round.max_stake}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_opens" className="text-ink/80">Opens at</Label>
                <Input
                  id="round_opens"
                  name="opens_at"
                  type="datetime-local"
                  defaultValue={toLocalDateTimeInput(round.opens_at)}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="round_closes" className="text-ink/80">Closes at</Label>
                <Input
                  id="round_closes"
                  name="closes_at"
                  type="datetime-local"
                  defaultValue={toLocalDateTimeInput(round.closes_at)}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/70 sm:col-span-2">
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

        <Card>
          <CardHeader>
            <CardTitle>Add pick</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPickAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="round_id" value={round.id} />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pick_title" className="text-ink/80">Title</Label>
                <Input id="pick_title" name="title" className="border-stone-300/70 bg-bone-50 text-ink" required />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pick_description" className="text-ink/80">Description</Label>
                <Input id="pick_description" name="description" className="border-stone-300/70 bg-bone-50 text-ink" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pick_sport" className="text-ink/80">Sport</Label>
                <select
                  id="pick_sport"
                  name="sport_id"
                  className="h-10 w-full rounded-md border border-stone-300/70 bg-bone-50 px-3 text-sm text-ink"
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
                <Label htmlFor="pick_order" className="text-ink/80">Order index</Label>
                <Input
                  id="pick_order"
                  name="order_index"
                  type="number"
                  defaultValue={0}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/70">
                <input type="checkbox" name="is_required" defaultChecked />
                Required pick
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" className={getActionButtonClass("primary")}>Create pick</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Picks & options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {picks.map((pick) => (
              <div key={pick.id} className="rounded-lg border border-stone-300/70 bg-bone-50 p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{pick.title}</p>
                    <p className="text-sm text-ink/60">{getSportDisplayName(pick.sport)}</p>
                  </div>
                  <span className="text-xs text-ink/55">
                    {pick.is_required ? "required" : "optional"}
                  </span>
                </div>

                <ul className="mb-3 space-y-1 text-sm">
                  {pick.options.map((option) => (
                    <li key={option.id} className="flex justify-between rounded border border-stone-300/70 bg-bone px-2 py-1">
                      <span>{option.label}</span>
                      <span className="text-ink/55">{option.odds.toFixed(2)}x</span>
                    </li>
                  ))}
                </ul>

                <form action={createPickOptionAction} className="grid gap-2 sm:grid-cols-3">
                  <input type="hidden" name="round_id" value={round.id} />
                  <input type="hidden" name="pick_id" value={pick.id} />
                  <Input
                    name="label"
                    placeholder="Option label"
                    className="border-stone-300/70 bg-bone text-ink"
                    required
                  />
                  <Input
                    name="odds"
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="Odds"
                    className="border-stone-300/70 bg-bone text-ink"
                    required
                  />
                  <Button type="submit" className={getActionButtonClass("primary")}>Add option</Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
        </div>
      </section>
    </main>
  );
}
