from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import yaml

from .models import EventModel, FeaturedSelectionModel, parse_utc_iso

FEATURED_BUCKETS = ("today", "tomorrow", "week_rest")

DEFAULT_FEATURED_CONFIG: dict[str, Any] = {
    "min_lead_minutes": 90,
    "soccer": {
        "la_liga": {
            "league_keywords": ["la liga", "spain"],
            "quotas": {"today": 3, "tomorrow": 3, "week_rest": 2},
        },
        "premier_league": {
            "league_keywords": ["premier league", "epl", "england"],
            "quotas": {"today": 3, "tomorrow": 3, "week_rest": 2},
        },
    },
    "basketball": {
        "nba": {
            "league_keywords": ["nba"],
            "quotas": {"today": 4, "tomorrow": 4, "week_rest": 2},
        }
    },
    "others": {"quotas": {"today": 2, "tomorrow": 2, "week_rest": 2}},
}


@dataclass(frozen=True)
class FeaturedEventCandidate:
    id: str
    sport_slug: str
    league: str
    start_time: str
    home: str | None
    away: str | None
    bucket: str


def load_featured_config(path: Path | None) -> dict[str, Any]:
    if path is None or not path.exists():
        return DEFAULT_FEATURED_CONFIG

    loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        return DEFAULT_FEATURED_CONFIG

    merged = json.loads(json.dumps(DEFAULT_FEATURED_CONFIG))
    for key, value in loaded.items():
        merged[key] = value
    return merged


def _normalize(value: str) -> str:
    return value.strip().lower().replace("_", " ")


def _contains_keywords(value: str, keywords: list[str]) -> bool:
    normalized = _normalize(value)
    return any(keyword in normalized for keyword in keywords)


def _score_with_seed(seed: str, value: str) -> float:
    digest = hashlib.sha256(f"{seed}|{value}".encode("utf-8")).digest()
    int_value = int.from_bytes(digest[:8], byteorder="big", signed=False)
    return int_value / 2**64


def _seed_rotation(seed: str, scope: str, size: int) -> int:
    if size <= 1:
        return 0

    parts = seed.split("|")
    base_value: int
    if len(parts) >= 2:
        try:
            base_value = date.fromisoformat(parts[1]).toordinal()
        except ValueError:
            digest = hashlib.sha256(seed.encode("utf-8")).digest()
            base_value = int.from_bytes(digest[:8], byteorder="big", signed=False)
    else:
        digest = hashlib.sha256(seed.encode("utf-8")).digest()
        base_value = int.from_bytes(digest[:8], byteorder="big", signed=False)

    scope_digest = hashlib.sha256(scope.encode("utf-8")).digest()
    scope_value = int.from_bytes(scope_digest[:4], byteorder="big", signed=False)
    return (base_value + scope_value) % size


def featured_anchor_date(now_utc: datetime, tz_name: str = "Europe/Madrid") -> date:
    return now_utc.astimezone(ZoneInfo(tz_name)).date()


def _bucket_from_start(
    *,
    start_time: datetime,
    featured_date: date,
    tz_name: str,
) -> str:
    local_date = start_time.astimezone(ZoneInfo(tz_name)).date()
    delta = (local_date - featured_date).days
    if delta <= 0:
        return "today"
    if delta == 1:
        return "tomorrow"
    return "week_rest"


def build_featured_candidates(
    *,
    events: list[EventModel],
    now_utc: datetime,
    featured_date: date,
    min_lead_minutes: int,
    tz_name: str = "Europe/Madrid",
) -> list[FeaturedEventCandidate]:
    cutoff = now_utc + timedelta(minutes=max(0, min_lead_minutes))
    candidates: list[FeaturedEventCandidate] = []

    for event in events:
        parsed = parse_utc_iso(event.start_time)
        if parsed is None:
            continue
        if parsed < cutoff:
            continue

        candidates.append(
            FeaturedEventCandidate(
                id=event.metadata.get("db_event_id", "") if isinstance(event.metadata, dict) else "",
                sport_slug=event.sport_slug,
                league=event.league,
                start_time=event.start_time,
                home=event.home,
                away=event.away,
                bucket=_bucket_from_start(
                    start_time=parsed,
                    featured_date=featured_date,
                    tz_name=tz_name,
                ),
            ),
        )

    return [candidate for candidate in candidates if candidate.id]


