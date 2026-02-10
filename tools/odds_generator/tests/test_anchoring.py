from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from tools.odds_generator.anchoring import anchor_date_for_mode


def _utc_from_local(
    year: int,
    month: int,
    day: int,
    hour: int = 10,
    minute: int = 0,
) -> datetime:
    local = datetime(year, month, day, hour, minute, tzinfo=ZoneInfo("Europe/Madrid"))
    return local.astimezone(timezone.utc)


def test_weekly_anchor_wednesday_is_today() -> None:
    now_utc = _utc_from_local(2026, 2, 11, 12, 0)  # Wednesday
    anchor = anchor_date_for_mode("weekly", now_utc, tz_name="Europe/Madrid")
    assert anchor.isoformat() == "2026-02-11"


def test_weekly_anchor_friday_is_thursday() -> None:
    now_utc = _utc_from_local(2026, 2, 13, 12, 0)  # Friday
    anchor = anchor_date_for_mode("weekly", now_utc, tz_name="Europe/Madrid")
    assert anchor.isoformat() == "2026-02-12"
