import { describe, expect, it } from "vitest";
import { validateEntry, validateSelection } from "@/lib/domain/validation";
import type { PickWithOptions, Round } from "@/lib/types";

const baseRound: Round = {
  id: "r1",
  name: "Round 1",
  status: "open",
  opens_at: "2026-02-03T00:00:00.000Z",
  closes_at: "2026-02-10T23:59:00.000Z",
  starting_credits: 10000,
  min_stake: 200,
  max_stake: 800,
  enforce_full_budget: false,
};

const picks: PickWithOptions[] = [
  {
    id: "p1",
    round_id: "r1",
    sport_id: "s1",
    title: "Match winner",
    description: null,
    order_index: 0,
    is_required: true,
    metadata: {
      league: "LaLiga",
      event: "A vs B",
      start_time: "2026-02-09T18:00:00.000Z",
    },
    sport: { id: "s1", slug: "soccer", name: "Soccer", icon: null },
    options: [
      { id: "o1", pick_id: "p1", label: "Home", odds: 1.5, result: "pending" },
      { id: "o2", pick_id: "p1", label: "Away", odds: 2.1, result: "pending" },
    ],
  },
  {
    id: "p2",
    round_id: "r1",
    sport_id: "s2",
    title: "Total points",
    description: null,
    order_index: 1,
    is_required: true,
    metadata: {
      league: "NBA",
      event: "C vs D",
      start_time: "2026-02-10T20:00:00.000Z",
    },
    sport: { id: "s2", slug: "basketball", name: "Basketball", icon: null },
    options: [
      { id: "o3", pick_id: "p2", label: "Over", odds: 1.8, result: "pending" },
      { id: "o4", pick_id: "p2", label: "Under", odds: 2.0, result: "pending" },
    ],
  },
];

describe("validateEntry", () => {
  it("accepts valid entries with cash remaining", () => {
    const result = validateEntry(
      baseRound,
      picks,
      [{ pick_id: "p1", pick_option_id: "o1", stake: 400 }],
      10000,
      new Date("2026-02-08T00:00:00.000Z"),
    );

    expect(result.ok).toBe(true);
    expect(result.totalStake).toBe(400);
    expect(result.remainingCredits).toBe(9600);
  });

  it("fails when a stake is outside round min/max", () => {
    const result = validateEntry(
      baseRound,
      picks,
      [{ pick_id: "p1", pick_option_id: "o1", stake: 150 }],
      10000,
      new Date("2026-02-08T00:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "STAKE_OUT_OF_RANGE")).toBe(true);
  });

  it("fails when spent credits exceed weekly credits", () => {
    const result = validateEntry(
      baseRound,
      picks,
      [
        { pick_id: "p1", pick_option_id: "o1", stake: 700 },
        { pick_id: "p2", pick_option_id: "o3", stake: 700 },
      ],
      1200,
      new Date("2026-02-08T00:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "TOTAL_STAKE_EXCEEDED")).toBe(true);
  });

  it("enforces full budget only when round flag is enabled", () => {
    const result = validateEntry(
      { ...baseRound, enforce_full_budget: true },
      picks,
      [{ pick_id: "p1", pick_option_id: "o1", stake: 400 }],
      10000,
      new Date("2026-02-08T00:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "FULL_BUDGET_REQUIRED")).toBe(true);
  });
});

describe("validateSelection", () => {
  it("accepts selection update before event start", () => {
    const result = validateSelection(
      baseRound,
      picks,
      [{ pick_id: "p2", pick_option_id: "o3", stake: 300 }],
      { pick_id: "p1", pick_option_id: "o1", stake: 500 },
      10000,
      new Date("2026-02-08T00:00:00.000Z"),
    );

    expect(result.ok).toBe(true);
    expect(result.totalStake).toBe(800);
    expect(result.remainingCredits).toBe(9200);
  });

  it("rejects selection changes after event start time", () => {
    const result = validateSelection(
      baseRound,
      picks,
      [],
      { pick_id: "p1", pick_option_id: "o1", stake: 400 },
      10000,
      new Date("2026-02-09T18:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "PICK_ALREADY_STARTED")).toBe(true);
  });

  it("rejects selection stake under minimum", () => {
    const result = validateSelection(
      baseRound,
      picks,
      [],
      { pick_id: "p1", pick_option_id: "o1", stake: 100 },
      10000,
      new Date("2026-02-08T00:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "STAKE_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects selection updates after round closes_at", () => {
    const result = validateSelection(
      baseRound,
      picks,
      [],
      { pick_id: "p1", pick_option_id: "o1", stake: 400 },
      10000,
      new Date("2026-02-11T00:00:00.000Z"),
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "ROUND_CLOSED")).toBe(true);
  });
});
