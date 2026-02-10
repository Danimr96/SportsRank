from __future__ import annotations

from datetime import date

from tools.odds_generator.featured_selector import (
    FeaturedEventCandidate,
    select_featured_events,
)


def _candidate(
    event_id: str,
    *,
    sport_slug: str,
    league: str,
    bucket: str,
) -> FeaturedEventCandidate:
    return FeaturedEventCandidate(
        id=event_id,
        sport_slug=sport_slug,
        league=league,
        start_time="2026-02-12T18:00:00Z",
        home=f"{event_id}-home",
        away=f"{event_id}-away",
        bucket=bucket,
    )


def _featured_config() -> dict:
    return {
        "soccer": {
            "la_liga": {
                "league_keywords": ["la liga", "spain"],
                "quotas": {"today": 1, "tomorrow": 1, "week_rest": 1},
            },
            "premier_league": {
                "league_keywords": ["premier league", "epl", "england"],
                "quotas": {"today": 1, "tomorrow": 1, "week_rest": 1},
            },
        },
        "basketball": {
            "nba": {
                "league_keywords": ["nba"],
                "quotas": {"today": 1, "tomorrow": 1, "week_rest": 1},
            }
        },
        "others": {"quotas": {"today": 1, "tomorrow": 1, "week_rest": 1}},
    }


def test_select_featured_events_respects_buckets_and_football_leagues() -> None:
    candidates = [
        _candidate("la-today-1", sport_slug="soccer", league="La Liga", bucket="today"),
        _candidate("la-today-2", sport_slug="soccer", league="La Liga", bucket="today"),
        _candidate("pl-today-1", sport_slug="soccer", league="Premier League", bucket="today"),
        _candidate("pl-today-2", sport_slug="soccer", league="Premier League", bucket="today"),
        _candidate("la-tomorrow-1", sport_slug="soccer", league="La Liga", bucket="tomorrow"),
        _candidate("pl-tomorrow-1", sport_slug="soccer", league="Premier League", bucket="tomorrow"),
        _candidate("la-week-1", sport_slug="soccer", league="La Liga", bucket="week_rest"),
        _candidate("pl-week-1", sport_slug="soccer", league="Premier League", bucket="week_rest"),
        _candidate("nba-today-1", sport_slug="basketball", league="NBA", bucket="today"),
        _candidate("nba-tomorrow-1", sport_slug="basketball", league="NBA", bucket="tomorrow"),
        _candidate("nba-week-1", sport_slug="basketball", league="NBA", bucket="week_rest"),
        _candidate("other-today-1", sport_slug="golf", league="PGA Tour", bucket="today"),
        _candidate("other-tomorrow-1", sport_slug="motor", league="Formula One", bucket="tomorrow"),
        _candidate("other-week-1", sport_slug="combat", league="UFC", bucket="week_rest"),
    ]

    selected, warnings, rationale = select_featured_events(
        candidates=candidates,
        featured_date=date(2026, 2, 10),
        seed="FEATURED|2026-02-10|round-1",
        config=_featured_config(),
        use_openai=False,
        openai_api_key=None,
    )

    assert rationale is None
    assert warnings == []
    assert len(selected) == 12
    ids = [item.event_id for item in selected]
    assert len(ids) == len(set(ids))

    by_bucket_league = {(item.bucket, item.league) for item in selected}
    assert ("today", "la_liga") in by_bucket_league
    assert ("today", "premier_league") in by_bucket_league
    assert ("tomorrow", "la_liga") in by_bucket_league
    assert ("tomorrow", "premier_league") in by_bucket_league
    assert ("week_rest", "la_liga") in by_bucket_league
    assert ("week_rest", "premier_league") in by_bucket_league


def test_select_featured_events_fallback_is_seed_deterministic() -> None:
    candidates = [
        _candidate("la-today-a", sport_slug="soccer", league="La Liga", bucket="today"),
        _candidate("la-today-b", sport_slug="soccer", league="La Liga", bucket="today"),
        _candidate("pl-today-a", sport_slug="soccer", league="Premier League", bucket="today"),
        _candidate("pl-today-b", sport_slug="soccer", league="Premier League", bucket="today"),
    ]
    config = {
        "soccer": {
            "la_liga": {"league_keywords": ["la liga"], "quotas": {"today": 1, "tomorrow": 0, "week_rest": 0}},
            "premier_league": {"league_keywords": ["premier league"], "quotas": {"today": 1, "tomorrow": 0, "week_rest": 0}},
        },
        "basketball": {"nba": {"league_keywords": ["nba"], "quotas": {"today": 0, "tomorrow": 0, "week_rest": 0}}},
        "others": {"quotas": {"today": 0, "tomorrow": 0, "week_rest": 0}},
    }

    first, _, _ = select_featured_events(
        candidates=candidates,
        featured_date=date(2026, 2, 10),
        seed="FEATURED|2026-02-10|r1",
        config=config,
        use_openai=False,
        openai_api_key=None,
    )
    second, _, _ = select_featured_events(
        candidates=candidates,
        featured_date=date(2026, 2, 10),
        seed="FEATURED|2026-02-10|r1",
        config=config,
        use_openai=False,
        openai_api_key=None,
    )
    different_seed, _, _ = select_featured_events(
        candidates=candidates,
        featured_date=date(2026, 2, 10),
        seed="FEATURED|2026-02-11|r1",
        config=config,
        use_openai=False,
        openai_api_key=None,
    )

    assert [item.event_id for item in first] == [item.event_id for item in second]
    assert [item.event_id for item in first] != [item.event_id for item in different_seed]
