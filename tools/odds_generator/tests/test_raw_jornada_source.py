from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from tools.odds_generator.cli import (
    RawSnapshot,
    build_candidates_from_raw_snapshots,
    load_raw_snapshots_for_jornada,
)
from tools.odds_generator.models import (
    GeneratorLimits,
    SportConfigEntry,
    SportsMapConfig,
    parse_utc_iso,
)


def _write_raw_snapshot(
    path: Path,
    *,
    fetched_at: str,
    sport_key: str,
    response: list[dict],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetched_at": fetched_at,
        "sport_key": sport_key,
        "request_context": {},
        "response": response,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def _make_event(odds_home: float, odds_away: float) -> dict:
    return {
        "id": "event-1",
        "commence_time": "2026-02-10T18:00:00Z",
        "home_team": "Team A",
        "away_team": "Team B",
        "sport_title": "Premier League",
        "bookmakers": [
            {
                "key": "book-a",
                "markets": [
                    {
                        "key": "h2h",
                        "outcomes": [
                            {"name": "Team A", "price": odds_home},
                            {"name": "Team B", "price": odds_away},
                        ],
                    },
                ],
            },
        ],
    }


def test_load_raw_snapshots_for_jornada_filters_previous_week(tmp_path: Path) -> None:
    raw_dir = tmp_path / "raw"

    _write_raw_snapshot(
        raw_dir / "daily" / "old.json",
        fetched_at="2026-02-08T12:00:00Z",  # Sunday
        sport_key="soccer_epl",
        response=[],
    )
    _write_raw_snapshot(
        raw_dir / "daily" / "monday.json",
        fetched_at="2026-02-09T12:00:00Z",  # Monday
        sport_key="soccer_epl",
        response=[],
    )
    _write_raw_snapshot(
        raw_dir / "weekly" / "tuesday.json",
        fetched_at="2026-02-10T12:00:00Z",  # Tuesday
        sport_key="soccer_epl",
        response=[],
    )

    local_now = datetime(2026, 2, 10, 13, 0, tzinfo=ZoneInfo("Europe/Madrid"))
    now_utc = local_now.astimezone(timezone.utc)
    snapshots, warnings = load_raw_snapshots_for_jornada(
        raw_dir=raw_dir,
        now_utc=now_utc,
        tz_name="Europe/Madrid",
    )

    assert warnings == []
    assert len(snapshots) == 2
    assert [item.sport_key for item in snapshots] == ["soccer_epl", "soccer_epl"]
    assert snapshots[0].fetched_at.isoformat().endswith("+00:00")


def test_build_candidates_from_raw_snapshots_uses_latest_snapshot() -> None:
    config = SportsMapConfig(
        sports={
            "soccer_epl": SportConfigEntry(
                app_slug="soccer",
                league="Premier League",
                allow_daily=True,
                allow_weekly=True,
            ),
        },
        limits=GeneratorLimits(),
    )

    older = RawSnapshot(
        fetched_at=parse_utc_iso("2026-02-10T08:00:00Z") or datetime.now(timezone.utc),
        sport_key="soccer_epl",
        response_payload=[_make_event(2.0, 1.8)],
    )
    newer = RawSnapshot(
        fetched_at=parse_utc_iso("2026-02-10T10:00:00Z") or datetime.now(timezone.utc),
        sport_key="soccer_epl",
        response_payload=[_make_event(2.3, 1.7)],
    )

    start_dt = parse_utc_iso("2026-02-10T00:00:00Z")
    end_dt = parse_utc_iso("2026-02-11T00:00:00Z")
    assert start_dt is not None
    assert end_dt is not None

    candidates, warnings = build_candidates_from_raw_snapshots(
        snapshots=[older, newer],
        mode="daily",
        config=config,
        markets=["h2h"],
        start_dt=start_dt,
        end_dt=end_dt,
    )

    assert warnings == []
    assert len(candidates) == 1
    assert candidates[0].candidate_id == "soccer_epl:event-1:h2h"
    assert candidates[0].options[0].odds == 2.3
    assert candidates[0].options[1].odds == 1.7
