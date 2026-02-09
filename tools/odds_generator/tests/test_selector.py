from __future__ import annotations

from collections import Counter

from tools.odds_generator.models import CandidateOption, CandidatePick
from tools.odds_generator.selector import select_candidates_heuristic


def make_candidate(idx: int, sport: str, market: str, odds: tuple[float, float]) -> CandidatePick:
    return CandidatePick(
        candidate_id=f"c{idx}",
        sport_key=f"{sport}_key",
        sport_slug=sport,
        league="League",
        event=f"Event {idx}",
        event_key=f"event_{idx}",
        start_time=f"2026-02-{10 + idx:02d}T10:00:00.000Z",
        market=market,
        bookmaker="book-a",
        options=(
            CandidateOption(label="A", odds=odds[0]),
            CandidateOption(label="B", odds=odds[1]),
        ),
    )


def test_selection_is_deterministic() -> None:
    candidates = [
        make_candidate(1, "soccer", "h2h", (2.1, 2.2)),
        make_candidate(2, "soccer", "totals", (1.9, 1.95)),
        make_candidate(3, "basketball", "h2h", (2.3, 2.4)),
        make_candidate(4, "golf", "h2h", (2.0, 2.1)),
        make_candidate(5, "tennis", "spreads", (1.8, 2.5)),
    ]

    first = select_candidates_heuristic(candidates, target=3)
    second = select_candidates_heuristic(candidates, target=3)

    assert [pick.candidate_id for pick in first] == [pick.candidate_id for pick in second]


def test_selection_prioritizes_football_and_distribution() -> None:
    candidates: list[CandidatePick] = []
    idx = 1
    for sport, count in (
        ("soccer", 14),
        ("basketball", 10),
        ("tennis", 10),
        ("golf", 10),
    ):
        for _ in range(count):
            candidates.append(make_candidate(idx, sport, "h2h", (2.05, 2.3)))
            idx += 1

    selected = select_candidates_heuristic(candidates, target=25)
    counts = Counter(candidate.sport_slug for candidate in selected)

    assert counts["soccer"] >= 10
    assert len(counts) == 4
    assert counts["basketball"] >= 5
    assert counts["tennis"] >= 5
    assert counts["golf"] >= 5
