import { Button } from "@/components/ui/button";
import { getPickBoardType } from "@/lib/domain/pick-organization";
import { formatCredits, formatOddsEuropean } from "@/lib/format";
import { getSportEmoji } from "@/lib/visuals";
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
}

function boardLabelFromTitle(title: string): string {
  const boardType = getPickBoardType(title);
  if (boardType === "daily") {
    return "Daily";
  }
  if (boardType === "weekly") {
    return "Weekly";
  }
  return "Other";
}

function boardToneClass(boardLabel: string): string {
  if (boardLabel === "Daily") {
    return "border-forest/35 bg-forest/10 text-forest";
  }
  if (boardLabel === "Weekly") {
    return "border-clay/40 bg-clay/15 text-ink";
  }
  return "border-stone-300/70 bg-bone-100 text-ink/70";
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
}: PickCardProps) {
  const boardLabel = boardLabelFromTitle(pick.title);
  const potential =
    selectedStake && selectedOdds ? Math.floor(selectedStake * selectedOdds) : null;

  return (
    <article className="hover-lift grid gap-3 border-b border-stone-300/55 py-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${boardToneClass(
              boardLabel,
            )}`}
          >
            {boardLabel}
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink/60">
            {pick.is_required ? "Required" : "Optional"}
          </span>
        </div>
        <h4 className="text-base font-medium text-ink">
          <span className="mr-1.5">{getSportEmoji(pick.sport.slug)}</span>
          {pick.title}
        </h4>
        {pick.description ? <p className="text-sm text-ink/75">{pick.description}</p> : null}
        <p className="text-xs text-ink/60">Starts {eventStartText}</p>
        {selectedLabel ? (
          <p className="text-sm text-ink/75">
            Selected <span className="font-medium text-ink">{selectedLabel}</span>
            {selectedStake ? ` · Stake ${formatCredits(selectedStake)}` : ""}
            {selectedOdds ? ` · Odds ${formatOddsEuropean(selectedOdds)}` : ""}
            {potential ? ` · Potential ${formatCredits(potential)}` : ""}
          </p>
        ) : (
          <p className="text-sm text-ink/55">No selection yet.</p>
        )}
        {lockReason ? <p className="text-xs text-rose-700">{lockReason}</p> : null}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onOpen} disabled={disabled}>
          {disabled ? "Locked" : selectedLabel ? "Edit pick" : "Select pick"}
        </Button>
      </div>
    </article>
  );
}
