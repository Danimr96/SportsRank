import { describe, expect, it } from "vitest";
import {
  buildStakeSuggestions,
  computeProjectedRankRange,
  projectEntryRange,
  projectSelectionRange,
  type LiveSimulationInput,
  type SimulationSelectionInput,
} from "@/lib/domain/simulator";

function mockSelection(overrides: Partial<SimulationSelectionInput> = {}): SimulationSelectionInput {
  return {
    pickId: "pick-1",
    pickTitle: "Match 1",
    sportSlug: "soccer",
    stake: 300,
    odds: 2,
    result: "pending",
    marketOdds: [2, 2],
    editable: true,
    ...overrides,
  };
}

describe("simulator domain", () => {
  it("projects pending selection deterministically", () => {
    const left = projectSelectionRange(mockSelection(), "base");
    const right = projectSelectionRange(mockSelection(), "base");
    expect(left).toEqual(right);
    expect(left.minPayout).toBe(0);
    expect(left.maxPayout).toBe(600);
    expect(left.basePayout).toBe(300);
  });

  it("respects win/lose/void certainty", () => {
    const win = projectSelectionRange(mockSelection({ result: "win" }), "aggressive");
    const lose = projectSelectionRange(mockSelection({ result: "lose" }), "aggressive");
    const refund = projectSelectionRange(mockSelection({ result: "void" }), "aggressive");

    expect(win.minPayout).toBe(win.maxPayout);
    expect(lose.maxPayout).toBe(0);
    expect(refund.basePayout).toBe(300);
  });

  it("projects entry range with cash remaining", () => {
    const entry = projectEntryRange(
      {
        entryId: "e1",
        userId: "u1",
        username: "alex",
        lockedAt: null,
        creditsStart: 10000,
        selections: [
          mockSelection({ stake: 500, odds: 2 }),
          mockSelection({ pickId: "pick-2", stake: 200, odds: 1.5 }),
        ],
      },
      "base",
    );

    expect(entry.totalStake).toBe(700);
    expect(entry.cashRemaining).toBe(9300);
    expect(entry.baseCreditsEnd).toBeGreaterThanOrEqual(entry.minCreditsEnd);
    expect(entry.maxCreditsEnd).toBeGreaterThanOrEqual(entry.baseCreditsEnd);
  });

  it("computes projected rank range with lock tie-break", () => {
    const entries: LiveSimulationInput[] = [
      {
        entryId: "e1",
        userId: "u1",
        username: "alpha",
        lockedAt: "2026-02-01T10:00:00.000Z",
        creditsStart: 10000,
        selections: [mockSelection({ stake: 400, odds: 2 })],
      },
      {
        entryId: "e2",
        userId: "u2",
        username: "beta",
        lockedAt: "2026-02-01T11:00:00.000Z",
        creditsStart: 10000,
        selections: [mockSelection({ stake: 400, odds: 2 })],
      },
    ];

    const range = computeProjectedRankRange(entries, "u1", "base");
    expect(range.participants).toBe(2);
    expect(range.currentRank).toBe(1);
    expect(range.bestRank).toBe(1);
    expect(range.worstRank).toBeGreaterThanOrEqual(1);
  });

  it("builds deterministic and bounded stake suggestions", () => {
    const suggestions = buildStakeSuggestions({
      round: {
        id: "r1",
        name: "R1",
        status: "open",
        opens_at: "2026-02-01T00:00:00.000Z",
        closes_at: "2026-02-07T23:59:59.000Z",
        starting_credits: 10000,
        stake_step: 100,
        min_stake: 200,
        max_stake: 800,
        enforce_full_budget: false,
      },
      picks: [],
      selections: [
        mockSelection({ pickId: "p1", pickTitle: "High risk", stake: 700, odds: 3.5, sportSlug: "soccer" }),
        mockSelection({ pickId: "p2", pickTitle: "Stable", stake: 220, odds: 1.8, sportSlug: "soccer" }),
      ],
      creditsStart: 10000,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      if (suggestion.suggestedStake !== undefined) {
        expect(suggestion.suggestedStake).toBeGreaterThanOrEqual(200);
        expect(suggestion.suggestedStake).toBeLessThanOrEqual(800);
        expect(suggestion.suggestedStake % 100).toBe(0);
      }
    }
  });
});
