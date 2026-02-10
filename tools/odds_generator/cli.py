from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

from .api_client import OddsApiClient, OddsApiClientError
from .anchoring import anchor_date_for_mode, build_seed
from .calendar_client import build_week_window, fetch_calendar_events, normalize_raw_event
from .featured_selector import (
    FeaturedEventCandidate,
    build_featured_candidates,
    featured_anchor_date,
    load_featured_config,
    select_featured_events,
)
from .models import (
    CandidateOption,
    CandidatePick,
    EventModel,
    FeaturedSelectionModel,
    ImportPayloadModel,
    Mode,
    PickMetadataModel,
    PickModel,
    PickOptionModel,
    parse_utc_iso,
    to_utc_z,
    utc_now,
)
from .selector import select_candidates
from .sportsdata_adapter import (
    sportsdata_game_odds_to_raw_events,
    sportsdata_scores_row_to_event,
)
from .sportsdata_client import SportsDataClient, SportsDataClientError
from .sports_map import (
    DEFAULT_ALLOWED_APP_SLUGS,
    build_auto_sports_map,
    load_and_merge_sports_configs,
    load_sports_config_file,
    write_sports_map_yaml,
)
from .writer import write_import_payload, write_raw_response
from .supabase_writer import (
    list_featured_events_for_date,
    list_events_for_window,
    replace_featured_events,
    upsert_events,
    upsert_pick_pack,
)

ALLOWED_APP_SLUGS = set(DEFAULT_ALLOWED_APP_SLUGS)
MARKET_LABELS = {
    "h2h": "h2h",
    "totals": "totals",
    "spreads": "spreads",
}
DEFAULT_SPORTS_CONFIG = (
    "tools/odds_generator/sports_map.base.yaml,"
    "tools/odds_generator/sports_map.auto.yaml"
)
DEFAULT_FEATURED_CONFIG = "tools/odds_generator/config/featured_quotas.yaml"
MARKET_PRIORITY = {"h2h": 0, "totals": 1, "spreads": 2}


@dataclass(frozen=True)
class Window:
    mode: Mode
    start_iso: str
    end_iso: str


@dataclass(frozen=True)
class RawSnapshot:
    fetched_at: datetime
    sport_key: str
    response_payload: list[dict[str, Any]]


def parse_bool(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "y"}:
        return True
    if lowered in {"0", "false", "no", "n"}:
        return False
    raise argparse.ArgumentTypeError("Expected true or false")


def parse_csv_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_path_list(value: str | None) -> list[Path]:
    paths = [Path(item) for item in parse_csv_list(value)]
    return sorted(
        paths,
        key=lambda path: (0 if "base" in path.stem.lower() else 1, str(path)),
    )


def infer_app_slug_from_sport_key(sport_key: str) -> str | None:
    lowered = sport_key.lower()
    if lowered.startswith("soccer_"):
        return "soccer"
    if lowered.startswith("basketball_"):
        return "basketball"
    if lowered.startswith("tennis_"):
        return "tennis"
    if lowered.startswith("golf_"):
        return "golf"
    if lowered.startswith("motorsport_") or lowered.startswith("nascar_"):
        return "motor"
    if lowered.startswith("americanfootball_"):
        return "american-football"
    if lowered.startswith("baseball_"):
        return "baseball"
    if lowered.startswith("icehockey_") or lowered.startswith("hockey_"):
        return "hockey"
    if lowered.startswith("mma_") or lowered.startswith("boxing_"):
        return "combat"
    return None


def fallback_league_from_sport_key(sport_key: str) -> str:
    lowered = sport_key.lower()
    if lowered.startswith("soccer_"):
        return "Soccer"
    if lowered.startswith("basketball_"):
        return "Basketball"
    if lowered.startswith("tennis_"):
        return "Tennis"
    if lowered.startswith("golf_"):
        return "Golf"
    if lowered.startswith("motorsport_") or lowered.startswith("nascar_"):
        return "Motor"
    if lowered.startswith("americanfootball_"):
        return "American Football"
    if lowered.startswith("baseball_"):
        return "Baseball"
    if lowered.startswith("icehockey_") or lowered.startswith("hockey_"):
        return "Hockey"
    if lowered.startswith("mma_") or lowered.startswith("boxing_"):
        return "Combat"
    return sport_key.replace("_", " ").title()


def infer_sportsdata_code(
    *,
    sport_key: str,
    app_slug: str,
    provider_sport_hint: str | None,
) -> str | None:
    if provider_sport_hint and provider_sport_hint.strip():
        return provider_sport_hint.strip().lower()

    lowered_key = sport_key.lower()

    if lowered_key.startswith("sportsdata_"):
        raw = lowered_key.split("_", 2)
        if len(raw) >= 2 and raw[1]:
            return raw[1]

    if "nba" in lowered_key:
        return "nba"
    if lowered_key.startswith("soccer_") or app_slug == "soccer":
        return "soccer"
    if lowered_key.startswith("americanfootball_") or app_slug == "american-football":
        return "nfl"
    if lowered_key.startswith("baseball_") or app_slug == "baseball":
        return "mlb"
    if lowered_key.startswith("icehockey_") or app_slug == "hockey":
        return "nhl"
    if lowered_key.startswith("tennis_") or app_slug == "tennis":
        return "tennis"
    if lowered_key.startswith("golf_") or app_slug == "golf":
        return "golf"
    if lowered_key.startswith("mma_") or lowered_key.startswith("boxing_") or app_slug == "combat":
        return "mma"
    if "nascar" in lowered_key:
        return "nascar"

    if app_slug == "basketball":
        return "nba"
    if app_slug == "motor":
        return "nascar"

    return None


def sportsdata_targets_for_mapping(
    *,
    sport_key: str,
    app_slug: str,
    provider_sport_hint: str | None,
) -> list[tuple[str, str | None]]:
    hint = (provider_sport_hint or "").strip()
    competitions_from_env = parse_csv_list(os.getenv("SPORTSDATA_SOCCER_COMPETITIONS"))

    sport_code: str | None = None
    competitions: list[str] = []
    if hint:
        if ":" in hint:
            left, right = hint.split(":", 1)
            sport_code = left.strip().lower() if left.strip() else None
            competitions = [item.upper() for item in parse_csv_list(right)]
        else:
            sport_code = hint.lower()

    if sport_code is None:
        sport_code = infer_sportsdata_code(
            sport_key=sport_key,
            app_slug=app_slug,
            provider_sport_hint=provider_sport_hint,
        )

    if sport_code is None:
        return []

    if sport_code == "soccer":
        chosen_competitions = competitions or [item.upper() for item in competitions_from_env] or ["UCL"]
        return [(sport_code, competition) for competition in chosen_competitions]

    return [(sport_code, None)]


def _local_dates_for_window(
    start_dt: datetime,
    end_dt: datetime,
    *,
    tz_name: str,
) -> list[date]:
    start_local = start_dt.astimezone(ZoneInfo(tz_name)).date()
    end_local = end_dt.astimezone(ZoneInfo(tz_name)).date()

    days = (end_local - start_local).days
    if days < 0:
        return []
    return [start_local + timedelta(days=index) for index in range(days + 1)]


