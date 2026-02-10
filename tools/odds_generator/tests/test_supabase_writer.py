from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import tools.odds_generator.supabase_writer as supabase_writer


@dataclass
class _FakeResponse:
    status_code: int
    payload: Any

    def json(self) -> Any:
        return self.payload

    @property
    def text(self) -> str:
        return str(self.payload)


class _FakeClient:
    def __init__(self, timeout: float, store: dict[tuple[str, str, str], dict[str, Any]]) -> None:
        self.timeout = timeout
        self.store = store
        self.calls: list[dict[str, Any]] = []

    def __enter__(self) -> "_FakeClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(
        self,
        url: str,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        json: Sequence[dict[str, Any]] = (),
    ) -> _FakeResponse:
        self.calls.append(
            {
                "url": url,
                "params": params or {},
                "headers": headers or {},
                "json": list(json),
                "method": "post",
            },
        )

        row = list(json)[0]
        if "round_id" in row and "pack_type" in row and "anchor_date" in row:
            key = (row["round_id"], row["pack_type"], row["anchor_date"])
            existing = self.store.get(key)
            if existing:
                row_id = existing["id"]
            else:
                row_id = f"row-{len(self.store) + 1}"
            stored = {**row, "id": row_id}
            self.store[key] = stored
            return _FakeResponse(status_code=201, payload=[stored])

        # Generic insert branch for non-pick_pack rows.
        if "event_id" in row:
            inserted = {**row, "id": "featured-row-1"}
            return _FakeResponse(status_code=201, payload=[inserted])

        if "provider_event_id" in row:
            inserted = {**row, "id": "event-row-1"}
            return _FakeResponse(status_code=201, payload=[inserted])

        return _FakeResponse(status_code=201, payload=[{**row, "id": "row-generic"}])

    def delete(self, url: str, headers: dict[str, str]) -> _FakeResponse:
        self.calls.append({"url": url, "headers": headers, "method": "delete"})
        return _FakeResponse(status_code=204, payload={})

    def get(
        self,
        url: str,
        params: dict[str, str] | list[tuple[str, str]],
        headers: dict[str, str],
    ) -> _FakeResponse:
        self.calls.append(
            {"url": url, "params": params, "headers": headers, "method": "get"},
        )
        return _FakeResponse(status_code=200, payload=[])


def test_upsert_uses_conflict_key_and_headers(monkeypatch) -> None:
    store: dict[tuple[str, str, str], dict[str, Any]] = {}
    client = _FakeClient(timeout=30.0, store=store)

    class _Factory:
        def __call__(self, timeout: float) -> _FakeClient:
            client.timeout = timeout
            return client

    monkeypatch.setattr(supabase_writer.httpx, "Client", _Factory())

    row_id = supabase_writer.upsert_pick_pack(
        supabase_url="https://example.supabase.co",
        service_role_key="service-role",
        round_id="round-1",
        pack_type="daily",
        anchor_date="2026-02-10",
        seed="DAILY|2026-02-10|round-1",
        payload={"round_id": "round-1", "picks": []},
        summary={"total_picks": 0, "counts_by_sport": {}, "min_odds": 0, "max_odds": 0},
    )

    assert row_id == "row-1"
    assert len(client.calls) == 1
    call = client.calls[0]
    assert call["params"]["on_conflict"] == "round_id,pack_type,anchor_date"
    assert call["headers"]["apikey"] == "service-role"
    assert call["headers"]["Authorization"] == "Bearer service-role"
    assert "resolution=merge-duplicates" in call["headers"]["Prefer"]
    assert call["json"][0]["round_id"] == "round-1"
    assert call["json"][0]["pack_type"] == "daily"
    assert call["json"][0]["anchor_date"] == "2026-02-10"


def test_same_anchor_overwrites_same_row(monkeypatch) -> None:
    store: dict[tuple[str, str, str], dict[str, Any]] = {}
    client = _FakeClient(timeout=30.0, store=store)

    class _Factory:
        def __call__(self, timeout: float) -> _FakeClient:
            client.timeout = timeout
            return client

    monkeypatch.setattr(supabase_writer.httpx, "Client", _Factory())

    first_id = supabase_writer.upsert_pick_pack(
        supabase_url="https://example.supabase.co",
        service_role_key="service-role",
        round_id="round-1",
        pack_type="weekly",
        anchor_date="2026-02-12",
        seed="WEEKLY|2026-02-12|round-1",
        payload={"round_id": "round-1", "picks": [{"id": 1}]},
        summary={"total_picks": 1, "counts_by_sport": {"soccer": 1}, "min_odds": 2.0, "max_odds": 2.0},
    )

    second_id = supabase_writer.upsert_pick_pack(
        supabase_url="https://example.supabase.co",
        service_role_key="service-role",
        round_id="round-1",
        pack_type="weekly",
        anchor_date="2026-02-12",
        seed="WEEKLY|2026-02-12|round-1",
        payload={"round_id": "round-1", "picks": [{"id": 1}, {"id": 2}]},
        summary={"total_picks": 2, "counts_by_sport": {"soccer": 2}, "min_odds": 1.9, "max_odds": 2.1},
    )

    assert first_id == second_id
    assert len(store) == 1
    key = ("round-1", "weekly", "2026-02-12")
    assert store[key]["summary"]["total_picks"] == 2


def test_replace_featured_events_deletes_then_inserts(monkeypatch) -> None:
    store: dict[tuple[str, str, str], dict[str, Any]] = {}
    client = _FakeClient(timeout=30.0, store=store)

    class _Factory:
        def __call__(self, timeout: float) -> _FakeClient:
            client.timeout = timeout
            return client

    monkeypatch.setattr(supabase_writer.httpx, "Client", _Factory())

    rows = supabase_writer.replace_featured_events(
        supabase_url="https://example.supabase.co",
        service_role_key="service-role",
        featured_date="2026-02-10",
        rows=[
            {
                "featured_date": "2026-02-10",
                "sport_slug": "soccer",
                "league": "la_liga",
                "event_id": "event-1",
                "bucket": "today",
            }
        ],
    )

    assert rows[0]["event_id"] == "event-1"
    delete_calls = [call for call in client.calls if call.get("method") == "delete"]
    assert len(delete_calls) == 1
    assert "featured_date=eq.2026-02-10" in delete_calls[0]["url"]
