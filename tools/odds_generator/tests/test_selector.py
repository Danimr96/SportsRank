from __future__ import annotations

from collections import Counter

from tools.odds_generator.models import CandidateOption, CandidatePick
from tools.odds_generator.selector import select_candidates, select_candidates_heuristic


def make_candidate(
    idx: int,
    *,
    sport: str,
    market: str,
    league: str,
    event: str | None = None,
    odds: tuple[float, float] = (2.05, 2.25),
) -> CandidatePick:
    return CandidatePick(
        candidate_id=f"c{idx}",
        sport_key=f"{sport}_key",
        sport_slug=sport,
        league=league,
        event=event or f"Event {idx}",
        event_key=f"{event or f'Event {idx}'}|{idx}",
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
        make_candidate(1, sport="soccer", market="h2h", league="La Liga", odds=(2.1, 2.2)),
        make_candidate(2, sport="soccer", market="totals", league="Premier League", odds=(1.9, 1.95)),
        make_candidate(3, sport="basketball", market="h2h", league="NBA", odds=(2.3, 2.4)),
        make_candidate(4, sport="golf", market="h2h", league="PGA", odds=(2.0, 2.1)),
        make_candidate(5, sport="tennis", market="spreads", league="ATP", odds=(1.8, 2.5)),
    ]

    first = select_candidates_heuristic(candidates, target=3, mode="daily")
    second = select_candidates_heuristic(candidates, target=3, mode="daily")

    assert [pick.candidate_id for pick in first] == [pick.candidate_id for pick in second]


def test_daily_selection_hits_minimum_targets_when_available() -> None:
    candidates: list[CandidatePick] = []
    idx = 0

    # Football: top leagues + Europe.
    for league in ("La Liga", "Premier League", "Serie A", "Bundesliga", "UEFA Champions League"):
        idx += 1
        candidates.append(make_candidate(idx, sport="soccer", market="h2h", league=league))

    # NBA volume.
    for i in range(12):
        idx += 1
        candidates.append(
            make_candidate(
                idx,
                sport="basketball",
                market="h2h",
                league="NBA",
                event=f"NBA Event {i}",
            ),
        )

    # Tennis daily (non winner).
    for i in range(6):
        idx += 1
        candidates.append(
            make_candidate(
                idx,
                sport="tennis",
                market="h2h",
                league="ATP",
                event=f"Tennis Match {i}",
            ),
        )

    # Others mix.
    for sport in ("golf", "motor", "hockey", "combat", "baseball", "american-football"):
        idx += 1
        candidates.append(make_candidate(idx, sport=sport, market="h2h", league="Other League"))

    selected = select_candidates_heuristic(candidates, target=25, mode="daily")
    counts = Counter(candidate.sport_slug for candidate in selected)

    assert len(selected) == 25
    assert counts["soccer"] >= 5
    assert counts["basketball"] >= 5
    assert counts["tennis"] >= 5
    other_count = len(selected) - counts["soccer"] - counts["basketball"] - counts["tennis"]
    assert other_count >= 5

    selected_football_leagues = {pick.league for pick in selected if pick.sport_slug == "soccer"}
    assert "La Liga" in selected_football_leagues
    assert "Premier League" in selected_football_leagues
    assert "Serie A" in selected_football_leagues
    assert "Bundesliga" in selected_football_leagues


def test_weekly_prioritizes_atp_wta_winner_picks() -> None:
    candidates: list[CandidatePick] = []
    idx = 0

    for league in ("UEFA Champions League", "La Liga", "Premier League", "Serie A"):
        idx += 1
        candidates.append(make_candidate(idx, sport="soccer", market="h2h", league=league))

    for i in range(12):
        idx += 1
        candidates.append(
            make_candidate(
                idx,
                sport="basketball",
                market="h2h",
                league="NBA",
                event=f"NBA Week {i}",
            ),
        )

    for i in range(3):
        idx += 1
        candidates.append(
            make_candidate(
                idx,
                sport="basketball",
                market="h2h",
                league="Euroleague",
                event=f"Euroleague Week {i}",
            ),
        )

    idx += 1
    candidates.append(
        make_candidate(
            idx,
            sport="tennis",
            market="winner",
            league="ATP Masters",
            event="ATP Tournament Winner",
        ),
    )
    idx += 1
    candidates.append(
        make_candidate(
            idx,
            sport="tennis",
            market="winner",
            league="WTA 1000",
            event="WTA Tournament Winner",
        ),
    )
    for i in range(3):
        idx += 1
        candidates.append(
            make_candidate(
                idx,
                sport="tennis",
                market="h2h",
                league="ATP",
                event=f"Tennis Match Week {i}",
            ),
        )

    for sport in ("golf", "motor", "hockey", "combat", "baseball", "american-football"):
        idx += 1
        candidates.append(make_candidate(idx, sport=sport, market="h2h", league="Other League"))

    selected = select_candidates_heuristic(candidates, target=30, mode="weekly")
    selected_tennis = [pick for pick in selected if pick.sport_slug == "tennis"]

    assert any("atp" in pick.league.lower() and "winner" in pick.market.lower() for pick in selected_tennis)
    assert any("wta" in pick.league.lower() and "winner" in pick.market.lower() for pick in selected_tennis)


def test_weekly_warns_when_tennis_winner_markets_missing() -> None:
    candidates: list[CandidatePick] = []
    idx = 0

    for i in range(4):
        idx += 1
        candidates.append(make_candidate(idx, sport="soccer", market="h2h", league="La Liga"))
    for i in range(10):
        idx += 1
        candidates.append(make_candidate(idx, sport="basketball", market="h2h", league="NBA"))
    for i in range(2):
        idx += 1
        candidates.append(make_candidate(idx, sport="basketball", market="h2h", league="Euroleague"))
    for i in range(5):
        idx += 1
        candidates.append(make_candidate(idx, sport="tennis", market="h2h", league="ATP"))
    for sport in ("golf", "motor", "hockey", "combat", "baseball"):
        idx += 1
        candidates.append(make_candidate(idx, sport=sport, market="h2h", league="Other League"))

    selected, _rationale, warnings = select_candidates(
        candidates=candidates,
        target=25,
        use_openai=False,
        openai_api_key=None,
        mode="weekly",
    )

    assert len(selected) == 25
    assert any("tournament-winner markets unavailable" in warning for warning in warnings)


def test_weekly_football_is_ordered_by_league_priority() -> None:
    candidates = [
        make_candidate(1, sport="soccer", market="h2h", league="Bundesliga"),
        make_candidate(2, sport="soccer", market="h2h", league="UEFA Champions League"),
        make_candidate(3, sport="soccer", market="h2h", league="Serie A"),
        make_candidate(4, sport="soccer", market="h2h", league="Premier League"),
        make_candidate(5, sport="soccer", market="h2h", league="La Liga"),
    ]

    selected = select_candidates_heuristic(candidates, target=5, mode="weekly")
    selected_leagues = [pick.league for pick in selected if pick.sport_slug == "soccer"]

    assert selected_leagues == [
        "La Liga",
        "Premier League",
        "Serie A",
        "Bundesliga",
        "UEFA Champions League",
    ]
