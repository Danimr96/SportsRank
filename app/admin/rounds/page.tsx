import Link from "next/link";
import { redirect } from "next/navigation";
import { createRoundAction } from "@/app/actions/admin";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserOrRedirect } from "@/lib/auth";
import { listRounds } from "@/lib/data/rounds";
import { formatCredits } from "@/lib/format";
import { isAdminUser } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";
import { getActionButtonClass } from "@/lib/ui/color-system";

function toInputDateTime(value: string): string {
  return new Date(value).toISOString().slice(0, 16);
}

export default async function AdminRoundsPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const admin = await isAdminUser(supabase, user.id);

  if (!admin) {
    redirect("/dashboard");
  }

  const rounds = await listRounds(supabase);

  return (
    <main className="min-h-screen app-shell text-ink">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-[1240px] space-y-5 px-4 py-8 md:px-6 md:py-10">
        <div className="surface-canvas space-y-5 rounded-[1.75rem] p-5 md:p-8">
        <div className="surface-forest-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl p-4">
          <div className="space-y-2">
            <Badge variant="outline">
              Admin Control
            </Badge>
            <h1 className="font-display text-3xl tracking-tight">Rounds</h1>
            <p className="text-sm text-ink/70">Configure weekly windows, stake limits, and statuses.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/import">Import JSON</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/generate">Generate (Mock)</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create round</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createRoundAction} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name" className="text-ink/80">Name</Label>
                <Input id="name" name="name" required className="border-stone-300/70 bg-bone-50 text-ink" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status" className="text-ink/80">Status</Label>
                <select
                  id="status"
                  name="status"
                  className="h-10 w-full rounded-md border border-stone-300/70 bg-bone-50 px-3 text-sm text-ink"
                  defaultValue="draft"
                >
                  <option value="draft">draft</option>
                  <option value="open">open</option>
                  <option value="locked">locked</option>
                  <option value="settled">settled</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="starting_credits" className="text-ink/80">Starting credits</Label>
                <Input
                  id="starting_credits"
                  name="starting_credits"
                  type="number"
                  min={1}
                  defaultValue={10000}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_stake" className="text-ink/80">Min stake</Label>
                <Input
                  id="min_stake"
                  name="min_stake"
                  type="number"
                  min={1}
                  defaultValue={200}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_stake" className="text-ink/80">Max stake</Label>
                <Input
                  id="max_stake"
                  name="max_stake"
                  type="number"
                  min={1}
                  defaultValue={800}
                  className="border-stone-300/70 bg-bone-50 text-ink"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opens_at" className="text-ink/80">Opens at</Label>
                <Input id="opens_at" name="opens_at" type="datetime-local" className="border-stone-300/70 bg-bone-50 text-ink" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closes_at" className="text-ink/80">Closes at</Label>
                <Input id="closes_at" name="closes_at" type="datetime-local" className="border-stone-300/70 bg-bone-50 text-ink" required />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink/70 sm:col-span-2">
                <input type="checkbox" name="enforce_full_budget" />
                Enforce full budget at lock
              </label>
              <div className="sm:col-span-2">
                <Button type="submit" className={getActionButtonClass("primary")}>Create round</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-300/70 text-ink/55">
                    <th className="py-2">Name</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Opens</th>
                    <th className="py-2">Closes</th>
                    <th className="py-2">Credits</th>
                    <th className="py-2">Stake range</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((round) => (
                    <tr key={round.id} className="border-b border-stone-300/70 last:border-b-0">
                      <td className="py-2 font-medium">{round.name}</td>
                      <td className="py-2">{round.status}</td>
                      <td className="py-2">{toInputDateTime(round.opens_at)}</td>
                      <td className="py-2">{toInputDateTime(round.closes_at)}</td>
                      <td className="py-2">{formatCredits(round.starting_credits)}</td>
                      <td className="py-2">
                        {round.min_stake} - {round.max_stake}
                        {round.enforce_full_budget ? " (full)" : ""}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/rounds/${round.id}`}>Edit</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="text-ink/75 hover:bg-bone-100">
                            <Link href={`/admin/settle/${round.id}`}>Settle</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </div>
      </section>
    </main>
  );
}
