from __future__ import annotations

import json
from collections import Counter
from collections.abc import Callable, Sequence
from typing import Any

import httpx

from .models import CandidatePick, Mode, compact_candidate

FOOTBALL_SPORT_SLUG = "soccer"
BASKETBALL_SPORT_SLUG = "basketball"
TENNIS_SPORT_SLUG = "tennis"

DAILY_FOOTBALL_TARGET = 5
DAILY_NBA_TARGET = 5
DAILY_TENNIS_TARGET = 5
DAILY_OTHERS_TARGET = 5

WEEKLY_FOOTBALL_TARGET = 2
WEEKLY_NBA_TARGET = 5
WEEKLY_EUROLEAGUE_TARGET = 2
WEEKLY_TENNIS_WINNER_TARGET = 2
WEEKLY_OTHERS_TARGET = 5

FOOTBALL_PRIORITY_LEAGUES: list[tuple[str, tuple[str, ...]]] = [
    ("La Liga", ("la liga", "spain")),
    ("Premier League", ("premier league", "epl", "england")),
    ("Serie A", ("serie a", "italy")),
    ("Bundesliga", ("bundesliga", "germany")),
]

EUROPEAN_FOOTBALL_KEYWORDS = (
    "champions league",
    "uefa champions",
    "europa league",
    "uefa europa",
)
NBA_KEYWORDS = ("nba",)
EUROLEAGUE_KEYWORDS = ("euroleague",)
TENNIS_WINNER_KEYWORDS = ("winner", "outright", "futures", "tournament")
TENNIS_ATP_KEYWORDS = ("atp", "men")
TENNIS_WTA_KEYWORDS = ("wta", "women")


def _base_score(candidate: CandidatePick) -> float:
    distance = abs(candidate.mean_odds - 2.2)
    safe_distance = max(distance, 1e-6)
    return 1.0 / safe_distance


def _candidate_sort_key(candidate: CandidatePick) -> tuple[str, str, str]:
    return (candidate.start_time, candidate.sport_slug, candidate.candidate_id)


def _normalize(value: str) -> str:
    return value.strip().lower().replace("_", " ")


def _contains_any(value: str, keywords: Sequence[str]) -> bool:
    normalized = _normalize(value)
    return any(keyword in normalized for keyword in keywords)


def _is_football(candidate: CandidatePick) -> bool:
    return candidate.sport_slug == FOOTBALL_SPORT_SLUG


def _is_basketball(candidate: CandidatePick) -> bool:
    return candidate.sport_slug == BASKETBALL_SPORT_SLUG


def _is_tennis(candidate: CandidatePick) -> bool:
    return candidate.sport_slug == TENNIS_SPORT_SLUG


def _is_other_sport(candidate: CandidatePick) -> bool:
    return candidate.sport_slug not in {
        FOOTBALL_SPORT_SLUG,
        BASKETBALL_SPORT_SLUG,
        TENNIS_SPORT_SLUG,
    }


def _is_top_football_league(candidate: CandidatePick) -> bool:
    return _contains_any(
        candidate.league,
        tuple(keyword for _, keywords in FOOTBALL_PRIORITY_LEAGUES for keyword in keywords),
    )


def _is_european_football(candidate: CandidatePick) -> bool:
    return _contains_any(candidate.league, EUROPEAN_FOOTBALL_KEYWORDS)


def _is_nba(candidate: CandidatePick) -> bool:
    return _is_basketball(candidate) and _contains_any(candidate.league, NBA_KEYWORDS)


def _is_euroleague(candidate: CandidatePick) -> bool:
    return _is_basketball(candidate) and _contains_any(candidate.league, EUROLEAGUE_KEYWORDS)


def _is_tennis_tournament_winner(candidate: CandidatePick) -> bool:
    return _is_tennis(candidate) and (
        _contains_any(candidate.market, TENNIS_WINNER_KEYWORDS)
        or _contains_any(candidate.league, TENNIS_WINNER_KEYWORDS)
        or _contains_any(candidate.event, TENNIS_WINNER_KEYWORDS)
    )


def _is_tennis_atp_winner(candidate: CandidatePick) -> bool:
    return _is_tennis_tournament_winner(candidate) and (
        _contains_any(candidate.league, TENNIS_ATP_KEYWORDS)
        or _contains_any(candidate.event, TENNIS_ATP_KEYWORDS)
    )


def _is_tennis_wta_winner(candidate: CandidatePick) -> bool:
    return _is_tennis_tournament_winner(candidate) and (
        _contains_any(candidate.league, TENNIS_WTA_KEYWORDS)
        or _contains_any(candidate.event, TENNIS_WTA_KEYWORDS)
    )


def _is_daily_tennis(candidate: CandidatePick) -> bool:
    # Daily board prioritizes match picks over outrights.
    return _is_tennis(candidate) and not _is_tennis_tournament_winner(candidate)


