import { describe, expect, it } from "vitest";
import { calculatePayout, settleEntry } from "@/lib/domain/settlement";

describe("calculatePayout", () => {
  it("returns floor(stake * odds) when win", () => {
    expect(calculatePayout(3333, 2.11, "win")).toBe(7032);
  });

  it("returns zero when lose", () => {
    expect(calculatePayout(5000, 1.9, "lose")).toBe(0);
  });

  it("returns stake when void", () => {
    expect(calculatePayout(5000, 1.9, "void")).toBe(5000);
  });

  it("throws for pending result", () => {
    expect(() => calculatePayout(5000, 1.9, "pending")).toThrow(
      "Cannot settle while selection result is pending.",
    );
  });
});

describe("settleEntry", () => {
  it("aggregates payouts into creditsEnd", () => {
    const result = settleEntry([
      { id: "s1", stake: 4000, odds: 2.0, result: "win" },
      { id: "s2", stake: 3000, odds: 1.8, result: "lose" },
      { id: "s3", stake: 3000, odds: 1.5, result: "void" },
    ]);

    expect(result.selections).toEqual([
      { id: "s1", payout: 8000 },
      { id: "s2", payout: 0 },
      { id: "s3", payout: 3000 },
    ]);
    expect(result.creditsEnd).toBe(11000);
  });

  it("keeps unspent cash in creditsEnd", () => {
    const result = settleEntry(
      [
        { id: "s1", stake: 500, odds: 2.0, result: "win" },
        { id: "s2", stake: 200, odds: 1.8, result: "lose" },
      ],
      10000,
    );

    expect(result.cashRemaining).toBe(9300);
    expect(result.creditsEnd).toBe(10300);
  });
});
