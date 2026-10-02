"""
드리프트 판정 → (알림 / 재학습)을 잇는 조립 지점 — 기획서 ③ "드리프트 판정과 대응", "재학습".

/predict/batch-test(serving_app/routers/predict.py)가 예측을 쌓을 때마다 check_and_trigger()를 부른다.
판정은 drift_detector.judge()가 하고, 여기서는 판정에 맞춰 로그를 남기고 다음 동작을 고른다.

    ok          [INFO]  정상
    warn        [WARN]  드리프트 감지 (1/2)
    alert_only  [ALERT] 일시적 이상 — 알림만, 재학습하지 않음 (그 구간은 재학습 데이터에서도 빠진다)
    retrain     [WARN]  드리프트 감지 (2/2) → [INFO] 재학습 시작 → [OK] 승격 / [FAIL] 배포 차단

재학습 데이터
    최신 업로드 CSV의 원본 행(이벤트·선행 이력 포함)을 fine_tune에 전달한다.
    최근 14일/마지막 3일 검증 분할과 이벤트 시퀀스 제외는 fine_tune이 담당한다.
    반환된 promoted로 실제 승격 여부를 확인하고, 실패·보류 사유도 응답에 보존한다.

불합격 시 (기획서 ③ 재학습 "불합격 시")
    새 모델이 배포 기준은 못 넘었지만 같은 검증 데이터에서 현재 모델보다 나으면
    [ALERT] 수동 승인 필요 를 남긴다 — 기존 모델은 그대로, 운영자가 대시보드 모델 화면(POST /models/approve)에서 승인해 올린다.
    불합격한 데이터 파일은 기억해 두고, 같은 파일로는 다시 재학습하지 않는다(새 업로드가 오면 다시 시도).

반환 dict 는 drift_check 로 그대로 응답에 실린다. predict.py 는 "promoted" 가 참이면 모델을 다시 불러온다.
"""
import datetime as dt
import logging
import os

from data.features import SEQ_LEN, load_rows
from data.storage import latest_upload
from serving_app.config import settings
from serving_app.monitoring import drift_detector as dd

logger = logging.getLogger("aiops")

RETRAIN_DAYS = settings.retrain_window_days  # 최근 2주 (한 라인 약 220편)
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
    """원본 행을 전달한다. 이벤트·기간 필터는 fine_tune의 시퀀스 구성 뒤 적용한다."""
    path = csv_path or latest_upload()
    rows = load_rows(path)
    if not rows:
        return [], {"file": os.path.basename(path), "rows": 0, "event_rows": 0}
    last = max(dt.datetime.strptime(r["landingDatetime"], _FMT) for r in rows)
    since = (last.replace(hour=0, minute=0) - dt.timedelta(days=days - 1)).strftime(_FMT)
    return rows, {
        "file": os.path.basename(path), "from": since, "to": last.strftime(_FMT),
        "rows": len(rows), "event_rows": sum(bool(str(r["event_tag"]).strip()) for r in rows),
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
        "[INFO] 재학습 시작: Production 모델에서 fine-tuning, %s 원본 %d편 (기간·이벤트 분할은 학습 함수에서 처리)",
        info["file"], info["rows"],
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
            "운영자가 대시보드 모델 화면에서 승인하면 승격 (run %s)",
            mae, current_mae, result.get("run_id") or "-",
        )
    return {
        "promoted": promoted,
        "version": f"v{result['version']}" if promoted and result.get("version") else None,
        "retrain": {
            "ok": result.get("status") not in ("failed", "deferred"),
            "status": result.get("status"),
            "failure_code": result.get("failure_code"),
            "error": result.get("failure_reason"),
            "dataset": result.get("dataset", {}),
            "rmse": result.get("rmse"),
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


def _serving_version() -> str | None:
    """판정 당시 서빙 중인 모델 버전 — batch-test 가 모델을 불러온 뒤 부르므로 보통 있다"""
    from serving_app import model_loader

    model = model_loader._model_cache
    return model.version if model is not None else None


def _outcome_summary(outcome: dict) -> dict:
    """판정 기록에 남길 재학습 결과 — 대시보드가 새로고침 뒤에도 승격·불합격·승인 대기·보류를 다시 그린다"""
    r = outcome.get("retrain", {})
    return {
        "promoted": outcome["promoted"],
        "version": outcome["version"],
        "status": r.get("status"),
        "held": r.get("error") == "awaiting_new_data",
        "needs_approval": r.get("needs_approval", False),
        "passed": r.get("passed"),
        "mae": r.get("mae"),
        "baseline_mae": r.get("baseline_mae"),
        "current_mae": r.get("current_mae"),
        "failed_reasons": r.get("failed_reasons", []),
        "error": r.get("error"),
        "run_id": r.get("run_id"),
    }


def check_and_trigger(recent_predictions: list[dict]) -> dict:
    verdict = dd.judge(recent_predictions)
    _log_verdict(verdict)
    version = _serving_version()
    if version and verdict["status"] != dd.PENDING:
        verdict = {**verdict, "model_version": version}
        dd.STATE.annotate_last(model_version=version)

    if verdict["status"] != dd.RETRAIN:
        return {**verdict, "promoted": False}

    outcome = _retrain()
    dd.STATE.reset()  # 통과·불합격 모두 판정 기록을 새로 시작한다
    dd.STATE.annotate_last(outcome=_outcome_summary(outcome))
    return {**verdict, **outcome}
