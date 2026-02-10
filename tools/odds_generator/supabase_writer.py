from __future__ import annotations

from typing import Any

import httpx


class SupabaseWriterError(RuntimeError):
    """Raised when writing pick packs to Supabase fails."""


def upsert_pick_pack(
    *,
    supabase_url: str,
    service_role_key: str,
    round_id: str,
    pack_type: str,
    anchor_date: str,
    seed: str,
    payload: dict[str, Any],
    summary: dict[str, Any],
    timeout_seconds: float = 30.0,
) -> str:
    if not supabase_url:
        raise SupabaseWriterError("SUPABASE_URL is required for persistence")
    if not service_role_key:
        raise SupabaseWriterError("SUPABASE_SERVICE_ROLE_KEY is required for persistence")

    url = f"{supabase_url.rstrip('/')}/rest/v1/pick_packs"
    params = {"on_conflict": "round_id,pack_type,anchor_date"}
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    row = {
        "round_id": round_id,
        "pack_type": pack_type,
        "anchor_date": anchor_date,
        "seed": seed,
        "payload": payload,
        "summary": summary,
    }

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(url, params=params, headers=headers, json=[row])

    if response.status_code >= 400:
        raise SupabaseWriterError(
            f"Supabase upsert failed: {response.status_code} {response.text}",
        )

    try:
        parsed = response.json()
    except ValueError as error:
        raise SupabaseWriterError("Supabase upsert returned non-JSON response") from error

    if not isinstance(parsed, list) or not parsed:
        raise SupabaseWriterError("Supabase upsert returned empty payload")

    record = parsed[0]
    if not isinstance(record, dict):
        raise SupabaseWriterError("Supabase upsert returned invalid row payload")

    row_id = record.get("id")
    if not isinstance(row_id, str) or not row_id:
        raise SupabaseWriterError("Supabase upsert response is missing row id")

    return row_id
