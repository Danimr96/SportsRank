import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "@/lib/domain/ranking";

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
