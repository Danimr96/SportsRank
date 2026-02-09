import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankedLeaderboardEntry } from "@/lib/domain/ranking";
import { formatCredits, formatUtcDateTime } from "@/lib/format";

interface LeaderboardTableProps {
  rows: RankedLeaderboardEntry[];
}

export function LeaderboardTable({ rows }: LeaderboardTableProps) {
  return (
    <Card className="rounded-2xl border border-slate-200/75 bg-white/84 text-slate-900">
      <CardHeader>
        <CardTitle>Round Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/75 text-slate-500">
                <th className="py-2">Rank</th>
                <th className="py-2">User</th>
                <th className="py-2">Credits</th>
                <th className="py-2">Locked at</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.entry_id}
                  className="border-b border-slate-200/75 last:border-b-0"
                >
                  <td className="py-2 font-semibold">#{row.rank}</td>
                  <td className="py-2">{row.username}</td>
                  <td className="py-2">{formatCredits(row.credits_end)}</td>
                  <td className="py-2 text-slate-500">
                    {formatUtcDateTime(new Date(row.locked_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
