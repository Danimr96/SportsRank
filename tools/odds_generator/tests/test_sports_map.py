from __future__ import annotations

from tools.odds_generator.models import SportConfigEntry, SportsMapConfig
from tools.odds_generator.sports_map import (
    DEFAULT_ALLOWED_APP_SLUGS,
    build_auto_sports_map,
    merge_sports_configs,
    parse_catalog,
    select_extra_key_deterministic,
    select_tennis_keys_deterministic,
)


def _catalog_fixture() -> list[dict[str, object]]:
    return [
        {
            "key": "soccer_epl",
            "group": "Soccer",
            "title": "EPL",
            "description": "English Premier League",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "soccer_spain_la_liga",
            "group": "Soccer",
            "title": "La Liga",
            "description": "Spanish La Liga",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "soccer_uefa_champs_league",
            "group": "Soccer",
            "title": "UEFA Champions League",
            "description": "Champions League",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "basketball_nba",
            "group": "Basketball",
            "title": "NBA",
            "description": "NBA",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "tennis_atp_aus_open_singles",
            "group": "Tennis",
            "title": "ATP Australian Open Singles",
            "description": "ATP singles",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "tennis_wta_aus_open_singles",
            "group": "Tennis",
            "title": "WTA Australian Open Singles",
            "description": "WTA singles",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "tennis_atp_winner",
            "group": "Tennis",
            "title": "ATP Winner",
            "description": "Outright futures",
            "active": True,
            "has_outrights": True,
        },
        {
            "key": "icehockey_nhl",
            "group": "Ice Hockey",
            "title": "NHL",
            "description": "NHL moneyline",
            "active": True,
            "has_outrights": False,
        },
        {
            "key": "basketball_euroleague",
            "group": "Basketball",
            "title": "Euroleague",
            "description": "Euroleague regular season",
            "active": True,
            "has_outrights": False,
        },
    ]


def test_tennis_selection_prefers_wta_and_atp() -> None:
    active_catalog = [item for item in parse_catalog(_catalog_fixture()) if item.active]
    selected = select_tennis_keys_deterministic(active_catalog)

    assert "tennis_atp_aus_open_singles" in selected
    assert "tennis_wta_aus_open_singles" in selected
    assert len(selected) == 2


def test_extra_selection_respects_priority_and_allowed_slugs() -> None:
    active_catalog = [item for item in parse_catalog(_catalog_fixture()) if item.active]

    # hockey maps to app_slug=hockey (unsupported by MVP slugs), so it is skipped.
    extra_key, _warnings = select_extra_key_deterministic(
        active_catalog,
        excluded_keys={"soccer_epl"},
        allowed_app_slugs={"soccer", "basketball", "tennis", "golf", "motor"},
    )

    assert extra_key == "basketball_euroleague"


def test_auto_map_never_selects_outrights() -> None:
    auto_sports, _warnings, _rationale = build_auto_sports_map(
        raw_catalog=_catalog_fixture(),
        base_sports={},
        mode="both",
        use_openai=False,
        openai_api_key=None,
        allowed_app_slugs={"soccer", "basketball", "tennis", "golf", "motor"},
    )

    assert "tennis_atp_winner" not in auto_sports


def test_extra_selection_skips_outrights() -> None:
    catalog = [
        {
            "key": "basketball_euroleague",
            "group": "Basketball",
            "title": "Euroleague",
            "description": "Euroleague outrights",
            "active": True,
            "has_outrights": True,
        },
        {
            "key": "basketball_ncaab",
            "group": "Basketball",
            "title": "NCAAB",
            "description": "NCAAB regular season",
            "active": True,
            "has_outrights": False,
        },
    ]
    active_catalog = [item for item in parse_catalog(catalog) if item.active]
    extra_key, _warnings = select_extra_key_deterministic(
        active_catalog,
        excluded_keys=set(),
        allowed_app_slugs={"soccer", "basketball", "tennis", "golf", "motor"},
    )

    assert extra_key == "basketball_ncaab"


def test_merge_preserves_base_on_conflict() -> None:
    base = SportsMapConfig.model_validate(
        {
            "sports": {
                "basketball_nba": {
                    "app_slug": "basketball",
                    "league": "NBA Base",
                    "allow_daily": True,
                    "allow_weekly": True,
                }
            }
        },
    )
    auto = SportsMapConfig.model_validate(
        {
            "sports": {
                "basketball_nba": {
                    "app_slug": "basketball",
                    "league": "NBA Auto",
                    "allow_daily": True,
                    "allow_weekly": False,
                },
                "tennis_atp_aus_open_singles": {
                    "app_slug": "tennis",
                    "league": "ATP",
                    "allow_daily": True,
                    "allow_weekly": True,
                },
            }
        },
    )

    merged = merge_sports_configs([base, auto])

    assert merged.sports["basketball_nba"] == SportConfigEntry(
        app_slug="basketball",
        league="NBA Base",
        allow_daily=True,
        allow_weekly=True,
    )
    assert "tennis_atp_aus_open_singles" in merged.sports


def test_default_allowed_slugs_include_expanded_sports() -> None:
    assert "american-football" in DEFAULT_ALLOWED_APP_SLUGS
    assert "baseball" in DEFAULT_ALLOWED_APP_SLUGS
    assert "hockey" in DEFAULT_ALLOWED_APP_SLUGS
    assert "combat" in DEFAULT_ALLOWED_APP_SLUGS
