"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCredits } from "@/lib/format";
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
  const startLabel =
    typeof pick?.metadata?.["start_time"] === "string"
      ? pick.metadata["start_time"]
      : "Missing start_time";

  return (
    <AnimatePresence>
      {open && pick ? (
        <>
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Close drawer"
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-slate-200/75 bg-white p-5 text-slate-900 shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 35 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  <span className="mr-1">{getSportEmoji(pick.sport.slug)}</span>
                  {pick.title}
                </h3>
                <p className="text-sm text-slate-600">Select option and stake.</p>
                <p className="mt-1 text-xs text-slate-500">
                  {eventLabel} · {startLabel}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-slate-700 hover:bg-white/80"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 space-y-3">
              {pick.options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200/75 bg-white/75 p-3 hover:bg-cyan-50"
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className="text-slate-600">{option.odds.toFixed(2)}x</span>
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

            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium">Stake: {formatCredits(stake)}</p>
              <input
                type="range"
                min={minStake}
                max={maxStake}
                value={stake}
                onChange={(event) =>
                  setStake(Math.max(minStake, Math.min(maxStake, Number(event.target.value))))
                }
                className="w-full accent-cyan-600"
              />
              <Input
                type="number"
                min={minStake}
                max={maxStake}
                value={stake}
                className="border-slate-200/75 bg-slate-50 text-slate-900"
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
                className="w-full bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-600 text-white hover:brightness-110"
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
                {pending ? "Saving..." : "Confirm selection"}
              </Button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
