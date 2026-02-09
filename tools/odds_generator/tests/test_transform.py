from __future__ import annotations

from tools.odds_generator.cli import build_payload, deduplicate_candidates
from tools.odds_generator.models import CandidateOption, CandidatePick


def test_deduplicate_and_order_index() -> None:
    candidates = [
        CandidatePick(
            candidate_id="same",
            sport_key="soccer_epl",
            sport_slug="soccer",
            league="EPL",
            event="A vs B",
            event_key="a_vs_b",
            start_time="2026-02-09T18:00:00.000Z",
            market="h2h",
            bookmaker="book-a",
            options=(
                CandidateOption(label="A", odds=2.0),
                CandidateOption(label="B", odds=2.1),
            ),
        ),
        CandidatePick(
            candidate_id="same",
            sport_key="soccer_epl",
            sport_slug="soccer",
            league="EPL",
            event="A vs B",
            event_key="a_vs_b",
            start_time="2026-02-09T18:00:00.000Z",
            market="h2h",
            bookmaker="book-b",
            options=(
                CandidateOption(label="A", odds=2.2),
                CandidateOption(label="B", odds=1.9),
            ),
        ),
        CandidatePick(
            candidate_id="other",
            sport_key="basketball_nba",
            sport_slug="basketball",
            league="NBA",
            event="X vs Y",
            event_key="x_vs_y",
            start_time="2026-02-09T20:00:00.000Z",
            market="spreads",
            bookmaker="book-a",
            options=(
                CandidateOption(label="X -4.5", odds=1.9),
                CandidateOption(label="Y +4.5", odds=1.9),
            ),
        ),
    ]

    deduped = deduplicate_candidates(candidates)
    payload = build_payload(
        round_id="123e4567-e89b-12d3-a456-426614174000",
        mode="daily",
        candidates=deduped,
        regions=["eu", "us"],
    )

    assert len(deduped) == 2
    assert [pick.order_index for pick in payload.picks] == [0, 1]
