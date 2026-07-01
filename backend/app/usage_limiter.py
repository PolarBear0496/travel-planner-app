import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol


ANONYMOUS_COOKIE_NAME = "travel_planner_anonymous_id"


class UsageLimitExceeded(Exception):
    pass


class UsageCounterStore(Protocol):
    def get(self, key: str) -> int:
        pass

    def increment(self, key: str) -> int:
        pass


class InMemoryUsageCounterStore:
    def __init__(self) -> None:
        self._counts: dict[str, int] = defaultdict(int)

    def get(self, key: str) -> int:
        return self._counts[key]

    def increment(self, key: str) -> int:
        self._counts[key] += 1
        return self._counts[key]


@dataclass(frozen=True)
class UsageStatus:
    plan: str
    limit: int
    used: int
    remaining: int
    reset_at: datetime


class UsageLimiter:
    def __init__(
        self,
        store: UsageCounterStore,
        *,
        anonymous_daily_limit: int,
        ip_daily_limit: int,
    ) -> None:
        self.store = store
        self.anonymous_daily_limit = anonymous_daily_limit
        self.ip_daily_limit = ip_daily_limit

    @classmethod
    def from_env(cls, store: UsageCounterStore) -> "UsageLimiter":
        return cls(
            store,
            anonymous_daily_limit=get_positive_int_env("ANONYMOUS_DAILY_USAGE_LIMIT", 3),
            ip_daily_limit=get_positive_int_env("IP_DAILY_USAGE_LIMIT", 30),
        )

    def get_anonymous_status(self, anonymous_id: str, now: datetime | None = None) -> UsageStatus:
        current_time = now or datetime.now(UTC)
        used = self.store.get(self._daily_key("anonymous", anonymous_id, current_time))

        return self._build_status("anonymous", self.anonymous_daily_limit, used, current_time)

    def ensure_anonymous_allowed(
        self,
        anonymous_id: str,
        ip_address: str,
        now: datetime | None = None,
    ) -> None:
        current_time = now or datetime.now(UTC)
        anonymous_used = self.store.get(self._daily_key("anonymous", anonymous_id, current_time))
        ip_used = self.store.get(self._daily_key("ip", ip_address, current_time))

        if anonymous_used >= self.anonymous_daily_limit or ip_used >= self.ip_daily_limit:
            raise UsageLimitExceeded

    def record_anonymous_generation(
        self,
        anonymous_id: str,
        ip_address: str,
        now: datetime | None = None,
    ) -> UsageStatus:
        current_time = now or datetime.now(UTC)
        used = self.store.increment(self._daily_key("anonymous", anonymous_id, current_time))
        self.store.increment(self._daily_key("ip", ip_address, current_time))

        return self._build_status("anonymous", self.anonymous_daily_limit, used, current_time)

    def _build_status(
        self,
        plan: str,
        limit: int,
        used: int,
        now: datetime,
    ) -> UsageStatus:
        return UsageStatus(
            plan=plan,
            limit=limit,
            used=used,
            remaining=max(limit - used, 0),
            reset_at=next_utc_midnight(now),
        )

    def _daily_key(self, scope: str, identifier: str, now: datetime) -> str:
        return f"usage:{now.date().isoformat()}:{scope}:{identifier}"


def get_positive_int_env(name: str, default: int) -> int:
    value = os.getenv(name)

    if value is None:
        return default

    try:
        parsed = int(value)
    except ValueError:
        return default

    return parsed if parsed > 0 else default


def next_utc_midnight(now: datetime) -> datetime:
    normalized = now.astimezone(UTC)
    return datetime.combine(
        normalized.date() + timedelta(days=1),
        datetime.min.time(),
        tzinfo=UTC,
    )
