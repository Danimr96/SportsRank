export type AnalyticsBoardType = "daily" | "weekly" | "other";

export interface AnalyticsSelectionRow {
  sportSlug: string;
  sportName: string;
  boardType: AnalyticsBoardType;
  stake: number;
  payout: number;
  eventStartTime: string | null;
}

export interface AnalyticsSummary {
  selections: number;
  totalStake: number;
  totalPayout: number;
  totalNet: number;
  averageStake: number;
  roiPercent: number;
  recoveryPercent: number;
  winCount: number;
  refundCount: number;
  lossCount: number;
}

export interface AnalyticsBreakdown extends AnalyticsSummary {
  key: string;
  label: string;
}

export interface AnalyticsStakeBucket extends AnalyticsSummary {
  key: "conservative" | "balanced" | "aggressive";
  label: string;
}

export interface AnalyticsDashboard {
  summary: AnalyticsSummary;
  bySport: AnalyticsBreakdown[];
  byBoard: AnalyticsBreakdown[];
  byWeekday: AnalyticsBreakdown[];
  byStakeBucket: AnalyticsStakeBucket[];
}

export interface AnalyticsFilters {
  boardType?: "all" | AnalyticsBoardType;
  sportSlug?: string | "all";
}

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const STAKE_BUCKET_KEYS = ["conservative", "balanced", "aggressive"] as const;

interface MutableSummary {
  selections: number;
  totalStake: number;
  totalPayout: number;
  winCount: number;
  refundCount: number;
  lossCount: number;
}

function createMutableSummary(): MutableSummary {
  return {
    selections: 0,
    totalStake: 0,
    totalPayout: 0,
    winCount: 0,
    refundCount: 0,
    lossCount: 0,
  };
}

function toSummary(stats: MutableSummary): AnalyticsSummary {
  const totalNet = stats.totalPayout - stats.totalStake;
  const averageStake = stats.selections > 0 ? stats.totalStake / stats.selections : 0;
  const roiPercent = stats.totalStake > 0 ? (totalNet / stats.totalStake) * 100 : 0;
  const recoveryPercent =
    stats.totalStake > 0 ? (stats.totalPayout / stats.totalStake) * 100 : 0;

  return {
    selections: stats.selections,
    totalStake: stats.totalStake,
    totalPayout: stats.totalPayout,
    totalNet,
    averageStake,
    roiPercent,
    recoveryPercent,
    winCount: stats.winCount,
    refundCount: stats.refundCount,
    lossCount: stats.lossCount,
  };
}

function toPositiveInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function getWeekdayIndexUtc(eventStartTime: string | null): number {
  if (!eventStartTime) {
    return 0;
  }

  const date = new Date(eventStartTime);
  const utcDay = date.getUTCDay();
  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  return (utcDay + 6) % 7;
}

function getStakeBucket(stake: number): AnalyticsStakeBucket["key"] {
  if (stake <= 300) {
    return "conservative";
  }

  if (stake <= 600) {
    return "balanced";
  }

  return "aggressive";
}

function applyRow(summary: MutableSummary, row: AnalyticsSelectionRow): void {
  const stake = toPositiveInteger(row.stake);
  const payout = toPositiveInteger(row.payout);

  summary.selections += 1;
  summary.totalStake += stake;
  summary.totalPayout += payout;

  if (payout > stake) {
    summary.winCount += 1;
  } else if (payout === stake) {
    summary.refundCount += 1;
  } else {
    summary.lossCount += 1;
  }
}

function parseBoardType(value: string): AnalyticsBoardType {
  if (value === "daily" || value === "weekly") {
    return value;
  }

  return "other";
}

function buildBreakdown(
  source: Map<string, { label: string; summary: MutableSummary }>,
): AnalyticsBreakdown[] {
  return Array.from(source.entries())
    .map(([key, item]) => ({
      key,
      label: item.label,
      ...toSummary(item.summary),
    }))
    .sort((left, right) => {
      if (right.totalStake !== left.totalStake) {
        return right.totalStake - left.totalStake;
      }
      return left.label.localeCompare(right.label);
    });
}

export function filterAnalyticsRows(
  rows: AnalyticsSelectionRow[],
  filters: AnalyticsFilters,
): AnalyticsSelectionRow[] {
  return rows.filter((row) => {
    const boardType = parseBoardType(row.boardType);

    if (filters.boardType && filters.boardType !== "all" && boardType !== filters.boardType) {
      return false;
    }

    if (filters.sportSlug && filters.sportSlug !== "all" && row.sportSlug !== filters.sportSlug) {
      return false;
    }

    return true;
  });
}

export function computeAnalyticsDashboard(rows: AnalyticsSelectionRow[]): AnalyticsDashboard {
  const summary = createMutableSummary();

  const bySport = new Map<string, { label: string; summary: MutableSummary }>();
  const byBoard = new Map<string, { label: string; summary: MutableSummary }>([
    ["daily", { label: "Daily", summary: createMutableSummary() }],
    ["weekly", { label: "Weekly", summary: createMutableSummary() }],
    ["other", { label: "Other", summary: createMutableSummary() }],
  ]);
  const byWeekday = new Map<string, { label: string; summary: MutableSummary }>();
  const byStakeBucket = new Map<AnalyticsStakeBucket["key"], { label: string; summary: MutableSummary }>([
    ["conservative", { label: "Conservative (<=300)", summary: createMutableSummary() }],
    ["balanced", { label: "Balanced (301-600)", summary: createMutableSummary() }],
    ["aggressive", { label: "Aggressive (>=601)", summary: createMutableSummary() }],
  ]);

  WEEKDAY_KEYS.forEach((key, index) => {
    byWeekday.set(key, {
      label: WEEKDAY_LABELS[index] ?? "N/A",
      summary: createMutableSummary(),
    });
  });

  for (const row of rows) {
    const boardType = parseBoardType(row.boardType);
    const stake = toPositiveInteger(row.stake);
    const weekdayIndex = getWeekdayIndexUtc(row.eventStartTime);
    const weekdayKey = WEEKDAY_KEYS[weekdayIndex] ?? WEEKDAY_KEYS[0];

    applyRow(summary, row);

    const sportSummary = bySport.get(row.sportSlug) ?? {
      label: row.sportName,
      summary: createMutableSummary(),
    };
    applyRow(sportSummary.summary, row);
    bySport.set(row.sportSlug, sportSummary);

    const boardSummary = byBoard.get(boardType);
    if (boardSummary) {
      applyRow(boardSummary.summary, row);
    }

    const weekdaySummary = byWeekday.get(weekdayKey);
    if (weekdaySummary) {
      applyRow(weekdaySummary.summary, row);
    }

    const stakeBucket = byStakeBucket.get(getStakeBucket(stake));
    if (stakeBucket) {
      applyRow(stakeBucket.summary, row);
    }
  }

  return {
    summary: toSummary(summary),
    bySport: buildBreakdown(bySport),
    byBoard: buildBreakdown(byBoard),
    byWeekday: WEEKDAY_KEYS.flatMap((weekdayKey) => {
      const item = byWeekday.get(weekdayKey);
      if (!item) {
        return [];
      }
      return [{ key: weekdayKey, label: item.label, ...toSummary(item.summary) }];
    }),
    byStakeBucket: STAKE_BUCKET_KEYS.flatMap((bucketKey) => {
      const item = byStakeBucket.get(bucketKey);
      if (!item) {
        return [];
      }
      return [{ key: bucketKey, label: item.label, ...toSummary(item.summary) }];
    }),
  };
}
