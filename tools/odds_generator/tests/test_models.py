from __future__ import annotations

import pytest
from pydantic import ValidationError

from tools.odds_generator.models import ImportPayloadModel


def test_output_schema_validation_passes() -> None:
    payload = ImportPayloadModel.model_validate(
        {
            "round_id": "123e4567-e89b-12d3-a456-426614174000",
            "picks": [
                {
                    "sport_slug": "soccer",
                    "title": "[DAILY] A vs B - h2h",
                    "description": None,
                    "order_index": 0,
                    "options": [
                        {"label": "A", "odds": 2.1},
                        {"label": "B", "odds": 1.8},
                    ],
                    "metadata": {
                        "league": "EPL",
                        "event": "A vs B",
                        "start_time": "2026-02-09T18:00:00.000Z",
                    },
                }
            ],
        }
    )

    assert payload.picks[0].metadata.start_time.endswith("Z")


def test_output_schema_rejects_invalid_start_time() -> None:
    with pytest.raises(ValidationError):
        ImportPayloadModel.model_validate(
            {
                "round_id": "123e4567-e89b-12d3-a456-426614174000",
                "picks": [
                    {
                        "sport_slug": "soccer",
                        "title": "[DAILY] A vs B - h2h",
                        "description": None,
                        "order_index": 0,
                        "options": [
                            {"label": "A", "odds": 2.1},
                            {"label": "B", "odds": 1.8},
                        ],
                        "metadata": {
                            "league": "EPL",
                            "event": "A vs B",
                            "start_time": "2026-02-09 18:00:00",
                        },
                    }
                ],
            }
        )
