from __future__ import annotations

from typing import Any

import httpx


class SupabaseWriterError(RuntimeError):
    """Raised when writing pick packs to Supabase fails."""


def _headers(service_role_key: str, prefer: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def _parse_json_response(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError as error:
        raise SupabaseWriterError("Supabase returned non-JSON response") from error


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
    headers = _headers(
        service_role_key,
        prefer="resolution=merge-duplicates,return=representation",
    )
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

    parsed = _parse_json_response(response)

    if not isinstance(parsed, list) or not parsed:
        raise SupabaseWriterError("Supabase upsert returned empty payload")

    record = parsed[0]
    if not isinstance(record, dict):
        raise SupabaseWriterError("Supabase upsert returned invalid row payload")

    row_id = record.get("id")
    if not isinstance(row_id, str) or not row_id:
        raise SupabaseWriterError("Supabase upsert response is missing row id")

    return row_id


def upsert_events(
    *,
    supabase_url: str,
    service_role_key: str,
    rows: list[dict[str, Any]],
    timeout_seconds: float = 45.0,
) -> list[dict[str, Any]]:
    if not rows:
        return []

    url = f"{supabase_url.rstrip('/')}/rest/v1/events"
    params = {"on_conflict": "provider,provider_event_id"}
    headers = _headers(
        service_role_key,
        prefer="resolution=merge-duplicates,return=representation",
    )

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.post(url, params=params, headers=headers, json=rows)

    if response.status_code >= 400:
        raise SupabaseWriterError(
            f"Supabase events upsert failed: {response.status_code} {response.text}",
        )

    parsed = _parse_json_response(response)
    if not isinstance(parsed, list):
        raise SupabaseWriterError("Supabase events upsert returned invalid payload")
    return [row for row in parsed if isinstance(row, dict)]


def list_events_for_window(
    *,
    supabase_url: str,
    service_role_key: str,
    from_iso: str,
    to_iso: str,
    timeout_seconds: float = 30.0,
) -> list[dict[str, Any]]:
    url = f"{supabase_url.rstrip('/')}/rest/v1/events"
    params = [
        (
            "select",
            "id,provider,provider_event_id,sport_slug,league,start_time,home,away,status,participants,metadata",
        ),
        ("start_time", f"gte.{from_iso}"),
        ("start_time", f"lte.{to_iso}"),
        ("order", "start_time.asc"),
    ]
    headers = _headers(service_role_key)

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(url, params=params, headers=headers)

    if response.status_code >= 400:
        raise SupabaseWriterError(
            f"Supabase events read failed: {response.status_code} {response.text}",
        )

    parsed = _parse_json_response(response)
    if not isinstance(parsed, list):
        raise SupabaseWriterError("Supabase events read returned invalid payload")
    return [row for row in parsed if isinstance(row, dict)]


def replace_featured_events(
    *,
    supabase_url: str,
    service_role_key: str,
    featured_date: str,
    rows: list[dict[str, Any]],
    timeout_seconds: float = 30.0,
) -> list[dict[str, Any]]:
    base_url = f"{supabase_url.rstrip('/')}/rest/v1/featured_events"
    headers = _headers(service_role_key)

    with httpx.Client(timeout=timeout_seconds) as client:
        delete_response = client.delete(
            f"{base_url}?featured_date=eq.{featured_date}",
            headers=headers,
        )
    if delete_response.status_code >= 400:
        raise SupabaseWriterError(
            f"Supabase featured delete failed: {delete_response.status_code} {delete_response.text}",
        )

    if not rows:
        return []

    insert_headers = _headers(service_role_key, prefer="return=representation")
    with httpx.Client(timeout=timeout_seconds) as client:
        insert_response = client.post(base_url, headers=insert_headers, json=rows)

    if insert_response.status_code >= 400:
        raise SupabaseWriterError(
            f"Supabase featured insert failed: {insert_response.status_code} {insert_response.text}",
        )

    parsed = _parse_json_response(insert_response)
    if not isinstance(parsed, list):
        raise SupabaseWriterError("Supabase featured insert returned invalid payload")
    return [row for row in parsed if isinstance(row, dict)]


def list_featured_events_for_date(
    *,
    supabase_url: str,
    service_role_key: str,
    featured_date: str,
    timeout_seconds: float = 30.0,
) -> list[dict[str, Any]]:
    base_url = f"{supabase_url.rstrip('/')}/rest/v1/featured_events"
    headers = _headers(service_role_key)
    params = {
        "select": "id,featured_date,sport_slug,league,event_id,bucket,created_at",
        "featured_date": f"eq.{featured_date}",
        "order": "created_at.asc",
    }

    with httpx.Client(timeout=timeout_seconds) as client:
        response = client.get(base_url, params=params, headers=headers)

    if response.status_code >= 400:
        raise SupabaseWriterError(
            f"Supabase featured read failed: {response.status_code} {response.text}",
        )

    parsed = _parse_json_response(response)
    if not isinstance(parsed, list):
        raise SupabaseWriterError("Supabase featured read returned invalid payload")
    return [row for row in parsed if isinstance(row, dict)]
