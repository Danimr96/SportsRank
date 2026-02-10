from __future__ import annotations

from tools.odds_generator.models import CandidateOption, CandidatePick
from tools.odds_generator.selector import select_candidates_heuristic


def _candidate(idx: int) -> CandidatePick:
    return CandidatePick(
        candidate_id=f"seed-{idx}",
        sport_key="soccer_epl",
        sport_slug="soccer",
        league="Premier League",
        event=f"Event {idx}",
        event_key=f"event-{idx}",
        start_time=f"2026-02-{10 + idx:02d}T10:00:00.000Z",
        market="h2h",
        bookmaker="book-a",
        options=(
            CandidateOption(label="Home", odds=2.1),
            CandidateOption(label="Away", odds=2.1),
        ),
    )


def test_same_seed_is_deterministic() -> None:
    candidates = [_candidate(index) for index in range(1, 11)]
    first = select_candidates_heuristic(candidates, target=8, mode="daily", seed="DAILY|2026-02-10|r1")
    second = select_candidates_heuristic(candidates, target=8, mode="daily", seed="DAILY|2026-02-10|r1")
    assert [pick.candidate_id for pick in first] == [pick.candidate_id for pick in second]


def test_different_seed_changes_selection_order() -> None:
    candidates = [_candidate(index) for index in range(1, 11)]
    first = select_candidates_heuristic(candidates, target=10, mode="daily", seed="DAILY|2026-02-10|r1")
    second = select_candidates_heuristic(candidates, target=10, mode="daily", seed="DAILY|2026-02-11|r1")
    assert [pick.candidate_id for pick in first] != [pick.candidate_id for pick in second]