def build_calendar_events_from_raw_snapshots(
    *,
    snapshots: Sequence[RawSnapshot],
    config,
    start_dt: datetime,
    end_dt: datetime,
    sport_slug_filter: str | None = None,
) -> tuple[list[EventModel], list[str]]:
    warnings: list[str] = []
    events: list[EventModel] = []

    for snapshot in snapshots:
        mapping = config.sports.get(snapshot.sport_key)
        app_slug = mapping.app_slug if mapping else infer_app_slug_from_sport_key(snapshot.sport_key)
        if app_slug is None:
            continue
        if sport_slug_filter is not None and app_slug != sport_slug_filter:
            continue

        fallback_league = mapping.league if mapping else fallback_league_from_sport_key(snapshot.sport_key)
        for raw_event in snapshot.response_payload:
            if not isinstance(raw_event, dict):
                continue
            normalized = normalize_raw_event(
                raw_event=raw_event,
                sport_key=snapshot.sport_key,
                sport_slug=app_slug,
                fallback_league=fallback_league,
            )
            if normalized is None:
                continue
            start = parse_utc_iso(normalized.start_time)
            if start is None:
                continue
            if start < start_dt or start > end_dt:
                continue
            events.append(normalized)

    deduped_by_provider: dict[tuple[str, str], EventModel] = {}
    for event in sorted(
        events,
        key=lambda item: (item.start_time, item.sport_slug, item.league, item.provider_event_id),
    ):
        deduped_by_provider[(event.provider, event.provider_event_id)] = event

    return list(deduped_by_provider.values()), warnings


def merge_events_without_duplicates(events: Sequence[EventModel]) -> list[EventModel]:
    # Cross-provider de-duplication by semantic event identity.
    by_key: dict[tuple[str, str, str, str], EventModel] = {}
    for event in sorted(
        events,
        key=lambda item: (item.start_time, item.sport_slug, item.league, item.provider, item.provider_event_id),
    ):
        home = (event.home or "").strip().lower()
        away = (event.away or "").strip().lower()
        if not home and len(event.participants) > 0:
            home = str(event.participants[0]).strip().lower()
        if not away and len(event.participants) > 1:
            away = str(event.participants[1]).strip().lower()
        key = (event.sport_slug, event.start_time, home, away)

        existing = by_key.get(key)
        if existing is None:
            by_key[key] = event
            continue

        # Prefer SportsData row when both sources provide same event identity.
        existing_is_sportsdata = existing.provider == "sportsdata"
        incoming_is_sportsdata = event.provider == "sportsdata"
        if incoming_is_sportsdata and not existing_is_sportsdata:
            by_key[key] = event

    return sorted(
        by_key.values(),
        key=lambda item: (item.start_time, item.sport_slug, item.league, item.home or "", item.away or ""),
    )


def merge_candidates_without_duplicates(candidates: Sequence[CandidatePick]) -> list[CandidatePick]:
    by_key: dict[tuple[str, str, str], CandidatePick] = {}

    for candidate in sorted(
        candidates,
        key=lambda item: (item.start_time, item.sport_slug, item.market, item.event, item.candidate_id),
    ):
        key = (candidate.sport_slug, candidate.event_key, candidate.market)
        current = by_key.get(key)
        if current is None:
            by_key[key] = candidate
            continue

        current_priority = 0 if current.sport_key.startswith("sportsdata") else 1
        new_priority = 0 if candidate.sport_key.startswith("sportsdata") else 1
        if new_priority < current_priority:
            by_key[key] = candidate
        elif new_priority == current_priority and candidate.candidate_id < current.candidate_id:
            by_key[key] = candidate

    return deduplicate_candidates(list(by_key.values()))


def _sportsdata_sync_dates(
    *,
    now_utc: datetime,
    sync_days_override: int,
    tz_name: str,
) -> list[date]:
    local_now = now_utc.astimezone(ZoneInfo(tz_name))
    local_today = local_now.date()

    if sync_days_override > 0:
        return [local_today + timedelta(days=index) for index in range(sync_days_override)]

    # Quota-friendly default:
    # - Monday: hydrate full week (Mon..Sun)
    # - Tue..Sun: refresh only today + tomorrow
    if local_now.weekday() == 0:
        days_to_sunday = 6 - local_now.weekday()
        return [local_today + timedelta(days=index) for index in range(days_to_sunday + 1)]

    return [local_today, local_today + timedelta(days=1)]


def start_of_local_week(now_utc: datetime, tz_name: str) -> datetime:
    local_now = now_utc.astimezone(ZoneInfo(tz_name))
    local_start_of_day = datetime(
        local_now.year,
        local_now.month,
        local_now.day,
        tzinfo=local_now.tzinfo,
    )
    return local_start_of_day - timedelta(days=local_now.weekday())


def make_event_name(raw_event: dict[str, Any]) -> str:
    home = raw_event.get("home_team")
    away = raw_event.get("away_team")

    if isinstance(home, str) and isinstance(away, str):
        return f"{home} vs {away}"

    if isinstance(raw_event.get("name"), str):
        return raw_event["name"]

    return "Unknown Event"


def format_outcome_label(market_key: str, outcome: dict[str, Any]) -> str | None:
    name = outcome.get("name")
    if not isinstance(name, str) or not name.strip():
        return None

    if market_key in {"totals", "spreads"} and outcome.get("point") is not None:
        try:
            point = float(outcome["point"])
            return f"{name.strip()} {point:g}"
        except (TypeError, ValueError):
            return name.strip()

    return name.strip()


def choose_market_options(
    bookmakers: Sequence[dict[str, Any]],
    market_key: str,
) -> tuple[str | None, tuple[CandidateOption, ...]]:
    for bookmaker in sorted(bookmakers, key=lambda b: str(b.get("key", ""))):
        bookmaker_key = bookmaker.get("key")
        markets = bookmaker.get("markets")
        if not isinstance(markets, list):
            continue

        market_block = next(
            (
                market
                for market in markets
                if isinstance(market, dict) and market.get("key") == market_key
            ),
            None,
        )

        if not isinstance(market_block, dict):
            continue

        outcomes = market_block.get("outcomes")
        if not isinstance(outcomes, list):
            continue

        options: list[CandidateOption] = []
        seen_labels: set[str] = set()

        for outcome in outcomes:
            if not isinstance(outcome, dict):
                continue

            label = format_outcome_label(market_key, outcome)
            if not label:
                continue

            try:
                odds = float(outcome.get("price"))
            except (TypeError, ValueError):
                continue

            if odds <= 1.01:
                continue

            if label in seen_labels:
                continue

            seen_labels.add(label)
            options.append(CandidateOption(label=label, odds=odds))

        if len(options) >= 2:
            return (str(bookmaker_key) if bookmaker_key else None, tuple(options))

    return None, tuple()


