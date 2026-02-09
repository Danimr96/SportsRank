import { describe, expect, it } from "vitest";
import { buildPickInsertPlan } from "@/lib/ingestion/plan";
import { parseImportPayload } from "@/lib/ingestion/validation";

const validPayload = parseImportPayload(
  JSON.stringify({
    round_id: "123e4567-e89b-42d3-a456-426614174000",
    picks: [
      {
        sport_slug: "soccer",
        title: "Pick 1",
        description: "desc",
        order_index: 0,
        options: [
          { label: "A", odds: 1.8 },
          { label: "B", odds: 2.1 },
        ],
        metadata: {
          league: "League",
          event: "Event",
          start_time: "2026-02-09T18:00:00.000Z",
        },
      },
    ],
  }),
).payload!;

function createDeterministicIdFactory() {
  let counter = 0;
  return () => {
    counter += 1;
    return `id-${counter}`;
  };
}

describe("buildPickInsertPlan", () => {
  it("builds pick and option rows with stable ids", () => {
    const result = buildPickInsertPlan(
      validPayload,
      { soccer: "sport-1" },
      createDeterministicIdFactory(),
    );

    expect(result.errors).toEqual([]);
    expect(result.pickRows).toEqual([
      {
        id: "id-1",
        round_id: "123e4567-e89b-42d3-a456-426614174000",
        sport_id: "sport-1",
        title: "Pick 1",
        description: "desc",
        order_index: 0,
        is_required: true,
        metadata: {
          league: "League",
          event: "Event",
          start_time: "2026-02-09T18:00:00.000Z",
        },
      },
    ]);

    expect(result.optionRows).toEqual([
      {
        id: "id-2",
        pick_id: "id-1",
        label: "A",
        odds: 1.8,
        result: "pending",
      },
      {
        id: "id-3",
        pick_id: "id-1",
        label: "B",
        odds: 2.1,
        result: "pending",
      },
    ]);
  });

  it("returns errors when sport slug is unknown", () => {
    const result = buildPickInsertPlan(
      validPayload,
      {},
      createDeterministicIdFactory(),
    );

    expect(result.pickRows).toHaveLength(0);
    expect(result.optionRows).toHaveLength(0);
    expect(result.errors).toContain("Unknown sport slug: soccer");
  });
});
