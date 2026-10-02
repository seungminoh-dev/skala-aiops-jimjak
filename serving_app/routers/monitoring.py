"""
드리프트 감시 상태 — 대시보드(모니터링 화면)용 API.

GET /monitoring/status
    임계값과 그 출처(보정값/기본값), 연속 초과 횟수, 지금 감시 창에 모인 편 수,
    최근 판정 기록(오래된 것 → 최근. 순번·시각·21편·운영 버전·재학습 결과 포함).
    판정 자체는 /predict/batch-test 가 예측을 쌓을 때 monitoring/retrain_trigger.py 에서 일어난다.

POST /monitoring/reset
    데모 초기화 — 판정 기록·연속 횟수·감시 창(최근 예측)·불합격 파일 기억을 비운다.
    운영 모델은 그대로 둔다 (버전을 되돌리려면 POST /models/rollback).
"""
import logging

from fastapi import APIRouter

from serving_app.monitoring import drift_detector as dd
from serving_app.schemas import response_example
from serving_app.monitoring import retrain_trigger
from serving_app.routers import predict

logger = logging.getLogger("aiops")

router = APIRouter(prefix="/monitoring", tags=["모니터링"])


@router.get("/status", summary="드리프트 감시 상태 조회",
    description="MAE 임계값(분), 출처(calibrated/default), 이벤트 없는 연속 초과 횟수와 최근 판정을 반환합니다. "
                "보정 파일이 없거나 유효하지 않으면 기본 임계값을 사용하므로 threshold와 threshold_source를 함께 확인합니다. "
                "조회만으로 드리프트 판정이나 재학습을 실행하지 않습니다.",
    responses={200: response_example("기본 임계값을 사용하는 초기 상태(보정 결과에 따라 값이 달라짐)",
        {"threshold": 6.0, "threshold_source": "default", "min_threshold": 5.0,
         "window_size": 21, "window_count": 0, "consecutive": 0, "limit": 2, "last": None, "history": []})})
def status():
    threshold, source = dd.load_threshold()
    history = dd.STATE.history
    return {
        "threshold": round(threshold, 2),
        "threshold_source": source,
        "min_threshold": dd.MIN_THRESHOLD,
        "window_size": dd.WINDOW_SIZE,
        "window_count": min(len(predict.recent_predictions), dd.WINDOW_SIZE),
        "consecutive": dd.STATE.consecutive,
        "limit": dd.CONSECUTIVE_LIMIT,
        "last": history[-1] if history else None,
        "history": history,
    }


@router.post("/reset", summary="데모 감시 상태 초기화",
    description="판정 기록·연속 초과 횟수·감시 창·불합격 파일 기억을 비웁니다. 운영 모델과 버전은 유지합니다.",
    responses={200: response_example("초기화 완료", {"ok": True})})
def reset():
    dd.STATE.clear()
    predict.recent_predictions.clear()
    retrain_trigger._rejected_file = None
    logger.info("[INFO] 데모 초기화: 판정 기록·연속 횟수·감시 창을 비움 (운영 모델은 그대로)")
    return {"ok": True}
