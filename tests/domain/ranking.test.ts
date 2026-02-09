import { describe, expect, it } from "vitest";
import { computeLeaderboard, computeLiveLeaderboard } from "@/lib/domain/ranking";

describe("computeLeaderboard", () => {
  it("sorts by credits desc and locked_at asc", () => {
    const rows = computeLeaderboard([
      {
        entry_id: "e1",
        user_id: "u1",
        username: "alex",
        credits_end: 12000,
        locked_at: "2026-02-01T12:00:00.000Z",
      },
      {
        entry_id: "e2",
        user_id: "u2",
        username: "sam",
        credits_end: 14000,
        locked_at: "2026-02-01T14:00:00.000Z",
      },
      {
        entry_id: "e3",
        user_id: "u3",
        username: "morgan",
        credits_end: 12000,
        locked_at: "2026-02-01T11:00:00.000Z",
      },
    ]);

    expect(rows.map((row) => row.entry_id)).toEqual(["e2", "e3", "e1"]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
  });
});

describe("computeLiveLeaderboard", () => {
  it("computes current and potential rank range for current user", () => {
    const result = computeLiveLeaderboard(
      [
        {
          entry_id: "e1",
          user_id: "u1",
          username: "alex",
          locked_at: "2026-02-01T10:00:00.000Z",
          credits_start: 10000,
          selections: [
            {
              sportSlug: "soccer",
              stake: 500,
              odds: 2,
              result: "pending",
              marketOdds: [2, 2],
            },
          ],
        },
        {
          entry_id: "e2",
          user_id: "u2",
          username: "sam",
          locked_at: "2026-02-01T11:00:00.000Z",
          credits_start: 10000,
          selections: [
            {
              sportSlug: "soccer",
              stake: 500,
              odds: 2,
              result: "win",
              marketOdds: [2, 2],
            },
          ],
        },
      ],
      { currentUserId: "u1", sportSlug: "all" },
    );

    expect(result.mode).toBe("credits");
    expect(result.rows[0]?.entry_id).toBe("e2");
    expect(result.rows[1]?.entry_id).toBe("e1");
    expect(result.rows[1]?.currentScore).toBe(10000);
    expect(result.rows[1]?.minScore).toBe(9500);
    expect(result.rows[1]?.maxScore).toBe(10500);
    expect(result.myRange.currentRank).toBe(2);
    expect(result.myRange.bestRank).toBe(1);
    expect(result.myRange.worstRank).toBe(2);
  });

  it("switches to net mode when filtering by sport", () => {
    const result = computeLiveLeaderboard(
      [
        {
          entry_id: "e1",
          user_id: "u1",
          username: "alex",
          locked_at: null,
          credits_start: 10000,
          selections: [
            {
              sportSlug: "soccer",
              stake: 400,
              odds: 2,
              result: "win",
              marketOdds: [2, 2],
            },
            {
              sportSlug: "basketball",
              stake: 300,
              odds: 2,
              result: "lose",
              marketOdds: [2, 2],
            },
          ],
        },
      ],
      { currentUserId: "u1", sportSlug: "soccer" },
    );

    expect(result.mode).toBe("net");
    expect(result.rows[0]?.currentScore).toBe(400);
    expect(result.rows[0]?.selectionsCount).toBe(1);
    expect(result.myRange.currentRank).toBe(1);
    expect(result.myRange.bestRank).toBe(1);
    expect(result.myRange.worstRank).toBe(1);
  });
});