def build_candidates(
    raw_events: Sequence[dict[str, Any]],
    sport_key: str,
    app_slug: str,
    fallback_league: str,
    markets: Sequence[str],
) -> tuple[list[CandidatePick], list[str]]:
    warnings: list[str] = []
    candidates: list[CandidatePick] = []

    for raw_event in sorted(raw_events, key=lambda e: str(e.get("id", ""))):
        commence_time = raw_event.get("commence_time")
        if not isinstance(commence_time, str):
            warnings.append(f"{sport_key}: skipping event with missing commence_time")
            continue

        parsed_time = parse_utc_iso(commence_time)
        if parsed_time is None:
            warnings.append(
                f"{sport_key}: skipping event with invalid commence_time '{commence_time}'",
            )
            continue

        event_id = str(raw_event.get("id") or "")
        if not event_id:
            event_name = make_event_name(raw_event)
            event_id = f"{sport_key}:{event_name}:{to_utc_z(parsed_time)}"

        league = raw_event.get("sport_title") if isinstance(raw_event.get("sport_title"), str) else fallback_league
        event_name = make_event_name(raw_event)
        event_key = f"{event_name.strip().lower()}|{to_utc_z(parsed_time)}"

        bookmakers = raw_event.get("bookmakers")
        if not isinstance(bookmakers, list) or len(bookmakers) == 0:
            warnings.append(f"{sport_key}:{event_id}: missing bookmakers")
            continue

        for market_key in markets:
            bookmaker_key, options = choose_market_options(bookmakers, market_key)
            if len(options) < 2:
                continue

            candidate = CandidatePick(
                candidate_id=f"{sport_key}:{event_id}:{market_key}",
                sport_key=sport_key,
                sport_slug=app_slug,
                league=league,
                event=event_name,
                event_key=event_key,
                start_time=to_utc_z(parsed_time),
                market=market_key,
                bookmaker=bookmaker_key,
                options=options,
                provider_event_id=event_id,
            )
            candidates.append(candidate)

    return deduplicate_candidates(candidates), warnings


def deduplicate_candidates(candidates: Sequence[CandidatePick]) -> list[CandidatePick]:
    by_id: dict[str, CandidatePick] = {}

    for candidate in sorted(
        candidates,
        key=lambda c: (c.candidate_id, c.bookmaker or "", c.start_time),
    ):
        if candidate.candidate_id not in by_id:
            by_id[candidate.candidate_id] = candidate

    return sorted(
        by_id.values(),
        key=lambda c: (c.start_time, c.sport_slug, c.market, c.event, c.candidate_id),
    )


def load_raw_snapshots_for_jornada(
    *,
    raw_dir: Path,
    now_utc: datetime,
    tz_name: str,
) -> tuple[list[RawSnapshot], list[str]]:
    warnings: list[str] = []
    snapshots: list[RawSnapshot] = []

    local_now = now_utc.astimezone(ZoneInfo(tz_name))
    local_week_start = start_of_local_week(now_utc, tz_name=tz_name)

    if not raw_dir.exists():
        warnings.append(f"Raw directory does not exist: {raw_dir}")
        return [], warnings

    for path in sorted(raw_dir.rglob("*.json")):
        try:
            parsed = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            warnings.append(f"Skipping raw file {path}: invalid JSON ({error})")
            continue

        fetched_raw = parsed.get("fetched_at")
        sport_key = parsed.get("sport_key")
        response_payload = parsed.get("response")

        if not isinstance(fetched_raw, str):
            warnings.append(f"Skipping raw file {path}: missing fetched_at")
            continue
        if not isinstance(sport_key, str) or not sport_key:
            warnings.append(f"Skipping raw file {path}: missing sport_key")
            continue
        if not isinstance(response_payload, list):
            warnings.append(f"Skipping raw file {path}: missing response list")
            continue

        fetched_at = parse_utc_iso(fetched_raw)
        if fetched_at is None:
            warnings.append(f"Skipping raw file {path}: invalid fetched_at '{fetched_raw}'")
            continue

        fetched_local = fetched_at.astimezone(ZoneInfo(tz_name))
        if fetched_local < local_week_start or fetched_local > local_now:
            continue

        snapshots.append(
            RawSnapshot(
                fetched_at=fetched_at,
                sport_key=sport_key,
                response_payload=response_payload,
            ),
        )

    snapshots.sort(key=lambda item: item.fetched_at)
    return snapshots, warnings


def build_candidates_from_raw_snapshots(
    *,
    snapshots: Sequence[RawSnapshot],
    mode: Mode,
    config,
    markets: Sequence[str],
    start_dt: datetime,
    end_dt: datetime,
) -> tuple[list[CandidatePick], list[str]]:
    warnings: list[str] = []
    latest_by_candidate_id: dict[str, CandidatePick] = {}

    for snapshot in snapshots:
        mapping = config.sports.get(snapshot.sport_key)
        if mapping is None:
            warnings.append(
                f"Skipping raw snapshot sport_key={snapshot.sport_key}: not present in sports config",
            )
            continue

        if not should_use_sport_for_mode(
            mode,
            allow_daily=mapping.allow_daily,
            allow_weekly=mapping.allow_weekly,
        ):
            continue

        if mapping.app_slug not in ALLOWED_APP_SLUGS:
            warnings.append(
                f"Skipping raw snapshot sport_key={snapshot.sport_key}: app_slug '{mapping.app_slug}' not allowed",
            )
            continue

        candidates, snapshot_warnings = build_candidates(
            raw_events=snapshot.response_payload,
            sport_key=snapshot.sport_key,
            app_slug=mapping.app_slug,
            fallback_league=mapping.league,
            markets=markets,
        )
        warnings.extend(snapshot_warnings)

        for candidate in candidates:
            latest_by_candidate_id[candidate.candidate_id] = candidate

    filtered: list[CandidatePick] = []
    for candidate in latest_by_candidate_id.values():
        start = parse_utc_iso(candidate.start_time)
        if start is None:
            warnings.append(
                f"Skipping candidate {candidate.candidate_id}: invalid start_time '{candidate.start_time}'",
            )
            continue
        if start < start_dt or start > end_dt:
            continue
        filtered.append(candidate)

    return deduplicate_candidates(filtered), warnings


def fetch_calendar_events_sportsdata(
    *,
    client: SportsDataClient,
    config,
    now_utc: datetime,
    sync_days_override: int,
    tz_name: str = "Europe/Madrid",
) -> tuple[list[EventModel], list[str], tuple[datetime, datetime], dict[tuple[str, date], list[dict[str, Any]]]]:
    warnings: list[str] = []
    events: list[EventModel] = []
    scores_cache: dict[tuple[str, date], list[dict[str, Any]]] = {}
    window_start_utc, window_end_utc = build_week_window(now_utc, tz_name=tz_name)
    sync_dates = _sportsdata_sync_dates(
        now_utc=now_utc,
        sync_days_override=max(0, sync_days_override),
        tz_name=tz_name,
    )

    groups_by_target: dict[tuple[str, str | None], list[tuple[str, str, str]]] = defaultdict(list)
    for sport_key, mapping in sorted(config.sports.items()):
        targets = sportsdata_targets_for_mapping(
            sport_key=sport_key,
            app_slug=mapping.app_slug,
            provider_sport_hint=mapping.provider_sport,
        )
        if not targets:
            warnings.append(f"Skipping sport_key={sport_key}: no SportsData sport code mapping.")
            continue
        for target in targets:
            groups_by_target[target].append((sport_key, mapping.app_slug, mapping.league))

    for (sport_code, competition), group_entries in sorted(groups_by_target.items()):
        app_slug = group_entries[0][1]
        fallback_league = group_entries[0][2]

        for local_date in sync_dates:
            try:
                if sport_code == "soccer" and competition:
                    score_rows, _headers = client.get_soccer_scores_by_date(competition, local_date)
                else:
                    score_rows, _headers = client.get_scores_by_date(sport_code, local_date)
            except SportsDataClientError as error:
                warnings.append(
                    f"Skipping sportsdata {sport_code}{f':{competition}' if competition else ''} {local_date}: scores fetch failed ({error})",
                )
                continue

            key = (f"{sport_code}:{competition}" if competition else sport_code, local_date)
            scores_cache[key] = score_rows
            for score_row in score_rows:
                if not isinstance(score_row, dict):
                    continue
                event = sportsdata_scores_row_to_event(
                    row=score_row,
                    sport_slug=app_slug,
                    fallback_league=fallback_league,
                    provider_sport=f"{sport_code}:{competition}" if competition else sport_code,
                )
                if event is None:
                    continue
                event_start = parse_utc_iso(event.start_time)
                if event_start is None:
                    continue
                if event_start < window_start_utc or event_start > window_end_utc:
                    continue
                events.append(event)

    by_key: dict[tuple[str, str], EventModel] = {}
    for event in sorted(
        events,
        key=lambda item: (item.start_time, item.sport_slug, item.league, item.provider_event_id),
    ):
        by_key[(event.provider, event.provider_event_id)] = event

    return list(by_key.values()), warnings, (window_start_utc, window_end_utc), scores_cache