def _rank_ids_with_openai(
    *,
    api_key: str,
    candidates: list[FeaturedEventCandidate],
    config: dict[str, Any],
    featured_date: date,
    seed: str,
    model: str = "gpt-4o-mini",
) -> tuple[dict[str, Any], str | None]:
    payload_candidates = [
        {
            "id": candidate.id,
            "sport": candidate.sport_slug,
            "league": candidate.league,
            "start_time": candidate.start_time,
            "bucket": candidate.bucket,
            "event": f"{candidate.home or 'TBD'} vs {candidate.away or 'TBD'}",
        }
        for candidate in candidates
    ]

    system_prompt = (
        "Select featured sports events IDs from provided candidates. "
        "Return valid IDs only. Do not invent IDs. "
        "Respect quotas by bucket and football leagues."
    )
    user_prompt = {
        "featured_date": featured_date.isoformat(),
        "seed": seed,
        "quotas": config,
        "candidates": payload_candidates,
        "required_output": {
            "today": {"la_liga": [], "premier_league": [], "nba": [], "others": []},
            "tomorrow": {"la_liga": [], "premier_league": [], "nba": [], "others": []},
            "week_rest": {"la_liga": [], "premier_league": [], "nba": [], "others": []},
            "rationale": "short text",
        },
    }

    body = {
        "model": model,
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_prompt, separators=(",", ":"))},
        ],
    }

    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )

    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI featured selection failed: {response.status_code} {response.text}")

    parsed = response.json()
    content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    payload = json.loads(content)
    rationale = payload.get("rationale")
    return payload, rationale if isinstance(rationale, str) else None


def _pick_with_fallback(
    *,
    proposed_ids: list[str],
    fallback_pool: list[FeaturedEventCandidate],
    quota: int,
    selected_ids: set[str],
    seed: str,
    scope: str,
) -> list[str]:
    chosen: list[str] = []
    valid_ids = {candidate.id for candidate in fallback_pool}

    for event_id in proposed_ids:
        if event_id not in valid_ids:
            continue
        if event_id in selected_ids:
            continue
        chosen.append(event_id)
        selected_ids.add(event_id)
        if len(chosen) >= quota:
            return chosen

    score_ranked = sorted(
        fallback_pool,
        key=lambda item: (
            -_score_with_seed(seed, item.id),
            item.start_time,
            item.id,
        ),
    )
    offset = _seed_rotation(seed, scope, len(score_ranked))
    ranked_fallback = score_ranked[offset:] + score_ranked[:offset]

    for candidate in ranked_fallback:
        if candidate.id in selected_ids:
            continue
        chosen.append(candidate.id)
        selected_ids.add(candidate.id)
        if len(chosen) >= quota:
            break

    return chosen


def _league_pool(
    candidates: list[FeaturedEventCandidate],
    *,
    bucket: str,
    league_keywords: list[str],
) -> list[FeaturedEventCandidate]:
    return [
        candidate
        for candidate in candidates
        if candidate.bucket == bucket
        and candidate.sport_slug == "soccer"
        and _contains_keywords(candidate.league, league_keywords)
    ]


def _nba_pool(candidates: list[FeaturedEventCandidate], *, bucket: str, league_keywords: list[str]) -> list[FeaturedEventCandidate]:
    return [
        candidate
        for candidate in candidates
        if candidate.bucket == bucket
        and candidate.sport_slug == "basketball"
        and _contains_keywords(candidate.league, league_keywords)
    ]


def _others_pool(candidates: list[FeaturedEventCandidate], *, bucket: str) -> list[FeaturedEventCandidate]:
    return [
        candidate
        for candidate in candidates
        if candidate.bucket == bucket and candidate.sport_slug not in {"soccer", "basketball"}
    ]


