import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPickBoardType } from "@/lib/domain/pick-organization";
import { formatCredits, formatOddsEuropean } from "@/lib/format";
import { getBoardVisualTheme, getSportVisualTheme } from "@/lib/ui/color-system";
import { getSportEmoji } from "@/lib/visuals";
import { cn } from "@/lib/utils";
import type { PickWithOptions } from "@/lib/types";

interface PickCardProps {
  pick: PickWithOptions;
  selectedLabel?: string;
  selectedStake?: number;
  selectedOdds?: number;
  eventStartText: string;
  lockReason?: string;
  onOpen: () => void;
  disabled?: boolean;
  accentClassName?: string;
}

export function PickCard({
  pick,
  selectedLabel,
  selectedStake,
  selectedOdds,
  eventStartText,
  lockReason,
  onOpen,
  disabled,
  accentClassName,
}: PickCardProps) {
  const boardType = getPickBoardType(pick.title);
  const boardTone = getBoardVisualTheme(boardType).badgeClassName;
  const sportTone = getSportVisualTheme(pick.sport.slug);

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-slate-300/75 bg-[#fffaf1]/92 text-slate-900 shadow-[0_26px_74px_-48px_rgba(30,64,175,0.34)]">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -right-8 -top-10 h-20 w-20 rounded-full bg-cyan-500/20 blur-2xl" />
      </div>
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-600/30 via-blue-600/80 to-violet-600/30",
          accentClassName,
        )}
      />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">
            <span className="mr-1">{getSportEmoji(pick.sport.slug)}</span>
            {pick.title}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {pick.is_required ? (
              <Badge className={sportTone.chipClassName}>
                Required
              </Badge>
            ) : null}
            <Badge className={boardTone}>
              {boardType === "daily" ? "Daily" : boardType === "weekly" ? "Weekly" : "Other"}
            </Badge>
          </div>
        </div>
        {pick.description ? (
          <p className="text-sm text-slate-600">{pick.description}</p>
        ) : null}
        <p className="text-xs text-slate-500">
          Event start: {eventStartText}
        </p>
        {lockReason ? <p className="text-xs text-rose-600">{lockReason}</p> : null}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3 pt-0">
        <div className="text-sm">
          {selectedLabel ? (
            <div className="space-y-1">
              <p className="font-medium text-slate-900">{selectedLabel}</p>
              <p className="text-xs text-cyan-800">
                Stake {formatCredits(selectedStake ?? 0)}
                {selectedOdds ? ` · Cuota ${formatOddsEuropean(selectedOdds)}` : ""}
              </p>
              {selectedOdds && selectedStake ? (
                <p className="text-xs text-slate-600">
                  Potencial: {formatCredits(Math.floor(selectedStake * selectedOdds))}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-slate-500">No selection yet</p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-300/80 bg-[#fff7ea]/85 text-slate-900 hover:bg-[#fff3e0]"
          onClick={onOpen}
          disabled={disabled}
        >
          {disabled ? "Locked" : selectedLabel ? "Edit" : "Pick"}
        </Button>
      </CardContent>
    </Card>
  );
}
