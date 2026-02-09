from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import ImportPayloadModel, Mode


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_raw_response(
    outdir: Path,
    mode: Mode,
    sport_key: str,
    fetched_at: datetime,
    response_payload: Any,
    request_context: dict[str, Any],
) -> Path:
    raw_dir = outdir / "raw" / mode
    ensure_dir(raw_dir)

    stamp = fetched_at.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    safe_sport = sport_key.replace("/", "_")
    filepath = raw_dir / f"{stamp}_{safe_sport}.json"

    wrapped = {
        "fetched_at": fetched_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sport_key": sport_key,
        "request_context": request_context,
        "response": response_payload,
    }

    filepath.write_text(json.dumps(wrapped, indent=2, sort_keys=True), encoding="utf-8")
    return filepath


def output_filename(mode: Mode, now_utc: datetime) -> str:
    current = now_utc.astimezone(timezone.utc)

    if mode == "daily":
        return f"daily_picks_{current:%Y-%m-%d}.json"

    iso_year, iso_week, _ = current.isocalendar()
    return f"weekly_picks_{iso_year}-{iso_week:02d}.json"


def write_import_payload(
    outdir: Path,
    mode: Mode,
    now_utc: datetime,
    payload: ImportPayloadModel,
) -> Path:
    ensure_dir(outdir)
    filename = output_filename(mode, now_utc)
    filepath = outdir / filename
    filepath.write_text(
        json.dumps(payload.model_dump(mode="json"), indent=2, sort_keys=False),
        encoding="utf-8",
    )
    return filepath