def _heuristic_ranked_order(
    candidates: Sequence[CandidatePick],
    limit: int,
) -> list[CandidatePick]:
    remaining = sorted(candidates, key=_candidate_sort_key)
    ranked: list[CandidatePick] = []

    sport_counts: Counter[str] = Counter()
    market_counts: Counter[str] = Counter()
    event_counts: Counter[str] = Counter()

    for _ in range(min(limit, len(remaining))):
        best_candidate: CandidatePick | None = None
        best_score: float | None = None

        for candidate in remaining:
            variety_bonus = (0.35 / (1 + sport_counts[candidate.sport_slug])) + (
                0.2 / (1 + market_counts[candidate.market])
            )
            near_duplicate_penalty = 0.5 * event_counts[candidate.event_key]
            score = _base_score(candidate) + variety_bonus - near_duplicate_penalty

            if best_score is None or score > best_score:
                best_score = score
                best_candidate = candidate
            elif best_score is not None and score == best_score and best_candidate is not None:
                if _candidate_sort_key(candidate) < _candidate_sort_key(best_candidate):
                    best_candidate = candidate

        if best_candidate is None:
            break

        ranked.append(best_candidate)
        sport_counts[best_candidate.sport_slug] += 1
        market_counts[best_candidate.market] += 1
        event_counts[best_candidate.event_key] += 1
        remaining = [c for c in remaining if c.candidate_id != best_candidate.candidate_id]

    return ranked


def _take_from_ranked(
    ranked_candidates: Sequence[CandidatePick],
    selected: list[CandidatePick],
    selected_ids: set[str],
    *,
    limit: int,
    label: str,
    warnings: list[str],
    predicate: Callable[[CandidatePick], bool],
) -> int:
    if limit <= 0:
        return 0

    taken = 0
    for candidate in ranked_candidates:
        if candidate.candidate_id in selected_ids:
            continue
        if not predicate(candidate):
            continue

        selected.append(candidate)
        selected_ids.add(candidate.candidate_id)
        taken += 1
        if taken >= limit:
            break

    if taken < limit:
        warnings.append(
            f"{label}: requested {limit}, selected {taken} (insufficient candidates).",
        )

    return taken


def _apply_mode_portfolio_with_mode(
    ranked_candidates: Sequence[CandidatePick],
    target: int,
    mode: Mode,
) -> tuple[list[CandidatePick], list[str]]:
    if target <= 0:
        return [], []

    selected: list[CandidatePick] = []
    selected_ids: set[str] = set()
    warnings: list[str] = []

    def take(limit: int, label: str, predicate: Callable[[CandidatePick], bool]) -> int:
        if len(selected) >= target:
            return 0
        allowed = min(limit, target - len(selected))
        return _take_from_ranked(
            ranked_candidates,
            selected,
            selected_ids,
            limit=allowed,
            label=label,
            warnings=warnings,
            predicate=predicate,
        )

    if mode == "daily":
        for league_label, league_keywords in FOOTBALL_PRIORITY_LEAGUES:
            take(
                1,
                f"daily football coverage ({league_label})",
                lambda candidate, keywords=league_keywords: _is_football(candidate)
                and _contains_any(candidate.league, keywords),
            )

        football_selected = sum(1 for candidate in selected if _is_football(candidate))
        if football_selected < DAILY_FOOTBALL_TARGET:
            european_taken = take(
                DAILY_FOOTBALL_TARGET - football_selected,
                "daily football Europe priority",
                lambda candidate: _is_football(candidate) and _is_european_football(candidate),
            )
            football_selected += european_taken
        if football_selected < DAILY_FOOTBALL_TARGET:
            take(
                DAILY_FOOTBALL_TARGET - football_selected,
                "daily football fallback",
                _is_football,
            )

        take(DAILY_NBA_TARGET, "daily basketball (NBA)", _is_nba)
        take(DAILY_TENNIS_TARGET, "daily tennis", _is_daily_tennis)
        take(DAILY_OTHERS_TARGET, "daily other sports mix", _is_other_sport)
    else:
        european_taken = take(
            1,
            "weekly football (Europe priority)",
            lambda candidate: _is_football(candidate) and _is_european_football(candidate),
        )
        take(
            WEEKLY_FOOTBALL_TARGET - european_taken,
            "weekly football fallback",
            _is_football,
        )

        take(WEEKLY_NBA_TARGET, "weekly basketball (NBA)", _is_nba)
        take(WEEKLY_EUROLEAGUE_TARGET, "weekly basketball (Euroleague)", _is_euroleague)

        atp_taken = take(1, "weekly tennis winner (ATP)", _is_tennis_atp_winner)
        wta_taken = take(1, "weekly tennis winner (WTA)", _is_tennis_wta_winner)

        winners_selected = atp_taken + wta_taken
        if winners_selected < WEEKLY_TENNIS_WINNER_TARGET:
            winner_fallback = take(
                WEEKLY_TENNIS_WINNER_TARGET - winners_selected,
                "weekly tennis winner fallback",
                _is_tennis_tournament_winner,
            )
            winners_selected += winner_fallback

        if winners_selected < WEEKLY_TENNIS_WINNER_TARGET:
            fallback_need = WEEKLY_TENNIS_WINNER_TARGET - winners_selected
            fallback_taken = take(
                fallback_need,
                "weekly tennis match fallback",
                _is_tennis,
            )
            if fallback_taken > 0:
                warnings.append(
                    "weekly tennis: tournament-winner markets unavailable; fallback to match picks.",
                )

        take(WEEKLY_OTHERS_TARGET, "weekly other sports mix", _is_other_sport)

    # Fill with remaining best-ranked candidates until target.
    if len(selected) < target:
        for candidate in ranked_candidates:
            if candidate.candidate_id in selected_ids:
                continue
            selected.append(candidate)
            selected_ids.add(candidate.candidate_id)
            if len(selected) >= target:
                break

    return selected[:target], warnings


