"use client";

import { useActionState } from "react";
import {
  generatePicksAction,
  initialGenerateState,
} from "@/app/actions/generate";
import { PicksPreview } from "@/components/admin/picks-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getActionButtonClass } from "@/lib/ui/color-system";

interface GenerateFormProps {
  draftRounds: Array<{ id: string; name: string }>;
  sportSlugs: string[];
  defaultStart: string;
  defaultEnd: string;
}

export function GenerateForm({
  draftRounds,
  sportSlugs,
  defaultStart,
  defaultEnd,
}: GenerateFormProps) {
  const [state, action, pending] = useActionState(generatePicksAction, initialGenerateState);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200/75 bg-white/86 text-slate-900">
        <CardHeader>
          <CardTitle>Generate draft picks (MockProvider)</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="round_id" className="text-slate-700">Round (draft only)</Label>
              <select
                id="round_id"
                name="round_id"
                required
                className="h-10 w-full rounded-md border border-slate-200/75 bg-slate-50 px-3 text-sm text-slate-900"
                defaultValue={draftRounds[0]?.id}
              >
                {draftRounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sports" className="text-slate-700">Sports (comma-separated slugs)</Label>
              <Input
                id="sports"
                name="sports"
                defaultValue={sportSlugs.join(",")}
                placeholder="soccer,basketball"
                className="border-slate-200/75 bg-slate-50 text-slate-900"
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="markets" className="text-slate-700">Markets (comma-separated)</Label>
              <Input
                id="markets"
                name="markets"
                defaultValue="moneyline,totals"
                placeholder="moneyline,totals,spread"
                className="border-slate-200/75 bg-slate-50 text-slate-900"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start" className="text-slate-700">Start</Label>
              <Input
                id="start"
                name="start"
                type="datetime-local"
                defaultValue={defaultStart}
                className="border-slate-200/75 bg-slate-50 text-slate-900"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end" className="text-slate-700">End</Label>
              <Input
                id="end"
                name="end"
                type="datetime-local"
                defaultValue={defaultEnd}
                className="border-slate-200/75 bg-slate-50 text-slate-900"
                required
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Button
                  type="submit"
                  name="intent"
                  value="preview"
                  disabled={pending}
                  className={getActionButtonClass("primary")}
                >
                {pending ? "Working..." : "Preview"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="import"
                disabled={pending}
                variant="outline"
                className="border-slate-300/80 bg-white/75 text-slate-900 hover:bg-white/80"
              >
                {pending ? "Working..." : "Generate and import"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {state.message ? (
        <Card className="border-emerald-300/80 bg-emerald-50 text-emerald-700">
          <CardContent className="pt-6">
            <p className="text-sm font-medium">{state.message}</p>
            {state.generated ? (
              <p className="mt-2 text-sm text-emerald-700/85">
                Generated events: {state.generated.events} · odds rows: {state.generated.odds_markets}
              </p>
            ) : null}
            {state.inserted ? (
              <p className="mt-1 text-sm text-emerald-700/85">
                Inserted picks: {state.inserted.picks} · options: {state.inserted.options}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {state.errors.length > 0 ? (
        <Card className="border-rose-300/80 bg-rose-50 text-rose-700">
          <CardHeader>
            <CardTitle>Validation errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-rose-700">
              {state.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {state.warnings.length > 0 ? (
        <Card className="border-amber-300/80 bg-amber-50 text-amber-700">
          <CardHeader>
            <CardTitle>Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-amber-700">
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {state.preview ? <PicksPreview summary={state.preview} title="Generated preview" /> : null}
    </div>
  );
}
