import { Badge } from "@/components/ui/badge";
import type { PickPack } from "@/lib/types";

interface TodayBoardSummaryProps {
  anchorDate: string;
  pickPack: PickPack | null;
  fallbackDailyCount: number;
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return 0;
}

export function TodayBoardSummary({
  anchorDate,
  pickPack,
  fallbackDailyCount,
}: TodayBoardSummaryProps) {
  const totalFromPack = toInteger(pickPack?.summary?.["total_picks"]);
  const total = pickPack ? totalFromPack : fallbackDailyCount;
  const source = pickPack ? "pick_packs.daily" : "imported picks fallback";

  return (
    <section className="mb-4 rounded-2xl border border-stone-300/70 bg-bone-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink/60">Today board</p>
          <p className="text-sm font-medium text-ink">
            {total} playable picks for {anchorDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{source}</Badge>
          {pickPack ? <Badge variant="default">seeded</Badge> : null}
        </div>
      </div>
    </section>
  );
}
