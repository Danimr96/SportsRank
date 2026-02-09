import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCredits } from "@/lib/format";

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
    <aside className="fixed bottom-3 left-1/2 z-40 w-[min(1200px,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-stone-400/60 bg-bone-50/95 px-4 py-3 shadow-[0_18px_28px_-24px_rgba(16,12,13,0.55)] backdrop-blur-sm">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <div className="grid gap-1 text-sm md:grid-cols-3">
            <p className="font-medium text-ink">Picks selected: {picksCount}</p>
            <p className="text-ink/70">
              Credits spent: {formatCredits(creditsSpent)} / {formatCredits(creditsStart)}
            </p>
            <p className="text-ink/70">Credits remaining: {formatCredits(creditsRemaining)}</p>
          </div>
          <Progress value={spentRatio} className="h-1.5 bg-bone-200" />
        </div>

        <div className="space-y-2 md:min-w-[190px]">
          {reason ? <p className="text-xs text-rose-700">{reason}</p> : null}
          {isLocked ? (
            <Button
              onClick={onUnlock}
              disabled={!canUnlock || isUnlocking}
              size="lg"
              variant="outline"
              className="w-full"
            >
              {isUnlocking ? "Unlocking..." : "Unlock entry"}
            </Button>
          ) : (
            <Button
              onClick={onLock}
              disabled={!canLock || isLocking}
              size="lg"
              className="w-full"
            >
              {isLocking ? "Locking..." : "Lock entry"}
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
