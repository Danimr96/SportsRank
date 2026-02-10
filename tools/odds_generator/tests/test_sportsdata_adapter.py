from __future__ import annotations

from tools.odds_generator.sportsdata_adapter import (
    american_to_decimal,
    sportsdata_game_odds_to_raw_events,
    sportsdata_scores_row_to_event,
)


def test_american_to_decimal_conversion() -> None:
    assert american_to_decimal(150) == 2.5
    assert round(american_to_decimal(-200) or 0, 3) == 1.5
    assert american_to_decimal(0) is None
    assert american_to_decimal("bad") is None


def test_scores_row_to_event_mapping() -> None:
    row = {
        "GameID": 123,
        "DateTimeUTC": "2026-02-10T21:00:00Z",
        "HomeTeam": "NYK",
        "AwayTeam": "BOS",
        "Status": "Scheduled",
    }
    event = sportsdata_scores_row_to_event(
        row=row,
        sport_slug="basketball",
        fallback_league="NBA",
        provider_sport="nba",
    )
    assert event is not None
    assert event.provider_event_id == "123"
    assert event.start_time == "2026-02-10T21:00:00Z"
    assert event.league == "NBA"
    assert event.home == "NYK"
    assert event.away == "BOS"


def test_game_odds_to_raw_events_builds_markets() -> None:
    odds_rows = [
        {
            "GameId": 456,
            "DateTime": "2026-02-10T21:00:00",
            "HomeTeamName": "NYK",
            "AwayTeamName": "BOS",
            "PregameOdds": [
                {
                    "Sportsbook": "BookA",
                    "HomeMoneyLine": -150,
                    "AwayMoneyLine": 130,
                    "OverUnder": 221.5,
                    "OverPayout": -110,
                    "UnderPayout": -110,
                    "HomePointSpread": -4.5,
                    "AwayPointSpread": 4.5,
                    "HomePointSpreadPayout": -105,
                    "AwayPointSpreadPayout": -115,
                }
            ],
        }
    ]
    scores_by_game_id = {
        "456": {
            "GameID": 456,
            "DateTimeUTC": "2026-02-10T21:00:00Z",
            "HomeTeam": "NYK",
            "AwayTeam": "BOS",
            "League": "NBA",
        },
    }

    raw_events = sportsdata_game_odds_to_raw_events(
        odds_rows=odds_rows,
        scores_by_game_id=scores_by_game_id,
        fallback_league="NBA",
    )

    assert len(raw_events) == 1
    event = raw_events[0]
    assert event["id"] == "456"
    assert event["commence_time"] == "2026-02-10T21:00:00Z"
    assert event["sport_title"] == "NBA"
    assert event["bookmakers"]
    first_market_keys = [market["key"] for market in event["bookmakers"][0]["markets"]]
    assert "h2h" in first_market_keys
    assert "totals" in first_market_keys
    assert "spreads" in first_market_keys

