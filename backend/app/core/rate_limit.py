from __future__ import annotations

import time
from collections import defaultdict, deque
from threading import Lock
from typing import Optional

from fastapi import HTTPException, Request, status
from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings


class _RateLimiter:
    def __init__(self) -> None:
        self._redis_client: Optional[Redis] = None
        self._redis_init_failed = False
        self._fallback_buckets: dict[str, deque[float]] = defaultdict(deque)
        self._fallback_lock = Lock()

    def _get_redis_client(self) -> Optional[Redis]:
        if self._redis_init_failed:
            return None
        if self._redis_client is not None:
            return self._redis_client

        try:
            client = Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
                retry_on_timeout=False,
            )
            client.ping()
            self._redis_client = client
            return self._redis_client
        except RedisError:
            self._redis_init_failed = True
            return None

    def _check_with_redis(self, key: str, limit: int, window_seconds: int) -> Optional[int]:
        client = self._get_redis_client()
        if client is None:
            return None

        try:
            pipe = client.pipeline()
            pipe.incr(key, 1)
            pipe.ttl(key)
            count, ttl = pipe.execute()

            if int(count) == 1 or int(ttl) == -1:
                client.expire(key, window_seconds)
                ttl = window_seconds

            if int(count) > limit:
                return max(int(ttl), 1)
            return 0
        except RedisError:
            return None

    def _check_with_fallback(self, key: str, limit: int, window_seconds: int) -> int:
        now = time.time()
        window_start = now - window_seconds

        with self._fallback_lock:
            bucket = self._fallback_buckets[key]
            while bucket and bucket[0] <= window_start:
                bucket.popleft()

            bucket.append(now)
            if len(bucket) > limit:
                retry_after = int(window_seconds - (now - bucket[0]))
                return max(retry_after, 1)

            if not bucket:
                self._fallback_buckets.pop(key, None)
            return 0

    def check(self, key: str, limit: int, window_seconds: int) -> int:
        if not settings.RATE_LIMIT_ENABLED:
            return 0
        if limit <= 0 or window_seconds <= 0:
            return 0

        redis_result = self._check_with_redis(key, limit, window_seconds)
        if redis_result is None:
            return self._check_with_fallback(key, limit, window_seconds)
        return redis_result


rate_limiter = _RateLimiter()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip

    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip

    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def enforce_rate_limit(
    *,
    key: str,
    limit: int,
    window_seconds: int,
    detail: str = "Too many requests, please try again later.",
) -> None:
    retry_after = rate_limiter.check(key=key, limit=limit, window_seconds=window_seconds)
    if retry_after > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after)},
        )
