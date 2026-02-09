import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PicksPreviewSummary } from "@/lib/ingestion/types";

interface PicksPreviewProps {
  summary: PicksPreviewSummary;
  title?: string;
}

export function PicksPreview({ summary, title = "Preview summary" }: PicksPreviewProps) {
  return (
    <Card className="rounded-2xl border border-slate-200/75 bg-white/86 text-slate-900">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">Total picks: {summary.total_picks}</p>
        <p className="text-sm">
          Odds range: {summary.min_odds.toFixed(2)} - {summary.max_odds.toFixed(2)}
        </p>
        <div>
          <p className="mb-2 text-sm font-medium">Counts by sport</p>
          <ul className="space-y-1 text-sm text-slate-600">
            {Object.entries(summary.counts_by_sport).map(([sportSlug, count]) => (
              <li key={sportSlug}>
                {sportSlug}: {count}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
