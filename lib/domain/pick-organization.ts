import { getPickStartTime } from "@/lib/domain/validation";
import { compareSportGroups, getSportDisplayName } from "@/lib/sports";
import type { PickWithOptions } from "@/lib/types";

export type PickBoardType = "daily" | "weekly" | "other";

export interface OrganizedEventGroup {
  eventKey: string;
  eventName: string;
  startTime: Date | null;
  picks: PickWithOptions[];
}

export interface OrganizedLeagueGroup {
  leagueName: string;
  events: OrganizedEventGroup[];
  picksCount: number;
}

export interface OrganizedCountryGroup {
  countryName: string;
  leagues: OrganizedLeagueGroup[];
  picksCount: number;
}

export interface OrganizedSportGroup {
  sportId: string;
  sportSlug: string;
  sportName: string;
  displayName: string;
  countries: OrganizedCountryGroup[];
  picksCount: number;
}

export interface OrganizedBoardGroup {
  boardType: PickBoardType;
  label: string;
  sports: OrganizedSportGroup[];
  picksCount: number;
}

export interface OrganizedSportBoardGroup {
  boardType: PickBoardType;
  label: string;
  countries: OrganizedCountryGroup[];
  picksCount: number;
}

export interface OrganizedSportHierarchyGroup {
  sportId: string;
  sportSlug: string;
  sportName: string;
  displayName: string;
  boards: OrganizedSportBoardGroup[];
  picksCount: number;
}

interface EventAccumulator {
  eventKey: string;
  eventName: string;
  startTime: Date | null;
  picks: PickWithOptions[];
}

interface LeagueAccumulator {
  leagueName: string;
  events: Map<string, EventAccumulator>;
  picksCount: number;
}

interface CountryAccumulator {
  countryName: string;
  leagues: Map<string, LeagueAccumulator>;
  picksCount: number;
}

interface SportAccumulator {
  sportId: string;
  sportSlug: string;
  sportName: string;
  displayName: string;
  countries: Map<string, CountryAccumulator>;
  picksCount: number;
}

interface BoardAccumulator {
  boardType: PickBoardType;
  label: string;
  sports: Map<string, SportAccumulator>;
  picksCount: number;
}

const BOARD_ORDER: PickBoardType[] = ["daily", "weekly", "other"];

const COUNTRY_HINTS: Array<{ keyword: string; country: string }> = [
  { keyword: "epl", country: "England" },
  { keyword: "premier league", country: "England" },
  { keyword: "la liga", country: "Spain" },
  { keyword: "serie a", country: "Italy" },
  { keyword: "bundesliga", country: "Germany" },
  { keyword: "ligue 1", country: "France" },
  { keyword: "mls", country: "USA" },
  { keyword: "nba", country: "USA" },
  { keyword: "ncaab", country: "USA" },
  { keyword: "nfl", country: "USA" },
  { keyword: "nhl", country: "USA" },
  { keyword: "euroleague", country: "Europe" },
  { keyword: "uefa", country: "Europe" },
  { keyword: "champions league", country: "Europe" },
  { keyword: "atp", country: "International" },
  { keyword: "wta", country: "International" },
  { keyword: "formula 1", country: "International" },
  { keyword: "f1", country: "International" },
  { keyword: "masters", country: "International" },
  { keyword: "pga", country: "International" },
];