def build_candidates_from_sportsdata(
    *,
    client: SportsDataClient,
    config,
    mode: Mode,
    markets: Sequence[str],
    start_dt: datetime,
    end_dt: datetime,
    tz_name: str = "Europe/Madrid",
    scores_cache: dict[tuple[str, date], list[dict[str, Any]]] | None = None,
) -> tuple[list[CandidatePick], list[str]]:
    warnings: list[str] = []
    candidates: list[CandidatePick] = []
    local_dates = _local_dates_for_window(start_dt, end_dt, tz_name=tz_name)
    effective_scores_cache = scores_cache if scores_cache is not None else {}

    for sport_key, mapping in sorted(config.sports.items()):
        if not should_use_sport_for_mode(
            mode,
            allow_daily=mapping.allow_daily,
            allow_weekly=mapping.allow_weekly,
        ):
            continue

        if mapping.app_slug not in ALLOWED_APP_SLUGS:
            warnings.append(
                f"Skipping sport_key={sport_key}: app_slug '{mapping.app_slug}' not allowed",
            )
            continue

        targets = sportsdata_targets_for_mapping(
            sport_key=sport_key,
            app_slug=mapping.app_slug,
            provider_sport_hint=mapping.provider_sport,
        )
        if not targets:
            warnings.append(f"Skipping sport_key={sport_key}: no SportsData sport code mapping.")
            continue

        raw_events: list[dict[str, Any]] = []
        for sport_code, competition in targets:
            for local_date in local_dates:
                target_key = f"{sport_code}:{competition}" if competition else sport_code
                score_key = (target_key, local_date)
                score_rows = effective_scores_cache.get(score_key)
                if score_rows is None:
                    try:
                        if sport_code == "soccer" and competition:
                            score_rows, _score_headers = client.get_soccer_scores_by_date(competition, local_date)
                        else:
                            score_rows, _score_headers = client.get_scores_by_date(sport_code, local_date)
                    except SportsDataClientError:
                        score_rows = []
                    effective_scores_cache[score_key] = score_rows

                try:
                    if sport_code == "soccer" and competition:
                        odds_rows, _odds_headers = client.get_soccer_game_odds_by_date(competition, local_date)
                    else:
                        odds_rows, _odds_headers = client.get_game_odds_by_date(sport_code, local_date)
                except SportsDataClientError as error:
                    warnings.append(
                        f"Skipping sportsdata {target_key} {local_date}: odds fetch failed ({error})",
                    )
                    continue

                scores_by_game_id: dict[str, dict[str, Any]] = {}
                for score_row in score_rows:
                    if not isinstance(score_row, dict):
                        continue
                    game_id = score_row.get("GameID")
                    if game_id is None:
                        game_id = score_row.get("GameId")
                    if game_id is None:
                        continue
                    scores_by_game_id[str(game_id)] = score_row

                raw_events.extend(
                    sportsdata_game_odds_to_raw_events(
                        odds_rows=[row for row in odds_rows if isinstance(row, dict)],
                        scores_by_game_id=scores_by_game_id,
                        fallback_league=mapping.league,
                    ),
                )

        sport_candidates, candidate_warnings = build_candidates(
            raw_events=raw_events,
            sport_key=sport_key,
            app_slug=mapping.app_slug,
            fallback_league=mapping.league,
            markets=markets,
        )
        candidates.extend(sport_candidates)
        warnings.extend(candidate_warnings)

    filtered: list[CandidatePick] = []
    for candidate in deduplicate_candidates(candidates):
        start = parse_utc_iso(candidate.start_time)
        if start is None:
            continue
        if start < start_dt or start > end_dt:
            continue
        filtered.append(candidate)

    return deduplicate_candidates(filtered), warnings


def build_candidates_from_raw_snapshots_by_slug(
    *,
    snapshots: Sequence[RawSnapshot],
    markets: Sequence[str],
    start_dt: datetime,
    end_dt: datetime,
    sport_slug_filter: str,
    config,
) -> tuple[list[CandidatePick], list[str]]:
    warnings: list[str] = []
    latest_by_composite_key: dict[tuple[str, str, str], CandidatePick] = {}

    for snapshot in snapshots:
        mapping = config.sports.get(snapshot.sport_key)
        app_slug = mapping.app_slug if mapping else infer_app_slug_from_sport_key(snapshot.sport_key)
        if app_slug != sport_slug_filter:
            continue

        fallback_league = mapping.league if mapping else fallback_league_from_sport_key(snapshot.sport_key)
        candidates, candidate_warnings = build_candidates(
            raw_events=snapshot.response_payload,
            sport_key=snapshot.sport_key,
            app_slug=app_slug,
            fallback_league=fallback_league,
            markets=markets,
        )
        warnings.extend(candidate_warnings)

        for candidate in candidates:
            start = parse_utc_iso(candidate.start_time)
            if start is None:
                continue
            if start < start_dt or start > end_dt:
                continue
            key = (candidate.sport_slug, candidate.event_key, candidate.market)
            latest_by_composite_key[key] = candidate

    return deduplicate_candidates(list(latest_by_composite_key.values())), warnings


def build_payload(
    round_id: str,
    mode: Mode,
    candidates: Sequence[CandidatePick],
    regions: Sequence[str],
) -> ImportPayloadModel:
    prefix = "[DAILY]" if mode == "daily" else "[WEEK]"
    picks: list[PickModel] = []

    for index, candidate in enumerate(candidates):
        title = f"{prefix} {candidate.event} - {MARKET_LABELS.get(candidate.market, candidate.market)}"
        bookmaker_summary = candidate.bookmaker or "n/a"
        description = f"regions={','.join(regions)} | bookmaker={bookmaker_summary}"

        pick = PickModel(
            sport_slug=candidate.sport_slug,
            title=title,
            description=description,
            order_index=index,
            options=[
                PickOptionModel(label=option.label, odds=option.odds)
                for option in candidate.options
            ],
            metadata=PickMetadataModel(
                league=candidate.league,
                event=candidate.event,
                start_time=candidate.start_time,
            ),
        )
        picks.append(pick)

    return ImportPayloadModel(round_id=round_id, picks=picks)


def summarize_payload(payload: ImportPayloadModel) -> dict[str, Any]:
    min_odds = float("inf")
    max_odds = float("-inf")
    counts_by_sport: dict[str, int] = {}

    for pick in payload.picks:
        counts_by_sport[pick.sport_slug] = counts_by_sport.get(pick.sport_slug, 0) + 1
        for option in pick.options:
            min_odds = min(min_odds, option.odds)
            max_odds = max(max_odds, option.odds)

    if min_odds == float("inf"):
        min_odds = 0
        max_odds = 0

    return {
        "total_picks": len(payload.picks),
        "counts_by_sport": counts_by_sport,
        "min_odds": min_odds,
        "max_odds": max_odds,
    }


