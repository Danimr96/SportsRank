from __future__ import annotations

import hashlib
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
DAILY_TENNIS_MATCH_ATP_TARGET = 2
DAILY_TENNIS_MATCH_WTA_TARGET = 2
DAILY_TENNIS_WINNER_TARGET = 2
DAILY_OTHERS_TARGET = 5

WEEKLY_FOOTBALL_TARGET = 2
WEEKLY_NBA_TARGET = 2
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
TENNIS_ATP_KEYWORDS = ("atp",)
TENNIS_WTA_KEYWORDS = ("wta",)


def _base_score(candidate: CandidatePick) -> float:
    distance = abs(candidate.mean_odds - 2.2)
    safe_distance = max(distance, 1e-6)
    return 1.0 / safe_distance


def _candidate_sort_key(candidate: CandidatePick) -> tuple[str, str, str, str, str]:
    return (
        candidate.start_time,
        candidate.sport_slug,
        candidate.market,
        candidate.event,
        candidate.candidate_id,
    )


def _seed_tiebreak(seed: str | None, candidate_id: str) -> float:
    if not seed:
        return 0.0

    digest = hashlib.sha256(f"{seed}|{candidate_id}".encode("utf-8")).digest()
    integer = int.from_bytes(digest[:8], byteorder="big", signed=False)
    return integer / 2**64


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


def _football_league_priority(league: str) -> int:
    normalized = _normalize(league)
    for idx, (_label, keywords) in enumerate(FOOTBALL_PRIORITY_LEAGUES):
        if any(keyword in normalized for keyword in keywords):
            return idx

    if any(keyword in normalized for keyword in EUROPEAN_FOOTBALL_KEYWORDS):
        return len(FOOTBALL_PRIORITY_LEAGUES)

    return len(FOOTBALL_PRIORITY_LEAGUES) + 1


def _football_league_key(league: str) -> str:
    normalized = _normalize(league)
    for label, keywords in FOOTBALL_PRIORITY_LEAGUES:
        if any(keyword in normalized for keyword in keywords):
            return label.lower().replace(" ", "_")

    if "champions league" in normalized or "uefa champions" in normalized:
        return "uefa_champions_league"
    if "europa league" in normalized or "uefa europa" in normalized:
        return "uefa_europa_league"

    return normalized


def _order_weekly_with_football_league_priority(
    selected: Sequence[CandidatePick],
) -> list[CandidatePick]:
    football = [candidate for candidate in selected if _is_football(candidate)]
    non_football = [candidate for candidate in selected if not _is_football(candidate)]

    football_sorted = sorted(
        football,
        key=lambda candidate: (
            _football_league_priority(candidate.league),
            _normalize(candidate.league),
            candidate.start_time,
            candidate.event,
            candidate.market,
            candidate.candidate_id,
        ),
    )

    # Keep non-football picks in their original selected order.
    return football_sorted + non_football


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


def _is_tennis_atp_context(candidate: CandidatePick) -> bool:
    return _contains_any(candidate.league, TENNIS_ATP_KEYWORDS) or _contains_any(
        candidate.event,
        TENNIS_ATP_KEYWORDS,
    )


def _is_tennis_wta_context(candidate: CandidatePick) -> bool:
    return _contains_any(candidate.league, TENNIS_WTA_KEYWORDS) or _contains_any(
        candidate.event,
        TENNIS_WTA_KEYWORDS,
    )


def _is_tennis_atp_match(candidate: CandidatePick) -> bool:
    return _is_daily_tennis(candidate) and _is_tennis_atp_context(candidate)


def _is_tennis_wta_match(candidate: CandidatePick) -> bool:
    return _is_daily_tennis(candidate) and _is_tennis_wta_context(candidate)


def _is_daily_tennis(candidate: CandidatePick) -> bool:
    # Daily board prioritizes match picks over outrights.
    return _is_tennis(candidate) and not _is_tennis_tournament_winner(candidate)


