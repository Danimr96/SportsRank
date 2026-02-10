from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .api_client import OddsApiClient, OddsApiClientError
from .models import EventModel, parse_utc_iso, to_utc_z


def build_week_window(
    now_utc: datetime,
    tz_name: str = "Europe/Madrid",
) -> tuple[datetime, datetime]:
    local_now = now_utc.astimezone(ZoneInfo(tz_name))
    local_start = datetime(
        local_now.year,
        local_now.month,
        local_now.day,
        0,
        0,
        0,
        tzinfo=local_now.tzinfo,
    )
    days_to_sunday = 6 - local_start.weekday()
    local_end = local_start + timedelta(days=days_to_sunday, hours=23, minutes=59, seconds=59)
    return local_start.astimezone(ZoneInfo("UTC")), local_end.astimezone(ZoneInfo("UTC"))


def _event_status(raw_event: dict) -> str:
    raw_status = raw_event.get("status")
    if isinstance(raw_status, str) and raw_status.strip():
        lowered = raw_status.strip().lower()
        if lowered in {"scheduled", "live", "final"}:
            return lowered

    if raw_event.get("completed") is True:
        return "final"
    return "scheduled"


def normalize_raw_event(
    *,
    raw_event: dict,
    sport_key: str,
    sport_slug: str,
    fallback_league: str,
) -> EventModel | None:
    provider_event_id = raw_event.get("id")
    commence_time = raw_event.get("commence_time")

    if not isinstance(provider_event_id, str) or not provider_event_id.strip():
        return None
    if not isinstance(commence_time, str):
        return None

    parsed = parse_utc_iso(commence_time)
    if parsed is None:
        return None

    home_team = raw_event.get("home_team")
    away_team = raw_event.get("away_team")
    teams = raw_event.get("teams")

    participants: list[str] = []
    if isinstance(home_team, str) and home_team.strip():
        participants.append(home_team.strip())
    if isinstance(away_team, str) and away_team.strip():
        participants.append(away_team.strip())
    if not participants and isinstance(teams, list):
        participants = [str(team).strip() for team in teams if str(team).strip()]

    league = raw_event.get("sport_title")
    if not isinstance(league, str) or not league.strip():
        league = fallback_league

    metadata = {
        "sport_key": sport_key,
        "sport_title": raw_event.get("sport_title"),
    }

    return EventModel(
        provider="the_odds_api",
        provider_event_id=provider_event_id.strip(),
        sport_slug=sport_slug,
        league=league.strip(),
        start_time=to_utc_z(parsed),
        home=home_team.strip() if isinstance(home_team, str) and home_team.strip() else None,
        away=away_team.strip() if isinstance(away_team, str) and away_team.strip() else None,
        status=_event_status(raw_event),
        participants=participants,
        metadata=metadata,
    )


def fetch_calendar_events(
    *,
    client: OddsApiClient,
    sports: Sequence[tuple[str, str, str]],
    now_utc: datetime,
    tz_name: str = "Europe/Madrid",
) -> tuple[list[EventModel], list[str], tuple[datetime, datetime]]:
    warnings: list[str] = []
    events: list[EventModel] = []
    window_start, window_end = build_week_window(now_utc, tz_name=tz_name)

    for sport_key, app_slug, fallback_league in sports:
        try:
            payload, _headers = client.get_events(sport_key)
        except OddsApiClientError as error:
            warnings.append(f"Skipping calendar sport_key={sport_key}: events fetch failed ({error})")
            continue

        for raw_event in payload:
            if not isinstance(raw_event, dict):
                continue

            normalized = normalize_raw_event(
                raw_event=raw_event,
                sport_key=sport_key,
                sport_slug=app_slug,
                fallback_league=fallback_league,
            )
            if normalized is None:
                continue

            start = parse_utc_iso(normalized.start_time)
            if start is None:
                continue
            if start < window_start or start > window_end:
                continue

            events.append(normalized)

    by_key: dict[tuple[str, str], EventModel] = {}
    for event in sorted(events, key=lambda item: (item.start_time, item.sport_slug, item.league, item.provider_event_id)):
        by_key[(event.provider, event.provider_event_id)] = event

    deduped = list(by_key.values())
    return deduped, warnings, (window_start, window_end)
