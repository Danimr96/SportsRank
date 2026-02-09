from __future__ import annotations

import argparse
import json
import os
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from .api_client import OddsApiClient, OddsApiClientError
from .models import (
    CandidateOption,
    CandidatePick,
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
from .sports_map import (
    DEFAULT_ALLOWED_APP_SLUGS,
    build_auto_sports_map,
    load_and_merge_sports_configs,
    load_sports_config_file,
    write_sports_map_yaml,
)
from .writer import write_import_payload, write_raw_response

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


@dataclass(frozen=True)
class Window:
    mode: Mode
    start_iso: str
    end_iso: str


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
    parser.add_argument("--mode", choices=["daily", "weekly", "both"], default="both")
    parser.add_argument(
        "--sports-config",
        default=DEFAULT_SPORTS_CONFIG,
    )
    parser.add_argument("--markets", default="h2h,totals,spreads")
    parser.add_argument("--regions", default="eu,uk,us")
    parser.add_argument("--bookmakers", default=None)
    parser.add_argument("--daily-target", type=int, default=None)
    parser.add_argument("--weekly-target", type=int, default=None)
    parser.add_argument("--outdir", default="./generated")
    parser.add_argument("--use-openai", type=parse_bool, default=False)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    # Load local environment files used by the repo and fallback to generic .env.
    load_dotenv(".env.local")
    load_dotenv(".env")
    load_dotenv()
    parser = build_parser()
    args = parser.parse_args(argv)

    odds_api_key = os.getenv("ODDS_API_KEY")
    if not odds_api_key:
        raise RuntimeError("ODDS_API_KEY is required")

    odds_api_base_url = os.getenv("ODDS_API_BASE_URL", "https://api.the-odds-api.com")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    client = OddsApiClient(api_key=odds_api_key, base_url=odds_api_base_url)

    if args.build_sports_map:
        return run_build_sports_map(
            client=client,
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

    sports_config_paths = parse_path_list(args.sports_config)
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
    now_utc = utc_now()

    for mode in iter_modes(args.mode):
        window = window_for_mode(mode, now_utc)
        start_dt = parse_utc_iso(window.start_iso)
        end_dt = parse_utc_iso(window.end_iso)
        if start_dt is None or end_dt is None:
            raise RuntimeError("Failed to build time window")

        mode_candidates: list[CandidatePick] = []
        mode_warnings: list[str] = list(config_warnings)

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
                response_payload, _headers = client.get_odds(
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
        print(json.dumps({
            "mode": mode,
            "target": target,
            "selected": len(selected),
            "summary": summary,
            "output": str(output_file),
            "warnings": mode_warnings,
            "openai_rationale": rationale,
        }, indent=2))

    return 0
