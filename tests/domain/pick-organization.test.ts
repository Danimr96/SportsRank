import { describe, expect, it } from "vitest";
import {
  getPickBoardType,
  organizePicksByHierarchy,
  organizePicksBySportHierarchy,
} from "@/lib/domain/pick-organization";
import type { PickWithOptions } from "@/lib/types";

function makePick(input: {
  id: string;
  sport: { id: string; slug: string; name: string };
  title: string;
  orderIndex: number;
  league: string;
  event: string;
  startTime: string;
}): PickWithOptions {
  return {
    id: input.id,
    round_id: "r1",
    sport_id: input.sport.id,
    title: input.title,
    description: null,
    order_index: input.orderIndex,
    is_required: false,
    metadata: {
      league: input.league,
      event: input.event,
      start_time: input.startTime,
    },
    sport: {
      id: input.sport.id,
      slug: input.sport.slug,
      name: input.sport.name,
      icon: null,
    },
    options: [
      { id: `${input.id}-o1`, pick_id: input.id, label: "A", odds: 2, result: "pending" },
      { id: `${input.id}-o2`, pick_id: input.id, label: "B", odds: 2.1, result: "pending" },
    ],
  };
}

describe("pick organization", () => {
  it("detects board types by title prefix", () => {
    expect(getPickBoardType("[DAILY] match")).toBe("daily");
    expect(getPickBoardType("[WEEK] match")).toBe("weekly");
    expect(getPickBoardType("no prefix")).toBe("other");
  });

  it("groups by board -> sport -> country -> league -> event", () => {
    const picks: PickWithOptions[] = [
      makePick({
        id: "p1",
        sport: { id: "s1", slug: "soccer", name: "Soccer" },
        title: "[DAILY] Real Madrid vs Barca · h2h",
        orderIndex: 0,
        league: "La Liga",
        event: "Real Madrid vs Barca",
        startTime: "2026-02-10T18:00:00.000Z",
      }),
      makePick({
        id: "p2",
        sport: { id: "s1", slug: "soccer", name: "Soccer" },
        title: "[DAILY] Real Madrid vs Barca · totals",
        orderIndex: 1,
        league: "La Liga",
        event: "Real Madrid vs Barca",
        startTime: "2026-02-10T18:00:00.000Z",
      }),
      makePick({
        id: "p3",
        sport: { id: "s2", slug: "basketball", name: "Basketball" },
        title: "[WEEK] Lakers vs Celtics · h2h",
        orderIndex: 2,
        league: "NBA",
        event: "Lakers vs Celtics",
        startTime: "2026-02-12T01:00:00.000Z",
      }),
    ];

    const boards = organizePicksByHierarchy(picks);

    expect(boards).toHaveLength(2);
    const dailyBoard = boards[0];
    const weeklyBoard = boards[1];
    expect(dailyBoard).toBeDefined();
    expect(weeklyBoard).toBeDefined();
    if (!dailyBoard || !weeklyBoard) {
      return;
    }

    expect(dailyBoard.boardType).toBe("daily");
    const dailySport = dailyBoard.sports[0];
    expect(dailySport).toBeDefined();
    if (!dailySport) {
      return;
    }
    expect(dailySport.displayName).toBe("Football");

    const dailyCountry = dailySport.countries[0];
    expect(dailyCountry).toBeDefined();
    if (!dailyCountry) {
      return;
    }
    expect(dailyCountry.countryName).toBe("Spain");

    const dailyLeague = dailyCountry.leagues[0];
    expect(dailyLeague).toBeDefined();
    if (!dailyLeague) {
      return;
    }
    expect(dailyLeague.leagueName).toBe("La Liga");
    expect(dailyLeague.events).toHaveLength(1);
    expect(dailyLeague.events[0]?.picks).toHaveLength(2);

    expect(weeklyBoard.boardType).toBe("weekly");
    expect(weeklyBoard.sports[0]?.countries[0]?.countryName).toBe("USA");
  });

  it("groups by sport and nests daily/weekly inside each sport", () => {
    const picks: PickWithOptions[] = [
      makePick({
        id: "p1",
        sport: { id: "s1", slug: "soccer", name: "Soccer" },
        title: "[DAILY] Real Madrid vs Barca · h2h",
        orderIndex: 0,
        league: "La Liga",
        event: "Real Madrid vs Barca",
        startTime: "2026-02-10T18:00:00.000Z",
      }),
      makePick({
        id: "p2",
        sport: { id: "s1", slug: "soccer", name: "Soccer" },
        title: "[WEEK] Real Madrid vs Barca · totals",
        orderIndex: 1,
        league: "La Liga",
        event: "Real Madrid vs Barca",
        startTime: "2026-02-10T18:00:00.000Z",
      }),
      makePick({
        id: "p3",
        sport: { id: "s2", slug: "basketball", name: "Basketball" },
        title: "[WEEK] Lakers vs Celtics · h2h",
        orderIndex: 2,
        league: "NBA",
        event: "Lakers vs Celtics",
        startTime: "2026-02-12T01:00:00.000Z",
      }),
    ];

    const sports = organizePicksBySportHierarchy(picks);
    expect(sports).toHaveLength(2);
    expect(sports[0]?.displayName).toBe("Football");
    expect(sports[0]?.boards.map((board) => board.boardType)).toEqual(["daily", "weekly"]);
    expect(sports[0]?.boards[0]?.countries[0]?.countryName).toBe("Spain");
    expect(sports[0]?.boards[1]?.countries[0]?.leagues[0]?.events[0]?.picks).toHaveLength(1);
  });
});
