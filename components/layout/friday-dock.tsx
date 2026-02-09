import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCredits } from "@/lib/format";
import { getActionButtonClass } from "@/lib/ui/color-system";
import { cn } from "@/lib/utils";

interface FridayDockProps {
  creditsSpent: number;
  creditsRemaining: number;
  creditsStart: number;
  picksCount: number;
  isLocked: boolean;
  canLock: boolean;
  canUnlock: boolean;
  lockDisabledReason?: string;
  unlockDisabledReason?: string;
  onLock: () => void;
  onUnlock: () => void;
  isLocking?: boolean;
  isUnlocking?: boolean;
}

export function FridayDock({
  creditsSpent,
  creditsRemaining,
  creditsStart,
  picksCount,
  isLocked,
  canLock,
  canUnlock,
  lockDisabledReason,
  unlockDisabledReason,
  onLock,
  onUnlock,
  isLocking = false,
  isUnlocking = false,
}: FridayDockProps) {
  const reason = isLocked ? unlockDisabledReason : lockDisabledReason;
  const spentRatio =
    creditsStart <= 0 ? 0 : Math.max(0, Math.min(100, (creditsSpent / creditsStart) * 100));

  return (
    <Card className="fixed bottom-3 left-1/2 z-30 w-[min(68rem,calc(100%-1.25rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-300/80 bg-[linear-gradient(135deg,rgba(255,249,236,0.96),rgba(252,246,235,0.94)),radial-gradient(circle_at_10%_0%,rgba(8,145,178,0.18),transparent_36%),radial-gradient(circle_at_90%_0%,rgba(109,40,217,0.15),transparent_38%)] px-4 py-3 text-slate-900 shadow-[0_26px_60px_-36px_rgba(30,64,175,0.34)] backdrop-blur">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute -left-8 top-2 h-20 w-20 rounded-full bg-cyan-600/22 blur-2xl" />
        <div className="absolute right-8 top-0 h-20 w-20 rounded-full bg-violet-600/20 blur-2xl" />
      </div>
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full space-y-2">
          <div className="grid gap-1 text-sm sm:grid-cols-3 sm:gap-6">
            <p className="font-medium text-slate-900">Picks: {picksCount}</p>
            <p className="text-slate-600">
              Spent: {formatCredits(creditsSpent)} / {formatCredits(creditsStart)}
            </p>
            <p className="text-slate-600">Remaining: {formatCredits(creditsRemaining)}</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
              <span>Budget progress</span>
              <span>{Math.round(spentRatio)}%</span>
            </div>
            <Progress value={spentRatio} className="h-1.5 bg-white/80" />
          </div>
        </div>

        <div className="flex min-w-[13rem] flex-col items-end gap-2">
          {reason ? <p className="text-xs text-rose-600">{reason}</p> : null}
          {isLocked ? (
            <Button
              onClick={onUnlock}
              disabled={!canUnlock || isUnlocking}
              size="lg"
              variant="outline"
              className={cn("w-full border-cyan-400/70 bg-cyan-100 text-cyan-900", getActionButtonClass("neutral"))}
            >
              {isUnlocking ? "Unlocking..." : "Unlock entry"}
            </Button>
          ) : (
            <Button
              onClick={onLock}
              disabled={!canLock || isLocking}
              size="lg"
              className={cn("w-full", getActionButtonClass("primary"))}
            >
              {isLocking ? "Locking..." : "Lock entry"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
