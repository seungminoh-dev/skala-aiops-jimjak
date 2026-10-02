"""
드리프트 감시 상태 조회 — 대시보드(모니터링 화면)용 읽기 전용 API.

GET /monitoring/status
    임계값과 그 출처(보정값/기본값), 연속 초과 횟수, 최근 판정 기록(오래된 것 → 최근).
    판정 자체는 /predict/batch-test 가 예측을 쌓을 때 monitoring/retrain_trigger.py 에서 일어난다.
"""
from fastapi import APIRouter

from serving_app.monitoring import drift_detector as dd

router = APIRouter(prefix="/monitoring")


@router.get("/status")
def status():
    threshold, source = dd.load_threshold()
    history = dd.STATE.history
    return {
        "threshold": round(threshold, 2),
        "threshold_source": source,
        "min_threshold": dd.MIN_THRESHOLD,
        "window_size": dd.WINDOW_SIZE,
        "consecutive": dd.STATE.consecutive,
        "limit": dd.CONSECUTIVE_LIMIT,
        "last": history[-1] if history else None,
        "history": history,
    }