def select_candidates_heuristic(
    candidates: Sequence[CandidatePick],
    target: int,
    mode: Mode = "daily",
) -> list[CandidatePick]:
    ranked = _heuristic_ranked_order(candidates, len(candidates))
    selected, _warnings = _apply_mode_portfolio_with_mode(ranked, target, mode)
    return selected


def rank_candidate_ids_with_openai(
    candidates: Sequence[CandidatePick],
    target: int,
    api_key: str,
    model: str = "gpt-4o-mini",
    base_url: str = "https://api.openai.com/v1",
    timeout_seconds: float = 45.0,
) -> tuple[list[str], str | None]:
    compact = [compact_candidate(candidate) for candidate in candidates]

    system_prompt = (
        "Rank candidate IDs for betting-pick inclusion. "
        "You must only return IDs from the provided list. "
        "Never edit odds, never invent IDs."
    )
    user_prompt = {
        "target": target,
        "candidates": compact,
    }

    body: dict[str, Any] = {
        "model": model,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": (
                    "Return JSON with keys 'ranked_ids' (array of IDs) and 'rationale' "
                    "(short text).\n\n"
                    + json.dumps(user_prompt, separators=(",", ":"))
                ),
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json=body,
        )

    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI ranking failed: {response.status_code} {response.text}")

    payload = response.json()
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "{}")

    parsed = json.loads(content)
    ranked_ids_raw = parsed.get("ranked_ids", [])
    rationale = parsed.get("rationale")

    valid_ids = {candidate.candidate_id for candidate in candidates}
    ranked_ids = [candidate_id for candidate_id in ranked_ids_raw if candidate_id in valid_ids]

    # Keep ranked list unique and trimmed to target.
    seen: set[str] = set()
    deduped: list[str] = []
    for candidate_id in ranked_ids:
        if candidate_id in seen:
            continue
        seen.add(candidate_id)
        deduped.append(candidate_id)
        if len(deduped) >= target:
            break

    return deduped, rationale if isinstance(rationale, str) else None


def select_candidates(
    candidates: Sequence[CandidatePick],
    target: int,
    use_openai: bool,
    openai_api_key: str | None,
    mode: Mode = "daily",
) -> tuple[list[CandidatePick], str | None, list[str]]:
    ordered_candidates = sorted(candidates, key=_candidate_sort_key)

    if not use_openai:
        selected, warnings = _apply_mode_portfolio_with_mode(
            _heuristic_ranked_order(ordered_candidates, len(ordered_candidates)),
            target,
            mode,
        )
        return selected, None, warnings

    if not openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required when --use-openai=true")

    try:
        ranked_ids, rationale = rank_candidate_ids_with_openai(
            ordered_candidates,
            target,
            openai_api_key,
        )
    except Exception as error:
        fallback, warnings = _apply_mode_portfolio_with_mode(
            _heuristic_ranked_order(ordered_candidates, len(ordered_candidates)),
            target,
            mode,
        )
        warnings.append("OpenAI ranking failed and heuristic fallback was used.")
        return fallback, f"OpenAI ranking failed; fell back to heuristic: {error}", warnings

    by_id = {candidate.candidate_id: candidate for candidate in ordered_candidates}
    openai_ranked: list[CandidatePick] = [
        by_id[candidate_id] for candidate_id in ranked_ids if candidate_id in by_id
    ]

    if len(openai_ranked) < len(ordered_candidates):
        # Complete list deterministically for quota filling and fallback.
        fallback_ranked = _heuristic_ranked_order(ordered_candidates, len(ordered_candidates))
        seen_ids = {candidate.candidate_id for candidate in openai_ranked}
        for candidate in fallback_ranked:
            if candidate.candidate_id in seen_ids:
                continue
            openai_ranked.append(candidate)
            seen_ids.add(candidate.candidate_id)

    selected, warnings = _apply_mode_portfolio_with_mode(openai_ranked, target, mode)
    return selected, rationale, warnings
