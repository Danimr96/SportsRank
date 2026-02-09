from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
import yaml

from .models import SportConfigEntry, SportsMapConfig

MUST_HAVE_KEYS = (
    "soccer_spain_la_liga",
    "soccer_epl",
    "soccer_uefa_champs_league",
    "basketball_nba",
)

ALLOWED_EXTRA_GROUPS = {
    "Ice Hockey",
    "Basketball",
    "American Football",
    "MMA",
    "Boxing",
}

GROUP_TO_APP_SLUG = {
    "Ice Hockey": "hockey",
    "Basketball": "basketball",
    "American Football": "american-football",
    "MMA": "combat",
    "Boxing": "combat",
}

DEFAULT_ALLOWED_APP_SLUGS = {
    "soccer",
    "basketball",
    "tennis",
    "golf",
    "motor",
    "american-football",
    "baseball",
    "hockey",
    "combat",
}


@dataclass(frozen=True)
class CatalogSport:
    key: str
    group: str
    title: str
    description: str
    active: bool
    has_outrights: bool


def _normalize_config_payload(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("sports config must be a YAML object")

    if "sports" in raw:
        return raw

    return {"sports": raw}


def load_sports_config_file(path: Path) -> SportsMapConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    payload = _normalize_config_payload(raw)
    return SportsMapConfig.model_validate(payload)


def merge_sports_configs(configs: Sequence[SportsMapConfig]) -> SportsMapConfig:
    if not configs:
        raise ValueError("At least one sports config is required")

    merged: dict[str, SportConfigEntry] = {}
    for config in configs:
        for sport_key, entry in config.sports.items():
            # First config wins; later files can only add new keys.
            if sport_key in merged:
                continue
            merged[sport_key] = entry

    return SportsMapConfig(sports=merged, limits=configs[0].limits)


def load_and_merge_sports_configs(
    paths: Sequence[Path],
    allow_missing_files: bool,
) -> tuple[SportsMapConfig, list[str]]:
    warnings: list[str] = []
    configs: list[SportsMapConfig] = []

    for path in paths:
        if not path.exists():
            if allow_missing_files:
                warnings.append(f"Config file not found and skipped: {path}")
                continue
            raise FileNotFoundError(f"Sports config file not found: {path}")

        configs.append(load_sports_config_file(path))

    if not configs:
        raise ValueError("No readable sports config files found")

    return merge_sports_configs(configs), warnings


def write_sports_map_yaml(path: Path, sports: dict[str, SportConfigEntry]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    serialized = {
        sport_key: {
            "app_slug": entry.app_slug,
            "league": entry.league,
            "allow_daily": bool(entry.allow_daily),
            "allow_weekly": bool(entry.allow_weekly),
        }
        for sport_key, entry in sorted(sports.items(), key=lambda item: item[0])
    }

    yaml_text = yaml.safe_dump(
        serialized,
        sort_keys=True,
        default_flow_style=False,
        allow_unicode=False,
    )
    path.write_text(yaml_text, encoding="utf-8")


def parse_catalog(raw_catalog: Sequence[dict[str, Any]]) -> list[CatalogSport]:
    parsed: list[CatalogSport] = []

    for item in raw_catalog:
        key = item.get("key")
        if not isinstance(key, str) or len(key.strip()) == 0:
            continue

        parsed.append(
            CatalogSport(
                key=key,
                group=str(item.get("group") or "Unknown"),
                title=str(item.get("title") or key),
                description=str(item.get("description") or ""),
                active=bool(item.get("active", False)),
                has_outrights=bool(item.get("has_outrights", False)),
            ),
        )

    return sorted(parsed, key=lambda sport: sport.key)


def allow_flags_for_mode(mode: str) -> tuple[bool, bool]:
    if mode == "daily":
        return True, False
    if mode == "weekly":
        return False, True
    return True, True


def _contains_any(text: str, needles: Sequence[str]) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in needles)


def _tennis_priority(item: CatalogSport) -> tuple[int, str]:
    text = f"{item.key} {item.title} {item.description}".lower()
    singles_priority = 0 if "singles" in text else 1
    return singles_priority, item.key


def _pick_first(items: Sequence[CatalogSport]) -> CatalogSport | None:
    return sorted(items, key=_tennis_priority)[0] if items else None


def select_tennis_keys_deterministic(active_catalog: Sequence[CatalogSport]) -> list[str]:
    tennis_candidates = [
        item
        for item in active_catalog
        if item.key.startswith("tennis_") and not item.has_outrights
    ]

    if not tennis_candidates:
        return []

    def with_text(item: CatalogSport) -> str:
        return f"{item.key} {item.title} {item.description}".lower()

    wta_candidates = [item for item in tennis_candidates if _contains_any(with_text(item), ["wta", "women"]) ]
    atp_candidates = [item for item in tennis_candidates if _contains_any(with_text(item), ["atp", "men"]) ]

    selected: list[str] = []

    wta = _pick_first(wta_candidates)
    if wta is not None:
        selected.append(wta.key)

    atp = _pick_first([item for item in atp_candidates if item.key not in selected])
    if atp is not None:
        selected.append(atp.key)

    if len(selected) < 2:
        for candidate in sorted(tennis_candidates, key=_tennis_priority):
            if candidate.key in selected:
                continue
            selected.append(candidate.key)
            if len(selected) >= 2:
                break

    return selected


def _extra_priority(item: CatalogSport) -> tuple[int, str]:
    text = f"{item.key} {item.title} {item.description}".lower()
    rules = [
        ("nhl", 0),
        ("euroleague", 1),
        ("nfl", 2),
        ("mma", 3),
        ("boxing", 4),
        ("ncaab", 5),
    ]

    for token, rank in rules:
        if token in text:
            return rank, item.key

    return 100, item.key


def select_extra_key_deterministic(
    active_catalog: Sequence[CatalogSport],
    excluded_keys: set[str],
    allowed_app_slugs: set[str],
) -> tuple[str | None, list[str]]:
    warnings: list[str] = []

    candidates = [
        item
        for item in active_catalog
        if item.key not in excluded_keys
        and item.group in ALLOWED_EXTRA_GROUPS
        and not item.has_outrights
    ]

    for item in sorted(candidates, key=_extra_priority):
        mapped_slug = GROUP_TO_APP_SLUG.get(item.group)
        if mapped_slug not in allowed_app_slugs:
            warnings.append(
                f"Skipping extra sport key '{item.key}' because app_slug '{mapped_slug}' "
                "is not in allowed app slugs.",
            )
            continue

        return item.key, warnings

    return None, warnings


def _must_have_app_slug(sport_key: str) -> str:
    if sport_key.startswith("soccer_"):
        return "soccer"
    if sport_key == "basketball_nba":
        return "basketball"
    return "soccer"


def _validate_openai_tennis_keys(
    keys: Sequence[str],
    active_by_key: dict[str, CatalogSport],
) -> list[str]:
    selected: list[str] = []
    for key in keys:
        item = active_by_key.get(key)
        if item is None:
            continue
        if item.has_outrights or not item.key.startswith("tennis_"):
            continue
        if key in selected:
            continue
        selected.append(key)
        if len(selected) >= 2:
            break
    return selected


def _validate_openai_extra_key(
    key: str | None,
    active_by_key: dict[str, CatalogSport],
    excluded_keys: set[str],
    allowed_app_slugs: set[str],
) -> str | None:
    if not key:
        return None

    item = active_by_key.get(key)
    if item is None:
        return None
    if item.key in excluded_keys:
        return None
    if item.has_outrights:
        return None
    if item.group not in ALLOWED_EXTRA_GROUPS:
        return None

    mapped_slug = GROUP_TO_APP_SLUG.get(item.group)
    if mapped_slug not in allowed_app_slugs:
        return None

    return key


def select_with_openai(
    active_catalog: Sequence[CatalogSport],
    excluded_keys: set[str],
    use_openai: bool,
    openai_api_key: str | None,
) -> tuple[list[str], str | None, str | None]:
    if not use_openai:
        return [], None, None

    if not openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required when --use-openai=true")

    summary = [
        {
            "key": item.key,
            "group": item.group,
            "title": item.title,
            "description": item.description,
            "has_outrights": item.has_outrights,
        }
        for item in active_catalog
    ]

    system_prompt = (
        "Select sports keys from a catalog. "
        "Return JSON only with keys: tennis_keys (array), extra_key (string|null), rationale (string). "
        "Do not invent keys."
    )

    user_payload = {
        "rules": {
            "tennis": "Choose up to 2 tennis keys, preferring one WTA and one ATP.",
            "extra": "Choose 1 non-outrights key from Ice Hockey, Basketball, American Football, MMA, Boxing.",
            "excluded_keys": sorted(excluded_keys),
        },
        "catalog": summary,
    }

    body: dict[str, Any] = {
        "model": "gpt-4o-mini",
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(user_payload, separators=(",", ":")),
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {openai_api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=body,
        )

    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI sports-map selection failed: {response.status_code} {response.text}")

    payload = response.json()
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    parsed = json.loads(content)

    tennis_keys_raw = parsed.get("tennis_keys", [])
    extra_key_raw = parsed.get("extra_key")
    rationale = parsed.get("rationale")

    tennis_keys: list[str] = []
    if isinstance(tennis_keys_raw, list):
        tennis_keys = [key for key in tennis_keys_raw if isinstance(key, str)]

    extra_key = extra_key_raw if isinstance(extra_key_raw, str) else None
    rationale_str = rationale if isinstance(rationale, str) else None

    return tennis_keys, extra_key, rationale_str


def build_auto_sports_map(
    raw_catalog: Sequence[dict[str, Any]],
    base_sports: dict[str, SportConfigEntry],
    mode: str,
    use_openai: bool,
    openai_api_key: str | None,
    allowed_app_slugs: set[str] | None = None,
) -> tuple[dict[str, SportConfigEntry], list[str], str | None]:
    app_slugs = allowed_app_slugs or DEFAULT_ALLOWED_APP_SLUGS

    catalog = parse_catalog(raw_catalog)
    active_catalog = [item for item in catalog if item.active]
    active_by_key = {item.key: item for item in active_catalog}

    warnings: list[str] = []

    for sport_key in MUST_HAVE_KEYS:
        if sport_key not in active_by_key:
            warnings.append(
                f"Must-have key '{sport_key}' missing in active catalog. Keep it in base config.",
            )

    allow_daily_default, allow_weekly_default = allow_flags_for_mode(mode)
    auto_sports: dict[str, SportConfigEntry] = {}

    # Add must-have keys if they are not in base and are active.
    for sport_key in MUST_HAVE_KEYS:
        if sport_key in base_sports:
            continue

        item = active_by_key.get(sport_key)
        if item is None or item.has_outrights:
            continue

        auto_sports[sport_key] = SportConfigEntry(
            app_slug=_must_have_app_slug(sport_key),
            league=item.title,
            allow_daily=allow_daily_default,
            allow_weekly=allow_weekly_default,
        )

    excluded_keys = set(base_sports.keys()) | set(auto_sports.keys())

    tennis_keys_llm: list[str] = []
    extra_key_llm: str | None = None
    rationale: str | None = None

    if use_openai:
        try:
            tennis_keys_llm, extra_key_llm, rationale = select_with_openai(
                active_catalog=active_catalog,
                excluded_keys=excluded_keys,
                use_openai=True,
                openai_api_key=openai_api_key,
            )
        except Exception as error:
            warnings.append(
                f"OpenAI selection failed, falling back to deterministic selection: {error}",
            )

    tennis_keys = _validate_openai_tennis_keys(tennis_keys_llm, active_by_key)
    if not tennis_keys:
        tennis_keys = select_tennis_keys_deterministic(active_catalog)

    for tennis_key in tennis_keys:
        if tennis_key in excluded_keys:
            continue

        item = active_by_key.get(tennis_key)
        if item is None:
            continue

        auto_sports[tennis_key] = SportConfigEntry(
            app_slug="tennis",
            league=item.title,
            allow_daily=True,
            allow_weekly=True,
        )
        excluded_keys.add(tennis_key)

    extra_key = _validate_openai_extra_key(
        extra_key_llm,
        active_by_key,
        excluded_keys,
        app_slugs,
    )

    if extra_key is None:
        extra_key, extra_warnings = select_extra_key_deterministic(
            active_catalog,
            excluded_keys,
            app_slugs,
        )
        warnings.extend(extra_warnings)

    if extra_key is not None and extra_key not in excluded_keys:
        item = active_by_key[extra_key]
        mapped_slug = GROUP_TO_APP_SLUG[item.group]
        auto_sports[extra_key] = SportConfigEntry(
            app_slug=mapped_slug,
            league=item.title,
            allow_daily=allow_daily_default,
            allow_weekly=allow_weekly_default,
        )

    return auto_sports, warnings, rationale