def _heuristic_ranked_order(
    candidates: Sequence[CandidatePick],
    limit: int,
    seed: str | None = None,
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
            tiebreak = _seed_tiebreak(seed, candidate.candidate_id)
            score = (
                _base_score(candidate)
                + variety_bonus
                - near_duplicate_penalty
                + tiebreak * 1e-6
            )

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

    football_cap_per_league = 5 if mode == "daily" else 2
    football_league_counts: Counter[str] = Counter()
    basketball_counts: Counter[str] = Counter()
    tennis_daily_match_counts: Counter[str] = Counter()
    tennis_winner_counts: Counter[str] = Counter()

    def can_add_candidate(candidate: CandidatePick) -> bool:
        if _is_football(candidate):
            return football_league_counts[_football_league_key(candidate.league)] < football_cap_per_league

        if _is_basketball(candidate):
            if _is_nba(candidate):
                max_nba = DAILY_NBA_TARGET if mode == "daily" else WEEKLY_NBA_TARGET
                return basketball_counts["nba"] < max_nba
            if _is_euroleague(candidate):
                return mode == "weekly" and basketball_counts["euroleague"] < WEEKLY_EUROLEAGUE_TARGET
            # Keep basketball constrained to NBA / Euroleague.
            return False

        if _is_tennis(candidate):
            if _is_tennis_tournament_winner(candidate):
                if _is_tennis_atp_winner(candidate):
                    return tennis_winner_counts["atp"] < 1
                if _is_tennis_wta_winner(candidate):
                    return tennis_winner_counts["wta"] < 1
                return False

            if mode != "daily":
                return False

            if _is_tennis_atp_match(candidate):
                return tennis_daily_match_counts["atp"] < DAILY_TENNIS_MATCH_ATP_TARGET
            if _is_tennis_wta_match(candidate):
                return tennis_daily_match_counts["wta"] < DAILY_TENNIS_MATCH_WTA_TARGET
            return False

        return True

    def register_candidate(candidate: CandidatePick) -> None:
        if _is_football(candidate):
            football_league_counts[_football_league_key(candidate.league)] += 1
            return

        if _is_nba(candidate):
            basketball_counts["nba"] += 1
            return
        if _is_euroleague(candidate):
            basketball_counts["euroleague"] += 1
            return

        if _is_tennis_tournament_winner(candidate):
            if _is_tennis_atp_winner(candidate):
                tennis_winner_counts["atp"] += 1
            elif _is_tennis_wta_winner(candidate):
                tennis_winner_counts["wta"] += 1
            return

        if mode == "daily":
            if _is_tennis_atp_match(candidate):
                tennis_daily_match_counts["atp"] += 1
            elif _is_tennis_wta_match(candidate):
                tennis_daily_match_counts["wta"] += 1

    def take(limit: int, label: str, predicate: Callable[[CandidatePick], bool]) -> int:
        if limit <= 0 or len(selected) >= target:
            return 0

        allowed = min(limit, target - len(selected))
        taken = 0
        for candidate in ranked_candidates:
            if candidate.candidate_id in selected_ids:
                continue
            if not predicate(candidate):
                continue
            if not can_add_candidate(candidate):
                continue

            selected.append(candidate)
            selected_ids.add(candidate.candidate_id)
            register_candidate(candidate)
            taken += 1
            if taken >= allowed:
                break

        if taken < allowed:
            warnings.append(
                f"{label}: requested {allowed}, selected {taken} (insufficient candidates).",
            )

        return taken

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

        nba_taken = take(DAILY_NBA_TARGET, "daily basketball (NBA)", _is_nba)
        tennis_match_atp_taken = take(
            DAILY_TENNIS_MATCH_ATP_TARGET,
            "daily tennis ATP matches",
            _is_tennis_atp_match,
        )
        tennis_match_wta_taken = take(
            DAILY_TENNIS_MATCH_WTA_TARGET,
            "daily tennis WTA matches",
            _is_tennis_wta_match,
        )
        atp_winner_daily = take(1, "daily tennis winner (ATP)", _is_tennis_atp_winner)
        wta_winner_daily = take(1, "daily tennis winner (WTA)", _is_tennis_wta_winner)
        other_taken = take(DAILY_OTHERS_TARGET, "daily other sports mix", _is_other_sport)

        # Reallocate missing quotas to football first, then basketball.
        missing_quota = (
            max(0, DAILY_NBA_TARGET - nba_taken)
            + max(0, DAILY_TENNIS_MATCH_ATP_TARGET - tennis_match_atp_taken)
            + max(0, DAILY_TENNIS_MATCH_WTA_TARGET - tennis_match_wta_taken)
            + max(0, DAILY_TENNIS_WINNER_TARGET - (atp_winner_daily + wta_winner_daily))
            + max(0, DAILY_OTHERS_TARGET - other_taken)
        )
        if missing_quota > 0:
            football_reallocated = take(
                missing_quota,
                "daily quota reallocation (football)",
                _is_football,
            )
            remaining = missing_quota - football_reallocated
            if remaining > 0:
                take(
                    remaining,
                    "daily quota reallocation (any)",
                    lambda _candidate: True,
                )
    else:
        football_selected = take(
            1,
            "weekly football (Europe priority)",
            lambda candidate: _is_football(candidate) and _is_european_football(candidate),
        )
        for league_label, league_keywords in FOOTBALL_PRIORITY_LEAGUES:
            if football_selected >= WEEKLY_FOOTBALL_TARGET:
                break
            football_selected += take(
                1,
                f"weekly football coverage ({league_label})",
                lambda candidate, keywords=league_keywords: _is_football(candidate)
                and _contains_any(candidate.league, keywords),
            )
        if football_selected < WEEKLY_FOOTBALL_TARGET:
            take(
                WEEKLY_FOOTBALL_TARGET - football_selected,
                "weekly football fallback",
                _is_football,
            )

        nba_taken = take(WEEKLY_NBA_TARGET, "weekly basketball (NBA)", _is_nba)
        euroleague_taken = take(
            WEEKLY_EUROLEAGUE_TARGET,
            "weekly basketball (Euroleague)",
            _is_euroleague,
        )

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

        others_taken = take(WEEKLY_OTHERS_TARGET, "weekly other sports mix", _is_other_sport)

        # Reallocate missing quotas to football first, then basketball.
        missing_quota = (
            max(0, WEEKLY_NBA_TARGET - nba_taken)
            + max(0, WEEKLY_EUROLEAGUE_TARGET - euroleague_taken)
            + max(0, WEEKLY_TENNIS_WINNER_TARGET - winners_selected)
            + max(0, WEEKLY_OTHERS_TARGET - others_taken)
        )
        if missing_quota > 0:
            football_reallocated = take(
                missing_quota,
                "weekly quota reallocation (football)",
                _is_football,
            )
            remaining = missing_quota - football_reallocated
            if remaining > 0:
                take(
                    remaining,
                    "weekly quota reallocation (any)",
                    lambda _candidate: True,
                )

    # Fill with remaining best-ranked candidates until target.
    if len(selected) < target:
        for candidate in ranked_candidates:
            if candidate.candidate_id in selected_ids:
                continue
            if not can_add_candidate(candidate):
                continue
            selected.append(candidate)
            selected_ids.add(candidate.candidate_id)
            register_candidate(candidate)
            if len(selected) >= target:
                break

    if mode == "weekly":
        selected = _order_weekly_with_football_league_priority(selected)

    return selected[:target], warnings


def select_candidates_heuristic(
    candidates: Sequence[CandidatePick],
    target: int,
    mode: Mode = "daily",
    seed: str | None = None,
) -> list[CandidatePick]:
    ranked = _heuristic_ranked_order(candidates, len(candidates), seed=seed)
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
    seed: str | None = None,
) -> tuple[list[CandidatePick], str | None, list[str]]:
    ordered_candidates = sorted(candidates, key=_candidate_sort_key)

    if not use_openai:
        selected, warnings = _apply_mode_portfolio_with_mode(
            _heuristic_ranked_order(ordered_candidates, len(ordered_candidates), seed=seed),
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
            _heuristic_ranked_order(ordered_candidates, len(ordered_candidates), seed=seed),
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
        fallback_ranked = _heuristic_ranked_order(
            ordered_candidates,
            len(ordered_candidates),
            seed=seed,
        )
        seen_ids = {candidate.candidate_id for candidate in openai_ranked}
        for candidate in fallback_ranked:
            if candidate.candidate_id in seen_ids:
                continue
            openai_ranked.append(candidate)
            seen_ids.add(candidate.candidate_id)

    selected, warnings = _apply_mode_portfolio_with_mode(openai_ranked, target, mode)
    return selected, rationale, warnings
