from __future__ import annotations

import json
from collections import Counter
from collections.abc import Sequence
from typing import Any

import httpx

from .models import CandidatePick, compact_candidate

FOOTBALL_SPORT_SLUG = "soccer"
MIN_SPORTS_TARGET = 5
MIN_PICKS_PER_SPORT = 5
FOOTBALL_MIN_PICKS = 10


def _base_score(candidate: CandidatePick) -> float:
    distance = abs(candidate.mean_odds - 2.2)
    safe_distance = max(distance, 1e-6)
    return 1.0 / safe_distance


def _candidate_sort_key(candidate: CandidatePick) -> tuple[str, str, str]:
    return (candidate.start_time, candidate.sport_slug, candidate.candidate_id)


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


def _sport_order_key(
    sport_slug: str,
    sport_counts: Counter[str],
) -> tuple[int, int, str]:
    return (
        0 if sport_slug == FOOTBALL_SPORT_SLUG else 1,
        -sport_counts[sport_slug],
        sport_slug,
    )


def _apply_distribution(
    ranked_candidates: Sequence[CandidatePick],
    target: int,
) -> list[CandidatePick]:
    if target <= 0:
        return []

    by_sport: dict[str, list[CandidatePick]] = {}
    for candidate in ranked_candidates:
        by_sport.setdefault(candidate.sport_slug, []).append(candidate)

    if not by_sport:
        return []

    sport_counts = Counter({sport_slug: len(items) for sport_slug, items in by_sport.items()})
    ordered_sports = sorted(by_sport.keys(), key=lambda sport_slug: _sport_order_key(sport_slug, sport_counts))
    selected_sports = ordered_sports[: min(MIN_SPORTS_TARGET, len(ordered_sports))]

    min_quota = MIN_PICKS_PER_SPORT
    if len(selected_sports) * min_quota > target:
        min_quota = max(1, target // len(selected_sports))

    selected: list[CandidatePick] = []
    selected_ids: set[str] = set()

    def take_for_sport(sport_slug: str, amount: int) -> int:
        taken = 0
        for candidate in by_sport.get(sport_slug, []):
            if len(selected) >= target:
                break
            if candidate.candidate_id in selected_ids:
                continue

            selected.append(candidate)
            selected_ids.add(candidate.candidate_id)
            taken += 1
            if taken >= amount:
                break
        return taken

    for sport_slug in selected_sports:
        take_for_sport(sport_slug, min_quota)

    if FOOTBALL_SPORT_SLUG in selected_sports and len(selected) < target:
        football_count = sum(
            1 for candidate in selected if candidate.sport_slug == FOOTBALL_SPORT_SLUG
        )
        extra_needed = max(0, FOOTBALL_MIN_PICKS - football_count)
        take_for_sport(FOOTBALL_SPORT_SLUG, extra_needed)

    if len(selected) < target:
        for candidate in ranked_candidates:
            if candidate.candidate_id in selected_ids:
                continue
            selected.append(candidate)
            selected_ids.add(candidate.candidate_id)
            if len(selected) >= target:
                break

    return selected[:target]


def select_candidates_heuristic(
    candidates: Sequence[CandidatePick],
    target: int,
) -> list[CandidatePick]:
    ranked = _heuristic_ranked_order(candidates, len(candidates))
    return _apply_distribution(ranked, target)


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
        response = client.post(f"{base_url.rstrip('/')}/chat/completions", headers=headers, json=body)

    if response.status_code >= 400:
        raise RuntimeError(f"OpenAI ranking failed: {response.status_code} {response.text}")

    payload = response.json()
    content = (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "{}")
    )

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
) -> tuple[list[CandidatePick], str | None]:
    ordered_candidates = sorted(candidates, key=_candidate_sort_key)

    if not use_openai:
        return select_candidates_heuristic(ordered_candidates, target), None

    if not openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required when --use-openai=true")

    try:
        ranked_ids, rationale = rank_candidate_ids_with_openai(
            ordered_candidates,
            target,
            openai_api_key,
        )
    except Exception as error:
        fallback = select_candidates_heuristic(ordered_candidates, target)
        return fallback, f"OpenAI ranking failed; fell back to heuristic: {error}"

    by_id = {candidate.candidate_id: candidate for candidate in ordered_candidates}

    selected = [by_id[candidate_id] for candidate_id in ranked_ids if candidate_id in by_id]

    if len(selected) < target:
        fallback = select_candidates_heuristic(ordered_candidates, target)
        selected_ids = {candidate.candidate_id for candidate in selected}
        for candidate in fallback:
            if candidate.candidate_id in selected_ids:
                continue
            selected.append(candidate)
            selected_ids.add(candidate.candidate_id)
            if len(selected) >= target:
                break

    return selected[:target], rationale
