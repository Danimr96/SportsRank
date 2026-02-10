from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any

from .models import EventModel, parse_utc_iso, to_utc_z


def american_to_decimal(value: Any) -> float | None:
    try:
        american = float(value)
    except (TypeError, ValueError):
        return None

    if american == 0:
        return None
    if american > 0:
        return 1 + (american / 100.0)
    return 1 + (100.0 / abs(american))


def _pick_string(payload: dict[str, Any], keys: Sequence[str]) -> str | None:
    for key in keys:
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _parse_datetime_to_utc(value: str | None) -> str | None:
    if not value:
        return None

    parsed = parse_utc_iso(value)
    if parsed is not None:
        return to_utc_z(parsed)

    try:
        naive = datetime.fromisoformat(value)
    except ValueError:
        return None

    return to_utc_z(naive.replace(tzinfo=timezone.utc))


def sportsdata_scores_row_to_event(
    *,
    row: dict[str, Any],
    sport_slug: str,
    fallback_league: str,
    provider_sport: str,
) -> EventModel | None:
    game_id = row.get("GameID")
    if game_id is None:
        game_id = row.get("GameId")
    if game_id is None:
        return None

    start_iso = _parse_datetime_to_utc(
        _pick_string(row, ("DateTimeUTC", "DateTime", "GameStartTime", "StartDate")),
    )
    if start_iso is None:
        return None

    home = _pick_string(row, ("HomeTeamName", "HomeTeam"))
    away = _pick_string(row, ("AwayTeamName", "AwayTeam"))
    participants = [team for team in (home, away) if team]

    league = _pick_string(
        row,
        ("League", "Competition", "CompetitionName", "SeasonName", "Name"),
    )
    if not league:
        league = fallback_league

    status_raw = _pick_string(row, ("GameStatus", "Status")) or "scheduled"
    status_normalized = status_raw.strip().lower()
    if "final" in status_normalized:
        status = "final"
    elif any(token in status_normalized for token in ("live", "progress", "in ")):
        status = "live"
    else:
        status = "scheduled"

    return EventModel(
        provider="sportsdata",
        provider_event_id=str(game_id),
        sport_slug=sport_slug,
        league=league,
        start_time=start_iso,
        home=home,
        away=away,
        status=status,
        participants=participants,
        metadata={
            "provider_sport": provider_sport,
            "season": row.get("Season"),
            "season_type": row.get("SeasonType"),
            "status_raw": status_raw,
        },
    )


def sportsdata_game_odds_to_raw_events(
    *,
    odds_rows: Sequence[dict[str, Any]],
    scores_by_game_id: dict[str, dict[str, Any]],
    fallback_league: str,
) -> list[dict[str, Any]]:
    normalized_events: list[dict[str, Any]] = []

    for row in odds_rows:
        game_id = row.get("GameId")
        if game_id is None:
            game_id = row.get("GameID")
        if game_id is None:
            continue
        game_key = str(game_id)

        score_row = scores_by_game_id.get(game_key, {})
        commence = _parse_datetime_to_utc(
            _pick_string(
                score_row if isinstance(score_row, dict) else row,
                ("DateTimeUTC", "DateTime", "GameStartTime", "StartDate"),
            ),
        ) or _parse_datetime_to_utc(
            _pick_string(row, ("DateTimeUTC", "DateTime", "GameStartTime", "StartDate")),
        )
        if commence is None:
            continue

        home_team = _pick_string(
            score_row if isinstance(score_row, dict) else row,
            ("HomeTeamName", "HomeTeam"),
        ) or _pick_string(row, ("HomeTeamName", "HomeTeam"))
        away_team = _pick_string(
            score_row if isinstance(score_row, dict) else row,
            ("AwayTeamName", "AwayTeam"),
        ) or _pick_string(row, ("AwayTeamName", "AwayTeam"))

        pregame_odds_raw = row.get("PregameOdds")
        if not isinstance(pregame_odds_raw, list):
            pregame_odds_raw = []

        by_sportsbook: dict[str, dict[str, Any]] = {}
        for odd in pregame_odds_raw:
            if not isinstance(odd, dict):
                continue
            if odd.get("Unlisted") is True:
                continue

            sportsbook = _pick_string(odd, ("Sportsbook", "SportsbookId")) or "sportsdata"
            # Keep the most recent value seen for each sportsbook.
            by_sportsbook[sportsbook] = odd

        bookmakers: list[dict[str, Any]] = []
        for sportsbook in sorted(by_sportsbook.keys()):
            odd = by_sportsbook[sportsbook]
            markets: list[dict[str, Any]] = []

            home_ml = american_to_decimal(odd.get("HomeMoneyLine"))
            away_ml = american_to_decimal(odd.get("AwayMoneyLine"))
            if home_ml and away_ml:
                markets.append(
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": home_team or "Home", "price": home_ml},
                            {"name": away_team or "Away", "price": away_ml},
                        ],
                    },
                )

            over_under = odd.get("OverUnder")
            over_payout = american_to_decimal(odd.get("OverPayout"))
            under_payout = american_to_decimal(odd.get("UnderPayout"))
            if over_under is not None and over_payout and under_payout:
                markets.append(
                    {
                        "key": "totals",
                        "outcomes": [
                            {"name": "Over", "price": over_payout, "point": over_under},
                            {"name": "Under", "price": under_payout, "point": over_under},
                        ],
                    },
                )

            away_spread = odd.get("AwayPointSpread")
            home_spread = odd.get("HomePointSpread")
            away_spread_payout = american_to_decimal(odd.get("AwayPointSpreadPayout"))
            home_spread_payout = american_to_decimal(odd.get("HomePointSpreadPayout"))
            if (
                away_spread is not None
                and home_spread is not None
                and away_spread_payout
                and home_spread_payout
            ):
                markets.append(
                    {
                        "key": "spreads",
                        "outcomes": [
                            {
                                "name": away_team or "Away",
                                "price": away_spread_payout,
                                "point": away_spread,
                            },
                            {
                                "name": home_team or "Home",
                                "price": home_spread_payout,
                                "point": home_spread,
                            },
                        ],
                    },
                )

            if markets:
                bookmakers.append({"key": sportsbook.lower().replace(" ", "-"), "markets": markets})

        league = _pick_string(
            score_row if isinstance(score_row, dict) else row,
            ("League", "Competition", "CompetitionName", "SeasonName", "Name"),
        )
        if not league:
            league = fallback_league

        normalized_events.append(
            {
                "id": game_key,
                "commence_time": commence,
                "home_team": home_team or "Home",
                "away_team": away_team or "Away",
                "sport_title": league,
                "bookmakers": bookmakers,
            },
        )

    return normalized_events

