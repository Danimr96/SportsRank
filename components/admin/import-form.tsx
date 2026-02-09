"use client";

import { useActionState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  FileJson2,
  Sparkles,
  Upload,
} from "lucide-react";
import { importPicksAction } from "@/app/actions/import";
import { PicksPreview } from "@/components/admin/picks-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { initialImportState } from "@/lib/ingestion/import-state";
import { getActionButtonClass } from "@/lib/ui/color-system";

const SAMPLE_PAYLOAD = JSON.stringify(
  {
    round_id: "123e4567-e89b-42d3-a456-426614174000",
    picks: [
      {
        sport_slug: "soccer",
        title: "[WEEK] Barcelona vs Real Madrid - h2h",
        description: "Main market",
        order_index: 0,
        options: [
          { label: "Barcelona", odds: 1.9 },
          { label: "Real Madrid", odds: 2.2 },
        ],
        metadata: {
          league: "LaLiga",
          event: "Barcelona vs Real Madrid",
          start_time: "2026-02-09T18:00:00.000Z",
        },
      },
    ],
  },
  null,
  2,
);

function FeedbackCard({
  title,
  tone,
  icon,
  items,
}: {
  title: string;
  tone: "danger" | "warning";
  icon: ReactNode;
  items: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        className={
          tone === "danger"
            ? "border-clay/35 bg-clay/10 text-clay"
            : "border-stone-300/70 bg-bone-50 text-ink"
        }
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul
            className={
              tone === "danger"
                ? "space-y-1 text-sm text-clay"
                : "space-y-1 text-sm text-ink/75"
            }
          >
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState(importPicksAction, initialImportState);

  const errors = state?.errors ?? [];
  const warnings = state?.warnings ?? [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-2">
                <Badge variant="outline">
                  Import Studio
                </Badge>
                <CardTitle className="text-2xl leading-tight">
                  Upload and validate picks in one pass
                </CardTitle>
                <CardDescription className="text-ink/70">
                  Preview and validate before writing picks into a draft round.
                </CardDescription>
              </div>
              <Sparkles className="size-5 text-forest" />
            </div>
          </CardHeader>
          <CardContent>
            <form action={action} className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
                <div className="space-y-4 rounded-2xl border border-stone-300/70 bg-bone-50 p-4">
                  <div className="space-y-2">
                    <Label htmlFor="json_file" className="text-sm font-medium text-ink/80">
                      JSON file
                    </Label>
                    <label
                      htmlFor="json_file"
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-stone-400/70 bg-bone px-4 py-3 text-sm text-ink transition hover:bg-bone-100"
                    >
                      <Upload className="size-4 text-forest" />
                      Select `.json` file
                    </label>
                    <input
                      id="json_file"
                      name="json_file"
                      type="file"
                      accept="application/json,.json"
                      className="block w-full rounded-lg border border-stone-300/70 bg-bone p-2 text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-forest/10 file:px-3 file:py-1.5 file:text-forest hover:file:bg-forest/15"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payload" className="text-sm font-medium text-ink/80">
                      Or paste JSON payload
                    </Label>
                    <textarea
                      id="payload"
                      name="payload"
                      rows={16}
                      className="w-full rounded-xl border border-stone-300/70 bg-bone p-3 font-mono text-xs text-ink outline-none ring-forest/30 transition focus:ring"
                      placeholder={SAMPLE_PAYLOAD}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-stone-300/70 bg-bone-50 p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                      <FileJson2 className="size-4 text-forest" />
                      Quality checklist
                    </p>
                    <ul className="space-y-2 text-sm text-ink/70">
                      <li>Use a draft round id that exists.</li>
                      <li>Each pick must include `metadata.start_time` in UTC ISO.</li>
                      <li>Do not invent odds, use source feed values.</li>
                      <li>Keep `order_index` unique in the payload.</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-forest/30 bg-forest/10 p-4">
                    <p className="mb-2 text-sm font-semibold text-forest">Tip</p>
                    <p className="text-sm text-forest/90">
                      Run preview first, then import only when warnings look acceptable.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  name="intent"
                  value="preview"
                  disabled={pending}
                  className={getActionButtonClass("primary")}
                >
                  {pending ? "Working..." : "Preview payload"}
                </Button>
                <Button
                  type="submit"
                  name="intent"
                  value="import"
                  disabled={pending}
                  variant="outline"
                >
                  {pending ? "Working..." : "Validate and import"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {state.message ? (
          <motion.div
            key="import-message"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
        <Card className="border-forest/35 bg-forest/10 text-forest">
          <CardContent className="pt-6">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4" />
              {state.message}
            </p>
            {state.inserted ? (
              <p className="mt-2 text-sm text-forest/85">
                Inserted picks: {state.inserted.picks} | options: {state.inserted.options}
              </p>
            ) : null}
              </CardContent>
            </Card>
          </motion.div>
        ) : null}

        {errors.length > 0 ? (
          <FeedbackCard
            key="import-errors"
            title="Validation errors"
            tone="danger"
            icon={<AlertTriangle className="size-4" />}
            items={errors}
          />
        ) : null}

        {warnings.length > 0 ? (
          <FeedbackCard
            key="import-warnings"
            title="Warnings"
            tone="warning"
            icon={<AlertTriangle className="size-4" />}
            items={warnings}
          />
        ) : null}
      </AnimatePresence>

      {state.preview ? <PicksPreview summary={state.preview} title="Preview summary" /> : null}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Schema sample</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-xl border border-stone-300/70 bg-bone-50 p-3 text-xs text-ink/75">
            <code>{SAMPLE_PAYLOAD}</code>
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
