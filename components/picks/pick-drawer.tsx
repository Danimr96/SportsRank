"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatCredits,
  formatOddsEuropean,
  formatPercentSpanish,
  formatUtcDateTime,
  normalizedProbabilityFromOdds,
} from "@/lib/format";
import { getSportEmoji } from "@/lib/visuals";
import type { PickWithOptions } from "@/lib/types";

interface PickDrawerProps {
  pick: PickWithOptions | null;
  open: boolean;
  minStake: number;
  maxStake: number;
  initialOptionId?: string;
  initialStake?: number;
  onClose: () => void;
  onConfirm: (payload: { pickId: string; pickOptionId: string; stake: number }) => void;
  pending?: boolean;
}

export function PickDrawer({
  pick,
  open,
  minStake,
  maxStake,
  initialOptionId,
  initialStake,
  onClose,
  onConfirm,
  pending = false,
}: PickDrawerProps) {
  const [optionId, setOptionId] = useState(initialOptionId ?? "");
  const [stake, setStake] = useState(initialStake ?? 0);

  useEffect(() => {
    if (!pick) {
      return;
    }

    setOptionId(initialOptionId ?? pick.options[0]?.id ?? "");
    if (typeof initialStake === "number") {
      setStake(Math.max(minStake, Math.min(maxStake, initialStake)));
    } else {
      setStake(minStake);
    }
  }, [pick, initialOptionId, initialStake, minStake, maxStake]);

  const canConfirm = useMemo(() => {
    return Boolean(
      pick &&
        optionId &&
        Number.isInteger(stake) &&
        stake >= minStake &&
        stake <= maxStake,
    );
  }, [maxStake, minStake, optionId, pick, stake]);

  const eventLabel =
    typeof pick?.metadata?.["event"] === "string" ? pick.metadata["event"] : "Unknown event";
  const parsedStart =
    typeof pick?.metadata?.["start_time"] === "string"
      ? new Date(pick.metadata["start_time"])
      : null;
  const startLabel =
    parsedStart && !Number.isNaN(parsedStart.getTime())
      ? formatUtcDateTime(parsedStart)
      : "Missing start_time";
  const selectedOption = pick?.options.find((option) => option.id === optionId);
  const potentialReturn =
    selectedOption && Number.isInteger(stake)
      ? Math.floor(stake * selectedOption.odds)
      : 0;
  const marketOdds = pick?.options.map((option) => option.odds) ?? [];

  return (
    <AnimatePresence>
      {open && pick ? (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Close drawer"
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-forest/25 bg-bone-50 p-6 text-ink shadow-[0_18px_36px_-30px_rgba(1,51,40,0.55)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="surface-forest-soft flex items-start justify-between gap-3 rounded-2xl p-4">
              <div>
                <h3 className="text-lg font-medium">
                  <span className="mr-1">{getSportEmoji(pick.sport.slug)}</span>
                  {pick.title}
                </h3>
                <p className="text-sm text-ink/70">Select option and stake.</p>
                <p className="mt-1 text-xs text-ink/60">
                  {eventLabel} · {startLabel}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-ink/80 hover:bg-forest/10"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-8 space-y-2">
              {pick.options.map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 ${
                    optionId === option.id
                      ? "border-forest/35 bg-forest/10"
                      : "border-stone-300 bg-bone hover:border-forest/40"
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="flex items-center gap-3 text-sm text-right">
                    <span className="text-ink/70">
                      Cuota {formatOddsEuropean(option.odds)} · Prob.{" "}
                      {formatPercentSpanish(
                        normalizedProbabilityFromOdds(option.odds, marketOdds),
                      )}
                    </span>
                    <input
                      type="radio"
                      name="option"
                      value={option.id}
                      checked={optionId === option.id}
                      onChange={() => setOptionId(option.id)}
                    />
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-8 space-y-2">
              <p className="text-sm font-medium">
                Stake: {formatCredits(stake)} créditos
              </p>
              {selectedOption ? (
                <p className="text-xs text-ink/70">
                  Retorno potencial: {formatCredits(potentialReturn)} (
                  {formatCredits(stake)} x cuota {formatOddsEuropean(selectedOption.odds)})
                </p>
              ) : null}
              <input
                type="range"
                min={minStake}
                max={maxStake}
                value={stake}
                onChange={(event) =>
                  setStake(Math.max(minStake, Math.min(maxStake, Number(event.target.value))))
                }
                className="w-full accent-forest"
              />
              <Input
                type="number"
                min={minStake}
                max={maxStake}
                value={stake}
                className="border-stone-300 bg-bone text-ink"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isNaN(next)) {
                    setStake(minStake);
                    return;
                  }
                  setStake(Math.max(minStake, Math.min(maxStake, Math.floor(next))));
                }}
              />
            </div>

            <div className="mt-8">
              <Button
                type="button"
                className="w-full"
                disabled={!canConfirm || pending}
                onClick={() => {
                  if (!pick || !optionId) {
                    return;
                  }

                  onConfirm({
                    pickId: pick.id,
                    pickOptionId: optionId,
                    stake,
                  });
                }}
              >
                {pending ? "Saving..." : "Save selection"}
              </Button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
