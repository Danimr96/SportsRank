import { describe, expect, it } from "vitest";
import { transformRawOddsToPicks } from "@/lib/ingestion/transform";

describe("transformRawOddsToPicks", () => {
  it("maps provider events and odds into import payload", () => {
    const payload = transformRawOddsToPicks({
      round_id: "123e4567-e89b-42d3-a456-426614174000",
      events: [
        {
          id: "event-1",
          sport_slug: "soccer",
          league: "UEFA",
          event: "Team A vs Team B",
          start_time: "2026-02-09T18:00:00.000Z",
        },
      ],
      odds: [
        {
          event_id: "event-1",
          market: "moneyline",
          options: [
            { label: "Team A", odds: 1.9 },
            { label: "Team B", odds: 2.1 },
          ],
        },
      ],
    });

    expect(payload.round_id).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(payload.picks).toHaveLength(1);
    expect(payload.picks[0]?.metadata.league).toBe("UEFA");
    expect(payload.picks[0]?.options).toHaveLength(2);
  });
});
