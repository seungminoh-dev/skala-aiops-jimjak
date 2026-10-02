"""
예측 응답 시간 기록 — 기획서 ③ 모니터링 지표 "예측 응답 시간 1초: 넘으면 로그에 기록하고 Lazy/Eager 측정값과 비교".

POST /predict 응답마다 걸린 시간을 재서
- 1초(SLOW_MS)를 넘으면 [WARN] 예측 응답 지연 로그를 남기고
- 최근 WINDOW 건을 모아 p50·p95·최대를 GET /logs/latency 로 보여준다.
모든 응답에 X-Response-Time-Ms 헤더를 붙인다(브라우저 개발자 도구·curl -i 로 바로 확인).
/predict/batch-test 는 시나리오를 한꺼번에 돌리는 시뮬레이션이라 기준에서 뺀다.
"""
import logging
import time
from collections import deque

from fastapi import Request

logger = logging.getLogger("aiops")

SLOW_MS = 1000.0
WINDOW = 500
TRACKED_PATHS = ("/predict",)


class LatencyTracker:
    def __init__(self, window: int = WINDOW, slow_ms: float = SLOW_MS):
        self.samples: deque[float] = deque(maxlen=window)
        self.slow_ms = slow_ms
        self.slow_count = 0
        self.total = 0

    def add(self, ms: float) -> bool:
        """기록하고, 기준을 넘었는지 돌려준다"""
        self.samples.append(ms)
        self.total += 1
        slow = ms > self.slow_ms
        if slow:
            self.slow_count += 1
        return slow

    @staticmethod
    def _percentile(sorted_values: list[float], p: float) -> float:
        k = (len(sorted_values) - 1) * p / 100
        lo, hi = int(k), min(int(k) + 1, len(sorted_values) - 1)
        return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (k - lo)

    def stats(self) -> dict:
        values = sorted(self.samples)
        if not values:
            return {"count": 0, "total": self.total, "slow_count": self.slow_count, "threshold_ms": self.slow_ms,
                    "p50_ms": None, "p95_ms": None, "max_ms": None}
        return {
            "count": len(values),
            "total": self.total,
            "slow_count": self.slow_count,
            "threshold_ms": self.slow_ms,
            "p50_ms": round(self._percentile(values, 50), 1),
            "p95_ms": round(self._percentile(values, 95), 1),
            "max_ms": round(values[-1], 1),
        }


TRACKER = LatencyTracker()


async def timing_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time-Ms"] = f"{ms:.1f}"
    if request.url.path in TRACKED_PATHS and TRACKER.add(ms):
        logger.warning("[WARN] 예측 응답 지연: %s %.0fms (기준 %.0fms)", request.url.path, ms, TRACKER.slow_ms)
    return response
