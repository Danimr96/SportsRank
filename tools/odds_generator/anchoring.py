from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from .models import Mode


def get_local_now(now_utc: datetime, tz_name: str = "Europe/Madrid") -> datetime:
    return now_utc.astimezone(ZoneInfo(tz_name))


def daily_anchor_date(local_now: datetime) -> date:
    return local_now.date()


def weekly_anchor_date(local_now: datetime) -> date:
    weekday = local_now.weekday()
    if weekday <= 2:  # Monday/Tuesday/Wednesday
        return local_now.date()

    # Thursday anchor of the same local week.
    days_since_thursday = weekday - 3
    return (local_now - timedelta(days=days_since_thursday)).date()


def anchor_date_for_mode(
    mode: Mode,
    now_utc: datetime,
    tz_name: str = "Europe/Madrid",
) -> date:
    local_now = get_local_now(now_utc, tz_name=tz_name)
    if mode == "daily":
        return daily_anchor_date(local_now)
    return weekly_anchor_date(local_now)


def build_seed(mode: Mode, anchor_date: date, round_id: str) -> str:
    prefix = "DAILY" if mode == "daily" else "WEEKLY"
    return f"{prefix}|{anchor_date.isoformat()}|{round_id}"