def select_featured_events(
    *,
    candidates: list[FeaturedEventCandidate],
    featured_date: date,
    seed: str,
    config: dict[str, Any],
    use_openai: bool,
    openai_api_key: str | None,
) -> tuple[list[FeaturedSelectionModel], list[str], str | None]:
    warnings: list[str] = []
    rationale: str | None = None
    selected_ids: set[str] = set()

    proposed: dict[str, Any] = {}
    if use_openai and openai_api_key:
        try:
            proposed, rationale = _rank_ids_with_openai(
                api_key=openai_api_key,
                candidates=candidates,
                config=config,
                featured_date=featured_date,
                seed=seed,
            )
        except Exception as error:
            warnings.append(f"OpenAI featured selector failed, using deterministic fallback ({error})")

    selections: list[FeaturedSelectionModel] = []

    soccer_cfg = config.get("soccer", {})
    nba_cfg = config.get("basketball", {}).get("nba", {})
    others_cfg = config.get("others", {})

    for bucket in FEATURED_BUCKETS:
        bucket_proposed = proposed.get(bucket, {}) if isinstance(proposed, dict) else {}

        for league_key in ("la_liga", "premier_league"):
            league_cfg = soccer_cfg.get(league_key, {})
            league_keywords = league_cfg.get("league_keywords", [])
            quota = int(league_cfg.get("quotas", {}).get(bucket, 0))
            pool = _league_pool(candidates, bucket=bucket, league_keywords=league_keywords)
            proposed_ids = bucket_proposed.get(league_key, []) if isinstance(bucket_proposed, dict) else []
            picked = _pick_with_fallback(
                proposed_ids=proposed_ids if isinstance(proposed_ids, list) else [],
                fallback_pool=pool,
                quota=quota,
                selected_ids=selected_ids,
                seed=seed,
                scope=f"soccer:{league_key}:{bucket}",
            )
            if len(picked) < quota:
                warnings.append(f"football {league_key} {bucket}: requested {quota}, selected {len(picked)}")
            for event_id in picked:
                selections.append(
                    FeaturedSelectionModel(
                        event_id=event_id,
                        featured_date=featured_date.isoformat(),
                        sport_slug="soccer",
                        league=league_key,
                        bucket=bucket,
                    ),
                )

        nba_keywords = nba_cfg.get("league_keywords", ["nba"])
        nba_quota = int(nba_cfg.get("quotas", {}).get(bucket, 0))
        nba_pool = _nba_pool(candidates, bucket=bucket, league_keywords=nba_keywords)
        nba_ids = bucket_proposed.get("nba", []) if isinstance(bucket_proposed, dict) else []
        picked_nba = _pick_with_fallback(
            proposed_ids=nba_ids if isinstance(nba_ids, list) else [],
            fallback_pool=nba_pool,
            quota=nba_quota,
            selected_ids=selected_ids,
            seed=seed,
            scope=f"basketball:nba:{bucket}",
        )
        if len(picked_nba) < nba_quota:
            warnings.append(f"basketball nba {bucket}: requested {nba_quota}, selected {len(picked_nba)}")
        for event_id in picked_nba:
            selections.append(
                FeaturedSelectionModel(
                    event_id=event_id,
                    featured_date=featured_date.isoformat(),
                    sport_slug="basketball",
                    league="nba",
                    bucket=bucket,
                ),
            )

        others_quota = int(others_cfg.get("quotas", {}).get(bucket, 0))
        others_pool = _others_pool(candidates, bucket=bucket)
        others_ids = bucket_proposed.get("others", []) if isinstance(bucket_proposed, dict) else []
        picked_others = _pick_with_fallback(
            proposed_ids=others_ids if isinstance(others_ids, list) else [],
            fallback_pool=others_pool,
            quota=others_quota,
            selected_ids=selected_ids,
            seed=seed,
            scope=f"others:{bucket}",
        )
        if len(picked_others) < others_quota:
            warnings.append(f"others {bucket}: requested {others_quota}, selected {len(picked_others)}")
        by_id = {candidate.id: candidate for candidate in others_pool}
        for event_id in picked_others:
            event = by_id.get(event_id)
            selections.append(
                FeaturedSelectionModel(
                    event_id=event_id,
                    featured_date=featured_date.isoformat(),
                    sport_slug=event.sport_slug if event else "other",
                    league=event.league if event else None,
                    bucket=bucket,
                ),
            )

    return selections, warnings, rationale
