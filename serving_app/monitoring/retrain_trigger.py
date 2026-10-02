"""
드리프트 판정 → (알림 / 재학습)을 잇는 조립 지점 — 기획서 ③ "드리프트 판정과 대응".

/predict/batch-test(serving_app/routers/predict.py)가 예측을 쌓을 때마다 check_and_trigger()를 부른다.
판정은 drift_detector.judge()가 하고, 여기서는 판정에 맞춰 로그를 남기고 다음 동작을 고른다.

    ok          [INFO]  정상
    warn        [WARN]  드리프트 감지 (1/2)
    alert_only  [ALERT] 일시적 이상 — 알림만, 재학습하지 않음
    retrain     [WARN]  드리프트 감지 (2/2) → 재학습 (재학습 연결은 feat/retrain-pipeline)

반환 dict 는 drift_check 로 그대로 응답에 실린다. predict.py 는 "promoted" 가 참이면 모델을 다시 불러온다.
"""
import logging

from serving_app.monitoring import drift_detector as dd

logger = logging.getLogger("aiops")


def _log_verdict(v: dict) -> None:
    mae, threshold = v.get("mae"), v["threshold"]
    if v["status"] == dd.OK:
        logger.info("[INFO] 드리프트 점검 정상: MAE %.1f분 ≤ 임계값 %.1f분", mae, threshold)
    elif v["status"] == dd.WARN:
        logger.warning("[WARN] 드리프트 감지 (%d/%d): MAE %.1f분 > 임계값 %.1f분", v["consecutive"], v["limit"], mae, threshold)
    elif v["status"] == dd.ALERT_ONLY:
        plain = v["mae_without_events"]
        logger.warning(
            "[ALERT] 일시적 이상(%s %d편): MAE %.1f분 > 임계값 %.1f분 - 알림만, 재학습하지 않음%s",
            ",".join(v["event_tags"]), v["event_count"], mae, threshold,
            f" (사건 편 제외 MAE {plain:.1f}분)" if plain is not None else "",
        )
    elif v["status"] == dd.RETRAIN:
        logger.warning(
            "[WARN] 드리프트 감지 (%d/%d): MAE %.1f분 > 임계값 %.1f분 - 재학습 시작", v["consecutive"], v["limit"], mae, threshold,
        )


def check_and_trigger(recent_predictions: list[dict]) -> dict:
    verdict = dd.judge(recent_predictions)
    _log_verdict(verdict)

    if verdict["status"] != dd.RETRAIN:
        return {**verdict, "promoted": False}

    # 재학습 연결은 feat/retrain-pipeline 에서 채운다. 여기서는 요청만 기록하고, 연속 횟수를 새로 센다.
    logger.info("[INFO] 재학습 요청 기록 (재학습 연결 전)")
    dd.STATE.reset()
    return {**verdict, "promoted": False}
