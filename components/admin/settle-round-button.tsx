"use client";

import { useState, useTransition } from "react";
import { settleRoundAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { getActionButtonClass } from "@/lib/ui/color-system";

interface SettleRoundButtonProps {
  roundId: string;
  disabled?: boolean;
}

export function SettleRoundButton({ roundId, disabled = false }: SettleRoundButtonProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={disabled || pending}
        className={getActionButtonClass("primary")}
        onClick={() => {
          startTransition(async () => {
            const result = await settleRoundAction(roundId);
            setMessage(result.ok ? "Round settled." : result.error ?? "Settle failed.");
          });
        }}
      >
        {pending ? "Settling..." : "Settle round"}
      </Button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </div>
  );
}
