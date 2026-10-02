"""
드리프트 판정 → (알림 / 재학습)을 잇는 조립 지점 — 기획서 ③ "드리프트 판정과 대응", "재학습".

/predict/batch-test(serving_app/routers/predict.py)가 예측을 쌓을 때마다 check_and_trigger()를 부른다.
판정은 drift_detector.judge()가 하고, 여기서는 판정에 맞춰 로그를 남기고 다음 동작을 고른다.

    ok          [INFO]  정상
    warn        [WARN]  드리프트 감지 (1/2)
    alert_only  [ALERT] 일시적 이상 — 알림만, 재학습하지 않음 (그 구간은 재학습 데이터에서도 빠진다)
    retrain     [WARN]  드리프트 감지 (2/2) → [INFO] 재학습 시작 → [OK] 승격 / [FAIL] 배포 차단

재학습 데이터 (기획서 ③ 재학습)
    가장 최근에 업로드된 CSV(새 기간 데이터)에서 마지막 착륙 시각 기준 최근 2주를 고르고,
    이벤트 표시(event_tag)가 있는 편을 뺀다. 이것을 train_and_register.fine_tune()에 넘기면
    Production 가중치에서 이어서 학습(10 epoch)하고, 마지막 며칠(settings.json)을 검증으로 떼어 배포 기준을 재검증한다
    ([OK] / [FAIL] 로그와 승격은 fine_tune 쪽이 남긴다 — 여기서 다시 쓰지 않는다).
    재학습이 끝나면(통과·불합격 모두) 연속 횟수를 0 으로 돌린다.

불합격 시 (기획서 ③ 재학습 "불합격 시")
    새 모델이 배포 기준은 못 넘었지만 같은 검증 데이터에서 현재 모델보다 나으면
    [ALERT] 수동 승인 필요 를 남긴다 — 기존 모델은 그대로, 운영자가 MLflow에서 그 run 을 확인해 올린다.
    불합격한 데이터 파일은 기억해 두고, 같은 파일로는 다시 재학습하지 않는다(새 업로드가 오면 다시 시도).

반환 dict 는 drift_check 로 그대로 응답에 실린다. predict.py 는 "promoted" 가 참이면 모델을 다시 불러온다.
"""
import datetime as dt
import logging
import os

from data.features import SEQ_LEN, load_rows
from data.storage import latest_upload
from serving_app.monitoring import drift_detector as dd

logger = logging.getLogger("aiops")

RETRAIN_DAYS = 14  # 최근 2주 (한 라인 약 220편)
MIN_RETRAIN_ROWS = SEQ_LEN + dd.WINDOW_SIZE  # 시퀀스 20편 + 검증할 만큼은 있어야 한다
_FMT = "%Y%m%d%H%M"

_rejected_file: str | None = None  # 배포 기준에 불합격한 재학습 데이터 파일 — 같은 파일로는 다시 학습하지 않는다


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


def retrain_rows(csv_path: str | None = None, days: int = RETRAIN_DAYS) -> tuple[list[dict], dict]:
    """재학습에 쓸 행과 요약. 최신 업로드 CSV → 마지막 착륙 기준 최근 days 일 → 사건 편 제외"""
    path = csv_path or latest_upload()
    rows = load_rows(path)
    if not rows:
        return [], {"file": os.path.basename(path), "rows": 0, "events_excluded": 0}
    last = max(dt.datetime.strptime(r["landingDatetime"], _FMT) for r in rows)
    since = (last - dt.timedelta(days=days)).strftime(_FMT)
    recent = [r for r in rows if r["landingDatetime"] > since]
    plain = [r for r in recent if not r["event_tag"]]
    return plain, {
        "file": os.path.basename(path),
        "from": since,
        "to": last.strftime(_FMT),
        "rows": len(plain),
        "events_excluded": len(recent) - len(plain),
    }


def _fine_tune(rows: list[dict]) -> dict:
    # TensorFlow·MLflow 를 들고 오는 무거운 모듈이라, 재학습할 때만 불러온다
    from serving_app.train_and_register import fine_tune

    return fine_tune(rows)


def _retrain() -> dict:
    """재학습 한 번. 반환: {"promoted", "version", "retrain": {...}} — 실패해도 예외를 밖으로 내지 않는다"""
    global _rejected_file
    try:
        rows, info = retrain_rows()
    except (OSError, ValueError) as e:
        logger.error("[FAIL] 재학습 데이터를 읽지 못함: %s - 기존 모델 유지", e)
        return {"promoted": False, "version": None, "retrain": {"ok": False, "error": str(e)}}

    if len(rows) < MIN_RETRAIN_ROWS:
        logger.error("[FAIL] 재학습 데이터 부족: %d편 (최소 %d편) - 기존 모델 유지", len(rows), MIN_RETRAIN_ROWS)
        return {"promoted": False, "version": None, "retrain": {"ok": False, "error": "not_enough_rows", **info}}

    if info["file"] == _rejected_file:
        logger.warning("[ALERT] 재학습 보류: %s 로 이미 재학습했고 불합격 - 새 데이터가 올라오면 다시 시도, 기존 모델 유지", info["file"])
        return {"promoted": False, "version": None, "retrain": {"ok": False, "error": "awaiting_new_data", **info}}

    logger.info(
        "[INFO] 재학습 시작: Production 모델에서 fine-tuning, %s 최근 %d일 %d편 (사건 편 %d편 제외)",
        info["file"], RETRAIN_DAYS, info["rows"], info["events_excluded"],
    )
    try:
        result = _fine_tune(rows)
    except Exception as e:  # noqa: BLE001 — 재학습이 실패해도 서빙은 기존 모델로 계속한다
        logger.error("[FAIL] 재학습 실패: %s - 기존 모델 유지", e)
        return {"promoted": False, "version": None, "retrain": {"ok": False, "error": str(e), **info}}

    promoted = bool(result.get("promoted"))
    mae, current_mae = result.get("mae"), result.get("current_mae")
    # 배포 기준까지 평가하고 떨어진 경우만 (데이터 부족 보류·실행 오류는 status 가 deferred·failed)
    rejected = not promoted and mae is not None and result.get("status", "rejected") == "rejected"
    needs_approval = rejected and current_mae is not None and mae < current_mae
    if promoted:
        _rejected_file = None
    elif rejected:
        _rejected_file = info["file"]
    if needs_approval:
        logger.warning(
            "[ALERT] 수동 승인 필요: 새 모델 MAE %.1f분 < 현재 모델 %.1f분이지만 배포 기준 미달 - 기존 모델 유지, "
            "운영자가 MLflow run %s 확인 후 승격",
            mae, current_mae, result.get("run_id") or "-",
        )
    return {
        "promoted": promoted,
        "version": f"v{result['version']}" if promoted and result.get("version") else None,
        "retrain": {
            "ok": True,
            "status": result.get("status"),
            "passed": result.get("passed"),
            "mae": mae,
            "baseline_mae": result.get("baseline_mae"),
            "current_mae": current_mae,
            "failed_reasons": result.get("failed_reasons", []),
            "needs_approval": needs_approval,
            "run_id": result.get("run_id"),
            **info,
        },
    }


def check_and_trigger(recent_predictions: list[dict]) -> dict:
    verdict = dd.judge(recent_predictions)
    _log_verdict(verdict)

    if verdict["status"] != dd.RETRAIN:
        return {**verdict, "promoted": False}

    outcome = _retrain()
    dd.STATE.reset()  # 통과·불합격 모두 판정 기록을 새로 시작한다
    return {**verdict, **outcome}
