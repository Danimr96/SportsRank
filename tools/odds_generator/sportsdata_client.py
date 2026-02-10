from __future__ import annotations

import time
from collections.abc import Mapping
from datetime import date
from typing import Any

import httpx


class SportsDataClientError(RuntimeError):
    """Raised when SportsData.io returns a non-recoverable error."""


class SportsDataClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.sportsdata.io/v3",
        timeout_seconds: float = 30.0,
        max_retries: int = 3,
        backoff_seconds: float = 1.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        if self._base_url.endswith("/v3"):
            self._api_origin = self._base_url[:-3]
        elif self._base_url.endswith("/v4"):
            self._api_origin = self._base_url[:-3]
        else:
            self._api_origin = self._base_url
        self._timeout_seconds = timeout_seconds
        self._max_retries = max_retries
        self._backoff_seconds = backoff_seconds
        self._cache: dict[tuple[str, tuple[tuple[str, str], ...]], tuple[Any, Mapping[str, str]]] = {}

    def get_scores_by_date(
        self,
        sport_code: str,
        game_date: date,
    ) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        payload, headers = self._request(
            f"/{sport_code}/scores/json/GamesByDate/{game_date.isoformat()}",
            {},
        )
        if not isinstance(payload, list):
            raise SportsDataClientError(
                f"Expected list response from /{sport_code}/scores/json/GamesByDate/{game_date.isoformat()}",
            )
        return payload, headers

    def get_game_odds_by_date(
        self,
        sport_code: str,
        game_date: date,
    ) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        payload, headers = self._request(
            f"/{sport_code}/odds/json/GameOddsByDate/{game_date.isoformat()}",
            {},
        )
        if not isinstance(payload, list):
            raise SportsDataClientError(
                f"Expected list response from /{sport_code}/odds/json/GameOddsByDate/{game_date.isoformat()}",
            )
        return payload, headers

    def get_soccer_scores_by_date(
        self,
        competition: str,
        game_date: date,
    ) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        competition_key = competition.strip().upper()
        payload, headers = self._request(
            f"{self._api_origin}/v4/soccer/scores/json/GamesByDate/{competition_key}/{game_date.isoformat()}",
            {},
        )
        if not isinstance(payload, list):
            raise SportsDataClientError(
                "Expected list response from "
                f"/soccer/scores/json/GamesByDate/{competition_key}/{game_date.isoformat()}",
            )
        return payload, headers

    def get_soccer_game_odds_by_date(
        self,
        competition: str,
        game_date: date,
    ) -> tuple[list[dict[str, Any]], Mapping[str, str]]:
        competition_key = competition.strip().upper()
        payload, headers = self._request(
            f"{self._api_origin}/v4/soccer/odds/json/GameOddsByDate/{competition_key}/{game_date.isoformat()}",
            {},
        )
        if not isinstance(payload, list):
            raise SportsDataClientError(
                "Expected list response from "
                f"/soccer/odds/json/GameOddsByDate/{competition_key}/{game_date.isoformat()}",
            )
        return payload, headers

    def _request(
        self,
        path: str,
        params: Mapping[str, str],
    ) -> tuple[Any, Mapping[str, str]]:
        query_items = tuple(sorted((str(key), str(value)) for key, value in params.items()))
        cache_key = (path, query_items)
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        full_params = {"key": self._api_key, **params}
        if path.startswith("http://") or path.startswith("https://"):
            url = path
        else:
            url = f"{self._base_url}{path}"

        for attempt in range(self._max_retries + 1):
            with httpx.Client(timeout=self._timeout_seconds) as client:
                response = client.get(url, params=full_params)

            if response.status_code == 429 and attempt < self._max_retries:
                time.sleep(self._backoff_seconds * (2**attempt))
                continue

            if response.status_code >= 500 and attempt < self._max_retries:
                time.sleep(self._backoff_seconds * (2**attempt))
                continue

            if response.status_code >= 400:
                raise SportsDataClientError(
                    f"SportsData request failed: {response.status_code} {response.text}",
                )

            result: tuple[Any, Mapping[str, str]] = (response.json(), response.headers)
            self._cache[cache_key] = result
            return result

        raise SportsDataClientError("SportsData request failed after retries")
