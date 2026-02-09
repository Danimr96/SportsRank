from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Mode = Literal["daily", "weekly"]


class PickOptionModel(BaseModel):
    label: str = Field(min_length=1)
    odds: float = Field(gt=1.01)


class PickMetadataModel(BaseModel):
    league: str = Field(min_length=1)
    event: str = Field(min_length=1)
    start_time: str = Field(min_length=1)

    @field_validator("start_time")
    @classmethod
    def validate_start_time(cls, value: str) -> str:
        # Accept strict UTC ISO strings ending in Z.
        if not value.endswith("Z"):
            raise ValueError("start_time must be an ISO-8601 UTC string ending in 'Z'")

        parsed = parse_utc_iso(value)
        if parsed is None:
            raise ValueError("start_time must be a valid ISO-8601 UTC timestamp")

        return value


class PickModel(BaseModel):
    sport_slug: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str | None
    order_index: int = Field(ge=0)
    options: list[PickOptionModel] = Field(min_length=2)
    metadata: PickMetadataModel


class ImportPayloadModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    round_id: str = Field(min_length=1)
    picks: list[PickModel] = Field(min_length=1)


class SportConfigEntry(BaseModel):
    app_slug: str = Field(min_length=1)
    league: str = Field(min_length=1)
    allow_daily: bool = True
    allow_weekly: bool = True


class GeneratorLimits(BaseModel):
    daily_default_target: int = Field(default=25, ge=1)
    weekly_default_target: int = Field(default=50, ge=1)
    daily_max: int = Field(default=50, ge=1)
    weekly_max: int = Field(default=200, ge=1)


class SportsMapConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sports: dict[str, SportConfigEntry]
    limits: GeneratorLimits = Field(default_factory=GeneratorLimits)


@dataclass(frozen=True)
class CandidateOption:
    label: str
    odds: float


@dataclass(frozen=True)
class CandidatePick:
    candidate_id: str
    sport_key: str
    sport_slug: str
    league: str
    event: str
    event_key: str
    start_time: str
    market: str
    bookmaker: str | None
    options: tuple[CandidateOption, ...]

    @property
    def mean_odds(self) -> float:
        return sum(option.odds for option in self.options) / len(self.options)


def parse_utc_iso(value: str) -> datetime | None:
    try:
        if value.endswith("Z"):
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(
                timezone.utc,
            )
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except ValueError:
        return None


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_utc_z(value: datetime) -> str:
    return (
        value
        .astimezone(timezone.utc)
        .replace(microsecond=0)
        .strftime("%Y-%m-%dT%H:%M:%SZ")
    )



def compact_candidate(candidate: CandidatePick) -> dict[str, Any]:
    return {
        "id": candidate.candidate_id,
        "sport_slug": candidate.sport_slug,
        "market": candidate.market,
        "event": candidate.event,
        "start_time": candidate.start_time,
        "mean_odds": round(candidate.mean_odds, 4),
        "option_count": len(candidate.options),
    }