def _to_event_model_from_db_row(row: dict[str, Any]) -> EventModel | None:
    metadata = row.get("metadata")
    payload_metadata = metadata if isinstance(metadata, dict) else {}
    payload_metadata = {**payload_metadata, "db_event_id": row.get("id")}
    try:
        return EventModel(
            provider=str(row.get("provider") or "the_odds_api"),
            provider_event_id=str(row.get("provider_event_id") or ""),
            sport_slug=str(row.get("sport_slug") or ""),
            league=str(row.get("league") or ""),
            start_time=str(row.get("start_time") or ""),
            home=(row.get("home") if isinstance(row.get("home"), str) else None),
            away=(row.get("away") if isinstance(row.get("away"), str) else None),
            status=str(row.get("status") or "scheduled"),
            participants=(
                [str(item) for item in row.get("participants", [])]
                if isinstance(row.get("participants"), list)
                else []
            ),
            metadata=payload_metadata,
        )
    except Exception:
        return None


def _bucket_rank(bucket: str) -> int:
    if bucket == "today":
        return 0
    if bucket == "tomorrow":
        return 1
    return 2


def _market_rank(market: str) -> int:
    return MARKET_PRIORITY.get(market, 9)


def _event_display_name(event: EventModel) -> str:
    if event.home and event.away:
        return f"{event.home} vs {event.away}"
    if event.participants:
        return " vs ".join(event.participants[:2])
    return event.provider_event_id


def _select_featured_candidates_with_odds(
    *,
    featured_rows: Sequence[FeaturedSelectionModel],
    event_rows: Sequence[EventModel],
    all_candidates: Sequence[CandidatePick],
    markets: Sequence[str],
    seed: str,
    max_markets_per_event: int,
    featured_date: date,
    tz_name: str = "Europe/Madrid",
) -> tuple[list[CandidatePick], list[str]]:
    warnings: list[str] = []
    event_by_db_id = {
        str(event.metadata.get("db_event_id")): event
        for event in event_rows
        if isinstance(event.metadata, dict) and event.metadata.get("db_event_id")
    }

    candidates_by_provider_event_id: dict[str, list[CandidatePick]] = {}
    for candidate in all_candidates:
        candidates_by_provider_event_id.setdefault(candidate.provider_event_id, []).append(candidate)

    for provider_event_id, provider_candidates in candidates_by_provider_event_id.items():
        provider_candidates.sort(
            key=lambda item: (
                _market_rank(item.market),
                item.start_time,
                item.candidate_id,
            ),
        )

    def bucket_for_event(event: EventModel) -> str:
        parsed = parse_utc_iso(event.start_time)
        if parsed is None:
            return "week_rest"
        local_date = parsed.astimezone(ZoneInfo(tz_name)).date()
        delta = (local_date - featured_date).days
        if delta <= 0:
            return "today"
        if delta == 1:
            return "tomorrow"
        return "week_rest"

    used_provider_event_ids: set[str] = set()
    selected: list[CandidatePick] = []
    available_events = list(event_by_db_id.values())
    market_set = set(markets)

    def candidates_for_event(event: EventModel) -> list[CandidatePick]:
        raw = candidates_by_provider_event_id.get(event.provider_event_id, [])
        return [item for item in raw if item.market in market_set]

    def fallback_event(current: EventModel, bucket: str) -> EventModel | None:
        same_bucket = [
            event
            for event in available_events
            if event.provider_event_id not in used_provider_event_ids
            and bucket_for_event(event) == bucket
        ]
        same_league = [event for event in same_bucket if event.league == current.league]
        same_sport = [event for event in same_bucket if event.sport_slug == current.sport_slug]

        for pool in (same_league, same_sport, same_bucket):
            if not pool:
                continue
            ranked = sorted(
                pool,
                key=lambda event: (
                    -int(
                        hashlib.sha256(
                            f"{seed}|fallback|{event.provider_event_id}".encode("utf-8"),
                        ).hexdigest()[:8],
                        16,
                    ),
                    event.start_time,
                ),
            )
            for candidate_event in ranked:
                if candidates_for_event(candidate_event):
                    return candidate_event
        return None

    for featured in sorted(
        featured_rows,
        key=lambda item: (_bucket_rank(item.bucket), item.sport_slug, item.event_id),
    ):
        event = event_by_db_id.get(featured.event_id)
        if event is None:
            warnings.append(f"Featured event missing in events table: {featured.event_id}")
            continue

        source_event = event
        candidate_pool = candidates_for_event(source_event)
        if not candidate_pool:
            replacement = fallback_event(source_event, featured.bucket)
            if replacement is None:
                warnings.append(
                    f"No odds for featured event {featured.event_id} ({source_event.league}) and no replacement found.",
                )
                continue
            source_event = replacement
            candidate_pool = candidates_for_event(source_event)
            warnings.append(
                f"Replaced featured event {featured.event_id} with {source_event.provider_event_id} due to missing odds.",
            )

        used_provider_event_ids.add(source_event.provider_event_id)
        for candidate in candidate_pool[: max(1, max_markets_per_event)]:
            selected.append(candidate)

    deduped = deduplicate_candidates(selected)
    return deduped, warnings


def iter_modes(mode: str) -> Iterable[Mode]:
    if mode == "both":
        return ("daily", "weekly")
    if mode == "daily":
        return ("daily",)
    return ("weekly",)


def window_for_mode(mode: Mode, now_utc):
    end = now_utc + (timedelta(hours=24) if mode == "daily" else timedelta(days=7))
    return Window(mode=mode, start_iso=to_utc_z(now_utc), end_iso=to_utc_z(end))


def validate_targets(
    daily_target: int,
    weekly_target: int,
    daily_max: int,
    weekly_max: int,
) -> tuple[int, int]:
    return min(daily_target, daily_max), min(weekly_target, weekly_max)


def should_use_sport_for_mode(mode: Mode, allow_daily: bool, allow_weekly: bool) -> bool:
    if mode == "daily":
        return allow_daily
    return allow_weekly


