import { describe, expect, it } from "vitest";
import {
  parseImportPayload,
  summarizePicksPayload,
  validateGeneratedPicks,
} from "@/lib/ingestion/validation";

const validJson = JSON.stringify({
  round_id: "123e4567-e89b-42d3-a456-426614174000",
  picks: [
    {
      sport_slug: "soccer",
      title: "Barcelona vs Real Madrid · moneyline",
      description: "Classic",
      order_index: 0,
      options: [
        { label: "Barcelona", odds: 1.9 },
        { label: "Real Madrid", odds: 2.2 },
      ],
      metadata: {
        league: "LaLiga",
        event: "Barcelona vs Real Madrid",
        start_time: "2026-02-09T18:00:00.000Z",
      },
    },
    {
      sport_slug: "basketball",
      title: "Lakers vs Celtics · totals",
      description: "Prime time",
      order_index: 1,
      options: [
        { label: "Over", odds: 1.8 },
        { label: "Under", odds: 2.0 },
      ],
      metadata: {
        league: "NBA",
        event: "Lakers vs Celtics",
        start_time: "2026-02-09T20:00:00.000Z",
      },
    },
  ],
});

describe("parseImportPayload", () => {
  it("parses valid import payload", () => {
    const result = parseImportPayload(validJson);

    expect(result.errors).toEqual([]);
    expect(result.payload?.round_id).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(result.payload?.picks).toHaveLength(2);
  });

  it("rejects invalid JSON", () => {
    const result = parseImportPayload("{not-json}");

    expect(result.payload).toBeNull();
    expect(result.errors).toContain("Payload is not valid JSON.");
  });

  it("rejects missing required fields", () => {
    const result = parseImportPayload(
      JSON.stringify({
        round_id: "123e4567-e89b-42d3-a456-426614174000",
        picks: [
          {
            sport_slug: "",
            title: "",
            order_index: "x",
            options: [{ label: "Only one", odds: 1.5 }],
            metadata: {
              league: "",
              event: "",
              start_time: "not-a-date",
            },
          },
        ],
      }),
    );

    expect(result.payload).toBeNull();
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

describe("summarizePicksPayload", () => {
  it("returns counts and min/max odds", () => {
    const parsed = parseImportPayload(validJson);
    expect(parsed.payload).not.toBeNull();

    const summary = summarizePicksPayload(parsed.payload!);

    expect(summary.total_picks).toBe(2);
    expect(summary.counts_by_sport).toEqual({ soccer: 1, basketball: 1 });
    expect(summary.min_odds).toBe(1.8);
    expect(summary.max_odds).toBe(2.2);
  });
});

describe("validateGeneratedPicks", () => {
  it("flags warnings for suspicious odds", () => {
    const parsed = parseImportPayload(validJson);
    expect(parsed.payload).not.toBeNull();

    const payload = {
      ...parsed.payload!,
      picks: parsed.payload!.picks.map((pick, index) => ({
        ...pick,
        options:
          index === 0
            ? [
                { label: "Very low", odds: 1.01 },
                { label: "Very high", odds: 25 },
              ]
            : pick.options,
      })),
    };

    const result = validateGeneratedPicks(payload);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
