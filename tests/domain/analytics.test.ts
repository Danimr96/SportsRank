import { describe, expect, it } from "vitest";
import {
  computeAnalyticsDashboard,
  filterAnalyticsRows,
  type AnalyticsSelectionRow,
} from "@/lib/domain/analytics";

const rows: AnalyticsSelectionRow[] = [
  {
    sportSlug: "soccer",
    sportName: "Football",
    boardType: "daily",
    stake: 400,
    payout: 760,
    eventStartTime: "2026-02-09T18:00:00.000Z", // Mon
  },
  {
    sportSlug: "basketball",
    sportName: "Basketball",
    boardType: "weekly",
    stake: 300,
    payout: 0,
    eventStartTime: "2026-02-10T18:00:00.000Z", // Tue
  },
  {
    sportSlug: "soccer",
    sportName: "Football",
    boardType: "weekly",
    stake: 500,
    payout: 500,
    eventStartTime: "2026-02-11T18:00:00.000Z", // Wed
  },
  {
    sportSlug: "tennis",
    sportName: "Tennis",
    boardType: "other",
    stake: 600,
    payout: 1200,
    eventStartTime: "2026-02-14T18:00:00.000Z", // Sat
  },
];

describe("computeAnalyticsDashboard", () => {
  it("aggregates totals and outcomes correctly", () => {
    const dashboard = computeAnalyticsDashboard(rows);

    expect(dashboard.summary.selections).toBe(4);
    expect(dashboard.summary.totalStake).toBe(1800);
    expect(dashboard.summary.totalPayout).toBe(2460);
    expect(dashboard.summary.totalNet).toBe(660);
    expect(dashboard.summary.winCount).toBe(2);
    expect(dashboard.summary.refundCount).toBe(1);
    expect(dashboard.summary.lossCount).toBe(1);
    expect(Math.round(dashboard.summary.roiPercent * 100) / 100).toBe(36.67);
  });

  it("returns sport breakdown sorted by stake desc", () => {
    const dashboard = computeAnalyticsDashboard(rows);

    expect(dashboard.bySport.map((item) => item.key)).toEqual([
      "soccer",
      "tennis",
      "basketball",
    ]);
    expect(dashboard.bySport[0]?.totalStake).toBe(900);
    expect(dashboard.bySport[0]?.totalPayout).toBe(1260);
  });

  it("populates weekday metrics using UTC order Mon..Sun", () => {
    const dashboard = computeAnalyticsDashboard(rows);

    expect(dashboard.byWeekday.map((item) => item.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(dashboard.byWeekday[0]?.totalStake).toBe(400);
    expect(dashboard.byWeekday[1]?.totalStake).toBe(300);
    expect(dashboard.byWeekday[5]?.totalStake).toBe(600);
  });
});

describe("filterAnalyticsRows", () => {
  it("filters by board and sport", () => {
    const filtered = filterAnalyticsRows(rows, {
      boardType: "weekly",
      sportSlug: "soccer",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.stake).toBe(500);
  });

  it("supports all board and all sports", () => {
    const filtered = filterAnalyticsRows(rows, {
      boardType: "all",
      sportSlug: "all",
    });

    expect(filtered).toHaveLength(4);
  });
});
