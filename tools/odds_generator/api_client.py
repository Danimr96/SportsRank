from __future__ import annotations

import time
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

import httpx


class OddsApiClientError(RuntimeError):
    """Raised when The Odds API returns a non-recoverable error."""


class OddsApiClient:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        timeout_seconds: float = 30.0,
        max_retries: int = 4,
        backoff_seconds: float = 1.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries
        self._backoff_seconds = backoff_seconds

    def get_sports(self) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        payload, headers = self._request("/v4/sports", {})
        if not isinstance(payload, list):
            raise OddsApiClientError("Expected list response from /v4/sports")
        return payload, headers

    def get_odds(
        self,
        sport_key: str,
        regions: Sequence[str],
        markets: Sequence[str],
        commence_time_from: datetime,
        commence_time_to: datetime,
        bookmakers: Sequence[str] | None = None,
    ) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        params: dict[str, str] = {
            "apiKey": self._api_key,
            "regions": ",".join(regions),
            "markets": ",".join(markets),
            "oddsFormat": "decimal",
            "dateFormat": "iso",
            "commenceTimeFrom": commence_time_from.isoformat().replace("+00:00", "Z"),
            "commenceTimeTo": commence_time_to.isoformat().replace("+00:00", "Z"),
        }
        if bookmakers:
            params["bookmakers"] = ",".join(bookmakers)

        payload, headers = self._request(f"/v4/sports/{sport_key}/odds", params)
        if not isinstance(payload, list):
            raise OddsApiClientError(
                f"Expected list response from /v4/sports/{sport_key}/odds",
            )
        return payload, headers

    def get_events(
        self,
        sport_key: str,
    ) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        params: dict[str, str] = {
            "apiKey": self._api_key,
            "dateFormat": "iso",
        }
        payload, headers = self._request(f"/v4/sports/{sport_key}/events", params)
        if not isinstance(payload, list):
            raise OddsApiClientError(
                f"Expected list response from /v4/sports/{sport_key}/events",
            )
        return payload, headers

    def _request(
        self,
        path: str,
        params: Mapping[str, str],
    ) -> tuple[Any, Mapping[str, str]]:
        url = f"{self._base_url}{path}"

        for attempt in range(self._max_retries + 1):
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.get(url, params=params)

            if response.status_code == 429 and attempt < self._max_retries:
                sleep_seconds = self._backoff_seconds * (2**attempt)
                time.sleep(sleep_seconds)
                continue

            if response.status_code >= 500 and attempt < self._max_retries:
                sleep_seconds = self._backoff_seconds * (2**attempt)
                time.sleep(sleep_seconds)
                continue

            if response.status_code >= 400:
                raise OddsApiClientError(
                    f"Odds API request failed: {response.status_code} {response.text}",
                )

            return response.json(), response.headers

        raise OddsApiClientError("Odds API request failed after retries")