def run_build_sports_map(
    *,
    client: OddsApiClient,
    mode: str,
    base_path: Path,
    out_path: Path,
    use_openai: bool,
    openai_api_key: str | None,
) -> int:
    base_config = load_sports_config_file(base_path)
    raw_catalog, _headers = client.get_sports()

    auto_sports, warnings, rationale = build_auto_sports_map(
        raw_catalog=raw_catalog,
        base_sports=base_config.sports,
        mode=mode,
        use_openai=use_openai,
        openai_api_key=openai_api_key,
        allowed_app_slugs=ALLOWED_APP_SLUGS,
    )

    write_sports_map_yaml(out_path, auto_sports)

    print(
        json.dumps(
            {
                "action": "build_sports_map",
                "base": str(base_path),
                "out": str(out_path),
                "mode": mode,
                "generated_keys": sorted(auto_sports.keys()),
                "generated_count": len(auto_sports),
                "warnings": warnings,
                "openai_rationale": rationale,
            },
            indent=2,
        ),
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m tools.odds_generator.generate",
        description="Generate SportsRank pick import payloads from The Odds API",
    )
    parser.add_argument("--round-id", default=None)
    parser.add_argument("--build-sports-map", action="store_true")
    parser.add_argument("--out", default="tools/odds_generator/sports_map.auto.yaml")
    parser.add_argument("--base", default="tools/odds_generator/sports_map.base.yaml")
    parser.add_argument("--provider", choices=["theodds", "sportsdata"], default="theodds")
    parser.add_argument("--mode", choices=["daily", "weekly", "both"], default="both")
    parser.add_argument(
        "--sports-config",
        default=DEFAULT_SPORTS_CONFIG,
    )
    parser.add_argument("--featured-config", default=DEFAULT_FEATURED_CONFIG)
    parser.add_argument("--markets", default="h2h,totals,spreads")
    parser.add_argument("--regions", default="eu,uk,us")
    parser.add_argument("--bookmakers", default=None)
    parser.add_argument("--daily-target", type=int, default=None)
    parser.add_argument("--weekly-target", type=int, default=None)
    parser.add_argument("--outdir", default="./generated")
    parser.add_argument("--source", choices=["live", "raw-jornada"], default="live")
    parser.add_argument("--raw-dir", default=None)
    parser.add_argument("--use-openai", type=parse_bool, default=False)
    parser.add_argument("--sync-calendar", type=parse_bool, default=False)
    parser.add_argument("--build-featured", type=parse_bool, default=False)
    parser.add_argument("--generate-featured-picks", type=parse_bool, default=False)
    parser.add_argument("--featured-date", default=None)
    parser.add_argument("--min-lead-minutes", type=int, default=None)
    parser.add_argument("--max-markets-per-event", type=int, default=2)
    parser.add_argument("--sportsdata-sync-days", type=int, default=0)
    parser.add_argument("--merge-raw-soccer", type=parse_bool, default=True)
    parser.add_argument("--persist-supabase", type=parse_bool, default=True)
    parser.add_argument("--supabase-url", default=None)
    parser.add_argument("--supabase-service-role-key", default=None)
    return parser