function getMetadataString(pick: PickWithOptions, key: string): string | null {
  const rawValue = pick.metadata?.[key];
  if (typeof rawValue !== "string") {
    return null;
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

export function getPickBoardType(title: string): PickBoardType {
  const normalized = title.toUpperCase();
  if (normalized.startsWith("[DAILY]")) {
    return "daily";
  }

  if (normalized.startsWith("[WEEK]")) {
    return "weekly";
  }

  return "other";
}

function boardLabel(boardType: PickBoardType): string {
  if (boardType === "daily") {
    return "Daily Picks";
  }

  if (boardType === "weekly") {
    return "Weekly Picks";
  }

  return "Other Picks";
}

function inferCountryFromLeague(
  leagueName: string,
  sportSlug: string,
): string {
  const normalized = leagueName.toLowerCase();

  for (const hint of COUNTRY_HINTS) {
    if (normalized.includes(hint.keyword)) {
      return hint.country;
    }
  }

  if (sportSlug === "soccer") {
    return "International";
  }

  return "General";
}

function getPickCountry(pick: PickWithOptions, leagueName: string): string {
  const explicitCountry = getMetadataString(pick, "country");
  if (explicitCountry) {
    return explicitCountry;
  }

  return inferCountryFromLeague(leagueName, pick.sport.slug);
}

function getPickLeague(pick: PickWithOptions): string {
  return getMetadataString(pick, "league") ?? "Unknown league";
}

function getPickEvent(pick: PickWithOptions): string {
  const explicitEvent = getMetadataString(pick, "event");
  if (explicitEvent) {
    return explicitEvent;
  }

  return pick.title.replace(/^\[(DAILY|WEEK)\]\s*/i, "").trim();
}

function createBoard(boardType: PickBoardType): BoardAccumulator {
  return {
    boardType,
    label: boardLabel(boardType),
    sports: new Map(),
    picksCount: 0,
  };
}

function sortCountryName(left: string, right: string): number {
  if (left === "General" && right !== "General") {
    return 1;
  }

  if (right === "General" && left !== "General") {
    return -1;
  }

  return left.localeCompare(right);
}

function sortEvents(left: EventAccumulator, right: EventAccumulator): number {
  if (left.startTime && right.startTime) {
    if (left.startTime.getTime() !== right.startTime.getTime()) {
      return left.startTime.getTime() - right.startTime.getTime();
    }
  } else if (left.startTime && !right.startTime) {
    return -1;
  } else if (!left.startTime && right.startTime) {
    return 1;
  }

  return left.eventName.localeCompare(right.eventName);
}

export function organizePicksByHierarchy(
  picks: PickWithOptions[],
): OrganizedBoardGroup[] {
  const boardMap = new Map<PickBoardType, BoardAccumulator>();

  for (const pick of picks) {
    const boardType = getPickBoardType(pick.title);
    const leagueName = getPickLeague(pick);
    const countryName = getPickCountry(pick, leagueName);
    const eventName = getPickEvent(pick);
    const startTime = getPickStartTime(pick);
    const eventKey = `${eventName.toLowerCase()}|${startTime?.toISOString() ?? "none"}`;

    let board = boardMap.get(boardType);
    if (!board) {
      board = createBoard(boardType);
      boardMap.set(boardType, board);
    }

    let sport = board.sports.get(pick.sport.id);
    if (!sport) {
      sport = {
        sportId: pick.sport.id,
        sportSlug: pick.sport.slug,
        sportName: pick.sport.name,
        displayName: getSportDisplayName(pick.sport),
        countries: new Map(),
        picksCount: 0,
      };
      board.sports.set(pick.sport.id, sport);
    }

    let country = sport.countries.get(countryName);
    if (!country) {
      country = {
        countryName,
        leagues: new Map(),
        picksCount: 0,
      };
      sport.countries.set(countryName, country);
    }

    let league = country.leagues.get(leagueName);
    if (!league) {
      league = {
        leagueName,
        events: new Map(),
        picksCount: 0,
      };
      country.leagues.set(leagueName, league);
    }

    let event = league.events.get(eventKey);
    if (!event) {
      event = {
        eventKey,
        eventName,
        startTime,
        picks: [],
      };
      league.events.set(eventKey, event);
    }

    event.picks.push(pick);
    event.picks.sort((left, right) => left.order_index - right.order_index);

    league.picksCount += 1;
    country.picksCount += 1;
    sport.picksCount += 1;
    board.picksCount += 1;
  }

  const orderedBoards: OrganizedBoardGroup[] = [];
  for (const boardType of BOARD_ORDER) {
    const board = boardMap.get(boardType);
    if (!board || board.picksCount === 0) {
      continue;
    }

    const sports = Array.from(board.sports.values())
      .sort((left, right) =>
        compareSportGroups(
          { slug: left.sportSlug, name: left.sportName },
          { slug: right.sportSlug, name: right.sportName },
        ),
      )
      .map<OrganizedSportGroup>((sport) => ({
        sportId: sport.sportId,
        sportSlug: sport.sportSlug,
        sportName: sport.sportName,
        displayName: sport.displayName,
        picksCount: sport.picksCount,
        countries: Array.from(sport.countries.values())
          .sort((left, right) => sortCountryName(left.countryName, right.countryName))
          .map<OrganizedCountryGroup>((country) => ({
            countryName: country.countryName,
            picksCount: country.picksCount,
            leagues: Array.from(country.leagues.values())
              .sort((left, right) => left.leagueName.localeCompare(right.leagueName))
              .map<OrganizedLeagueGroup>((league) => ({
                leagueName: league.leagueName,
                picksCount: league.picksCount,
                events: Array.from(league.events.values())
                  .sort(sortEvents)
                  .map<OrganizedEventGroup>((event) => ({
                    eventKey: event.eventKey,
                    eventName: event.eventName,
                    startTime: event.startTime,
                    picks: event.picks,
                  })),
              })),
          })),
      }));

    orderedBoards.push({
      boardType,
      label: board.label,
      picksCount: board.picksCount,
      sports,
    });
  }

  return orderedBoards;
}

export function organizePicksBySportHierarchy(
  picks: PickWithOptions[],
): OrganizedSportHierarchyGroup[] {
  const boards = organizePicksByHierarchy(picks);

  const sportMap = new Map<
    string,
    {
      sportId: string;
      sportSlug: string;
      sportName: string;
      displayName: string;
      boards: Map<PickBoardType, OrganizedSportBoardGroup>;
      picksCount: number;
    }
  >();

  for (const board of boards) {
    for (const sport of board.sports) {
      let sportEntry = sportMap.get(sport.sportId);
      if (!sportEntry) {
        sportEntry = {
          sportId: sport.sportId,
          sportSlug: sport.sportSlug,
          sportName: sport.sportName,
          displayName: sport.displayName,
          boards: new Map(),
          picksCount: 0,
        };
        sportMap.set(sport.sportId, sportEntry);
      }

      sportEntry.boards.set(board.boardType, {
        boardType: board.boardType,
        label: board.label,
        countries: sport.countries,
        picksCount: sport.picksCount,
      });
      sportEntry.picksCount += sport.picksCount;
    }
  }

  return Array.from(sportMap.values())
    .sort((left, right) =>
      compareSportGroups(
        { slug: left.sportSlug, name: left.sportName },
        { slug: right.sportSlug, name: right.sportName },
      ),
    )
    .map<OrganizedSportHierarchyGroup>((sport) => ({
      sportId: sport.sportId,
      sportSlug: sport.sportSlug,
      sportName: sport.sportName,
      displayName: sport.displayName,
      picksCount: sport.picksCount,
      boards: BOARD_ORDER.flatMap((boardType) => {
        const board = sport.boards.get(boardType);
        return board ? [board] : [];
      }),
    }));
}