def _run_featured_pipeline(
    *,
    args,
    provider: str,
    odds_client: OddsApiClient | None,
    sportsdata_client: SportsDataClient | None,
    config,
    openai_api_key: str | None,
    supabase_url: str | None,
    supabase_service_role_key: str | None,
    outdir: Path,
    markets: list[str],
    regions: list[str],
    bookmakers: list[str],
    raw_dir: Path,
) -> int:
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is required for calendar/featured pipeline")
    if not supabase_service_role_key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for calendar/featured pipeline")

    now_utc = utc_now()
    tz_name = "Europe/Madrid"
    featured_date = (
        datetime.fromisoformat(args.featured_date).date()
        if args.featured_date
        else featured_anchor_date(now_utc, tz_name=tz_name)
    )
    featured_seed = f"FEATURED|{featured_date.isoformat()}|{args.round_id}"

    featured_config = load_featured_config(Path(args.featured_config))
    min_lead_minutes = (
        args.min_lead_minutes
        if args.min_lead_minutes is not None
        else int(featured_config.get("min_lead_minutes", 90))
    )

    sync_warnings: list[str] = []
    upserted_events_count = 0
    window_start_utc = now_utc
    window_end_utc = now_utc + timedelta(days=7)
    sportsdata_scores_cache: dict[tuple[str, date], list[dict[str, Any]]] = {}
    raw_snapshots_for_soccer: list[RawSnapshot] = []
    raw_snapshots_warnings: list[str] = []

    if provider == "sportsdata" and args.merge_raw_soccer:
        raw_snapshots_for_soccer, raw_snapshots_warnings = load_raw_snapshots_for_jornada(
            raw_dir=raw_dir,
            now_utc=now_utc,
            tz_name=tz_name,
        )
        sync_warnings.extend(raw_snapshots_warnings)

    if args.sync_calendar:
        if provider == "sportsdata":
            if sportsdata_client is None:
                raise RuntimeError("SportsData client is not configured")
            (
                calendar_events,
                calendar_warnings,
                (window_start_utc, window_end_utc),
                sportsdata_scores_cache,
            ) = fetch_calendar_events_sportsdata(
                client=sportsdata_client,
                config=config,
                now_utc=now_utc,
                sync_days_override=max(0, args.sportsdata_sync_days),
                tz_name=tz_name,
            )
        else:
            if odds_client is None:
                raise RuntimeError("Odds client is not configured")
            sports = [
                (sport_key, mapping.app_slug, mapping.league)
                for sport_key, mapping in sorted(config.sports.items())
                if mapping.app_slug in ALLOWED_APP_SLUGS
            ]
            calendar_events, calendar_warnings, (window_start_utc, window_end_utc) = fetch_calendar_events(
                client=odds_client,
                sports=sports,
                now_utc=now_utc,
                tz_name=tz_name,
            )
        sync_warnings.extend(calendar_warnings)

        if provider == "sportsdata" and args.merge_raw_soccer and raw_snapshots_for_soccer:
            raw_events, raw_event_warnings = build_calendar_events_from_raw_snapshots(
                snapshots=raw_snapshots_for_soccer,
                config=config,
                start_dt=window_start_utc,
                end_dt=window_end_utc,
                sport_slug_filter="soccer",
            )
            calendar_events = merge_events_without_duplicates([*calendar_events, *raw_events])
            sync_warnings.extend(raw_event_warnings)
            sync_warnings.append(
                f"Raw soccer merge enabled: merged {len(raw_events)} events from {raw_dir}.",
            )

        rows = [event.model_dump(mode="json") for event in calendar_events]
        upserted = upsert_events(
            supabase_url=supabase_url,
            service_role_key=supabase_service_role_key,
            rows=rows,
        )
        upserted_events_count = len(upserted)

    event_rows = list_events_for_window(
        supabase_url=supabase_url,
        service_role_key=supabase_service_role_key,
        from_iso=to_utc_z(window_start_utc),
        to_iso=to_utc_z(window_end_utc),
    )
    event_models = [
        model
        for model in (_to_event_model_from_db_row(row) for row in event_rows)
        if model is not None
    ]

    featured_rows_db: list[dict[str, Any]] = []
    featured_models: list[FeaturedSelectionModel] = []
    featured_warnings: list[str] = []
    featured_rationale: str | None = None

    if args.build_featured:
        featured_candidates = build_featured_candidates(
            events=event_models,
            now_utc=now_utc,
            featured_date=featured_date,
            min_lead_minutes=min_lead_minutes,
            tz_name=tz_name,
        )
        featured_models, selection_warnings, featured_rationale = select_featured_events(
            candidates=featured_candidates,
            featured_date=featured_date,
            seed=featured_seed,
            config=featured_config,
            use_openai=args.use_openai,
            openai_api_key=openai_api_key,
        )
        featured_warnings.extend(selection_warnings)

        featured_rows_db = replace_featured_events(
            supabase_url=supabase_url,
            service_role_key=supabase_service_role_key,
            featured_date=featured_date.isoformat(),
            rows=[
                {
                    "featured_date": row.featured_date,
                    "sport_slug": row.sport_slug,
                    "league": row.league,
                    "event_id": row.event_id,
                    "bucket": row.bucket,
                }
                for row in featured_models
            ],
        )
    else:
        featured_rows_db = list_featured_events_for_date(
            supabase_url=supabase_url,
            service_role_key=supabase_service_role_key,
            featured_date=featured_date.isoformat(),
        )

    upserted_pack_id: str | None = None
    pack_summary: dict[str, Any] | None = None
    pack_output: str | None = None
    generation_warnings: list[str] = []

    if args.generate_featured_picks:
        featured_models = [
            FeaturedSelectionModel(
                event_id=str(row.get("event_id") or ""),
                featured_date=str(row.get("featured_date") or featured_date.isoformat()),
                sport_slug=str(row.get("sport_slug") or ""),
                league=(str(row.get("league")) if row.get("league") is not None else None),
                bucket=str(row.get("bucket") or "week_rest"),
            )
            for row in featured_rows_db
            if isinstance(row, dict) and row.get("event_id")
        ]
        if not featured_models:
            generation_warnings.append("No featured events available to generate picks.")
        else:
            start_dt = window_start_utc
            end_dt = window_end_utc
            odds_candidates: list[CandidatePick] = []
            if provider == "sportsdata":
                if sportsdata_client is None:
                    raise RuntimeError("SportsData client is not configured")
                odds_candidates, provider_warnings = build_candidates_from_sportsdata(
                    client=sportsdata_client,
                    config=config,
                    mode="daily",
                    markets=markets,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    tz_name=tz_name,
                    scores_cache=sportsdata_scores_cache,
                )
                generation_warnings.extend(provider_warnings)
                if args.merge_raw_soccer and raw_snapshots_for_soccer:
                    soccer_candidates_raw, soccer_raw_warnings = build_candidates_from_raw_snapshots_by_slug(
                        snapshots=raw_snapshots_for_soccer,
                        markets=markets,
                        start_dt=start_dt,
                        end_dt=end_dt,
                        sport_slug_filter="soccer",
                        config=config,
                    )
                    generation_warnings.extend(soccer_raw_warnings)
                    odds_candidates = merge_candidates_without_duplicates(
                        [*odds_candidates, *soccer_candidates_raw],
                    )
                    generation_warnings.append(
                        f"Raw soccer merge enabled: merged {len(soccer_candidates_raw)} soccer candidates from {raw_dir}.",
                    )
            else:
                if odds_client is None:
                    raise RuntimeError("Odds client is not configured")
                for sport_key in sorted(config.sports.keys()):
                    mapping = config.sports[sport_key]
                    if mapping.app_slug not in ALLOWED_APP_SLUGS:
                        continue
                    try:
                        response_payload, _headers = odds_client.get_odds(
                            sport_key=sport_key,
                            regions=regions,
                            markets=markets,
                            commence_time_from=start_dt,
                            commence_time_to=end_dt,
                            bookmakers=bookmakers,
                        )
                    except OddsApiClientError as error:
                        generation_warnings.append(
                            f"Skipping sport_key={sport_key}: odds fetch failed ({error})",
                        )
                        continue

                    write_raw_response(
                        outdir=outdir,
                        mode="daily",
                        sport_key=sport_key,
                        fetched_at=now_utc,
                        response_payload=response_payload,
                        request_context={
                            "regions": regions,
                            "markets": markets,
                            "bookmakers": bookmakers,
                            "commenceTimeFrom": to_utc_z(start_dt),
                            "commenceTimeTo": to_utc_z(end_dt),
                            "oddsFormat": "decimal",
                            "dateFormat": "iso",
                        },
                    )

                    sport_candidates, warnings = build_candidates(
                        raw_events=response_payload,
                        sport_key=sport_key,
                        app_slug=mapping.app_slug,
                        fallback_league=mapping.league,
                        markets=markets,
                    )
                    odds_candidates.extend(sport_candidates)
                    generation_warnings.extend(warnings)

                odds_candidates = deduplicate_candidates(odds_candidates)
            selected_candidates, select_warnings = _select_featured_candidates_with_odds(
                featured_rows=featured_models,
                event_rows=event_models,
                all_candidates=odds_candidates,
                markets=markets,
                seed=featured_seed,
                max_markets_per_event=max(1, args.max_markets_per_event),
                featured_date=featured_date,
                tz_name=tz_name,
            )
            generation_warnings.extend(select_warnings)

            if selected_candidates:
                payload = build_payload(
                    round_id=args.round_id,
                    mode="daily",
                    candidates=selected_candidates,
                    regions=regions,
                )
                summary = summarize_payload(payload)
                output_file = write_import_payload(
                    outdir=outdir,
                    mode="daily",
                    now_utc=now_utc,
                    payload=payload,
                )
                if args.persist_supabase:
                    upserted_pack_id = upsert_pick_pack(
                        supabase_url=supabase_url,
                        service_role_key=supabase_service_role_key,
                        round_id=args.round_id,
                        pack_type="daily",
                        anchor_date=featured_date.isoformat(),
                        seed=build_seed("daily", featured_date, args.round_id),
                        payload=payload.model_dump(mode="json"),
                        summary=summary,
                    )
                pack_summary = summary
                pack_output = str(output_file)
            else:
                generation_warnings.append("No picks generated from featured events (no odds candidates).")

    print(
        json.dumps(
            {
                "mode": "featured_pipeline",
                "featured_date": featured_date.isoformat(),
                "sync_calendar": args.sync_calendar,
                "build_featured": args.build_featured,
                "generate_featured_picks": args.generate_featured_picks,
                "seed": featured_seed,
                "upserted_events_count": upserted_events_count,
                "featured_selected": len(featured_rows_db),
                "featured_openai_rationale": featured_rationale,
                "pick_pack_id": upserted_pack_id,
                "pick_pack_summary": pack_summary,
                "pick_pack_output": pack_output,
                "warnings": sync_warnings + featured_warnings + generation_warnings,
            },
            indent=2,
        ),
    )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    # Load local environment files used by the repo and fallback to generic .env.
    load_dotenv(".env.local")
    load_dotenv(".env")
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args(argv)

    provider = args.provider
    odds_api_key = os.getenv("ODDS_API_KEY")
    odds_api_base_url = os.getenv("ODDS_API_BASE_URL", "https://api.the-odds-api.com")
    sportsdata_api_key = os.getenv("SPORTSDATA_API_KEY")
    sportsdata_base_url = os.getenv("SPORTSDATA_BASE_URL", "https://api.sportsdata.io/v3")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    supabase_url = args.supabase_url or os.getenv("SUPABASE_URL")
    supabase_service_role_key = (
        args.supabase_service_role_key or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
    odds_client: OddsApiClient | None = None
    sportsdata_client: SportsDataClient | None = None

    if provider == "theodds":
        if not odds_api_key:
            raise RuntimeError("ODDS_API_KEY is required when --provider=theodds")
        odds_client = OddsApiClient(api_key=odds_api_key, base_url=odds_api_base_url)
    elif provider == "sportsdata":
        if not sportsdata_api_key:
            raise RuntimeError("SPORTSDATA_API_KEY is required when --provider=sportsdata")
        sportsdata_client = SportsDataClient(
            api_key=sportsdata_api_key,
            base_url=sportsdata_base_url,
        )
    else:
        raise RuntimeError(f"Unsupported provider: {provider}")

    if args.build_sports_map:
        if provider != "theodds":
            raise RuntimeError("--build-sports-map currently supports only --provider=theodds")
        if odds_client is None:
            raise RuntimeError("Odds client is not configured")
        return run_build_sports_map(
            client=odds_client,
            mode=args.mode,
            base_path=Path(args.base),
            out_path=Path(args.out),
            use_openai=args.use_openai,
            openai_api_key=openai_api_key,
        )

    if not args.round_id:
        raise RuntimeError("--round-id is required unless --build-sports-map is set")

    markets = parse_csv_list(args.markets)
    regions = parse_csv_list(args.regions)
    bookmakers = parse_csv_list(args.bookmakers)

    if not markets:
        raise RuntimeError("At least one market is required")

    if not regions:
        raise RuntimeError("At least one region is required")

    sports_config_value = args.sports_config
    if provider == "sportsdata" and sports_config_value == DEFAULT_SPORTS_CONFIG:
        sports_config_value = "tools/odds_generator/config/sportsdata_map.base.yaml"

    sports_config_paths = parse_path_list(sports_config_value)
    if not sports_config_paths:
        raise RuntimeError("At least one --sports-config path is required")

    config, config_warnings = load_and_merge_sports_configs(
        sports_config_paths,
        allow_missing_files=len(sports_config_paths) > 1,
    )

    daily_target = args.daily_target or config.limits.daily_default_target
    weekly_target = args.weekly_target or config.limits.weekly_default_target
    daily_target, weekly_target = validate_targets(
        daily_target,
        weekly_target,
        config.limits.daily_max,
        config.limits.weekly_max,
    )

    outdir = Path(args.outdir)
    raw_dir = Path(args.raw_dir) if args.raw_dir else outdir / "raw"
    now_utc = utc_now()
    timezone_name = "Europe/Madrid"

    if args.sync_calendar or args.build_featured or args.generate_featured_picks:
        return _run_featured_pipeline(
            args=args,
            provider=provider,
            odds_client=odds_client,
            sportsdata_client=sportsdata_client,
            config=config,
            openai_api_key=openai_api_key,
            supabase_url=supabase_url,
            supabase_service_role_key=supabase_service_role_key,
            outdir=outdir,
            markets=markets,
            regions=regions,
            bookmakers=bookmakers,
            raw_dir=raw_dir,
        )

    raw_snapshots: list[RawSnapshot] = []
    raw_snapshot_warnings: list[str] = []
    if args.source == "raw-jornada":
        raw_snapshots, raw_snapshot_warnings = load_raw_snapshots_for_jornada(
            raw_dir=raw_dir,
            now_utc=now_utc,
            tz_name=timezone_name,
        )

    for mode in iter_modes(args.mode):
        window = window_for_mode(mode, now_utc)
        anchor_date = anchor_date_for_mode(mode, now_utc, tz_name=timezone_name)
        seed = build_seed(mode, anchor_date, args.round_id)
        start_dt = parse_utc_iso(window.start_iso)
        end_dt = parse_utc_iso(window.end_iso)
        if start_dt is None or end_dt is None:
            raise RuntimeError("Failed to build time window")

        mode_warnings: list[str] = list(config_warnings)
        mode_candidates: list[CandidatePick] = []

        if args.source == "raw-jornada":
            mode_warnings.extend(raw_snapshot_warnings)
            mode_warnings.append(
                f"Using raw-jornada source from {raw_dir} with {len(raw_snapshots)} snapshots.",
            )
            mode_candidates, raw_warnings = build_candidates_from_raw_snapshots(
                snapshots=raw_snapshots,
                mode=mode,
                config=config,
                markets=markets,
                start_dt=start_dt,
                end_dt=end_dt,
            )
            mode_warnings.extend(raw_warnings)
        else:
            if provider == "sportsdata":
                if sportsdata_client is None:
                    raise RuntimeError("SportsData client is not configured")
                mode_candidates, provider_warnings = build_candidates_from_sportsdata(
                    client=sportsdata_client,
                    config=config,
                    mode=mode,
                    markets=markets,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    tz_name=timezone_name,
                )
                mode_warnings.extend(provider_warnings)
            else:
                if odds_client is None:
                    raise RuntimeError("Odds client is not configured")
                for sport_key in sorted(config.sports.keys()):
                    mapping = config.sports[sport_key]
                    if not should_use_sport_for_mode(
                        mode,
                        allow_daily=mapping.allow_daily,
                        allow_weekly=mapping.allow_weekly,
                    ):
                        continue

                    if mapping.app_slug not in ALLOWED_APP_SLUGS:
                        mode_warnings.append(
                            f"Skipping sport_key={sport_key}: app_slug '{mapping.app_slug}' not allowed",
                        )
                        continue

                    try:
                        response_payload, _headers = odds_client.get_odds(
                            sport_key=sport_key,
                            regions=regions,
                            markets=markets,
                            commence_time_from=start_dt,
                            commence_time_to=end_dt,
                            bookmakers=bookmakers,
                        )
                    except OddsApiClientError as error:
                        mode_warnings.append(
                            f"Skipping sport_key={sport_key}: odds fetch failed ({error})",
                        )
                        continue

                    write_raw_response(
                        outdir=outdir,
                        mode=mode,
                        sport_key=sport_key,
                        fetched_at=now_utc,
                        response_payload=response_payload,
                        request_context={
                            "regions": regions,
                            "markets": markets,
                            "bookmakers": bookmakers,
                            "commenceTimeFrom": window.start_iso,
                            "commenceTimeTo": window.end_iso,
                            "oddsFormat": "decimal",
                            "dateFormat": "iso",
                        },
                    )

                    sport_candidates, warnings = build_candidates(
                        raw_events=response_payload,
                        sport_key=sport_key,
                        app_slug=mapping.app_slug,
                        fallback_league=mapping.league,
                        markets=markets,
                    )
                    mode_candidates.extend(sport_candidates)
                    mode_warnings.extend(warnings)

                mode_candidates = deduplicate_candidates(mode_candidates)

        target = daily_target if mode == "daily" else weekly_target
        selected, rationale, selection_warnings = select_candidates(
            candidates=mode_candidates,
            target=target,
            use_openai=args.use_openai,
            openai_api_key=openai_api_key,
            mode=mode,
            seed=seed,
        )
        mode_warnings.extend(selection_warnings)
        if not selected:
            raise RuntimeError(
                f"No valid candidates selected for mode='{mode}'. "
                "Check sports/markets configuration and API responses.",
            )

        payload = build_payload(
            round_id=args.round_id,
            mode=mode,
            candidates=selected,
            regions=regions,
        )

        output_file = write_import_payload(
            outdir=outdir,
            mode=mode,
            now_utc=now_utc,
            payload=payload,
        )

        summary = summarize_payload(payload)
        upserted_row_id: str | None = None

        if args.persist_supabase:
            if not supabase_url:
                raise RuntimeError("SUPABASE_URL is required when --persist-supabase=true")
            if not supabase_service_role_key:
                raise RuntimeError(
                    "SUPABASE_SERVICE_ROLE_KEY is required when --persist-supabase=true",
                )

            upserted_row_id = upsert_pick_pack(
                supabase_url=supabase_url,
                service_role_key=supabase_service_role_key,
                round_id=args.round_id,
                pack_type=mode,
                anchor_date=anchor_date.isoformat(),
                seed=seed,
                payload=payload.model_dump(mode="json"),
                summary=summary,
            )

        print(json.dumps({
            "mode": mode,
            "pack_type": mode,
            "anchor_date": anchor_date.isoformat(),
            "seed": seed,
            "target": target,
            "selected": len(selected),
            "summary": summary,
            "output": str(output_file),
            "upserted_row_id": upserted_row_id,
            "warnings": mode_warnings,
            "openai_rationale": rationale,
        }, indent=2))

    return 0
