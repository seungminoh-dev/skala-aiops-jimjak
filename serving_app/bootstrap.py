"""
첫 실행 — 운영(Production) 모델이 없으면 서버가 기본 모델(v1)을 스스로 학습·등록한다.

Docker 는 init(serving_app.initialize_model)이 먼저 학습하지만, init 없이 띄우거나 로컬에서 처음 띄우면
운영 모델이 없어 /predict 가 500 으로 실패했다. 이제 모델을 처음 찾을 때(lazy: 첫 /predict, eager: 서버 시작)
운영 모델이 없으면 백그라운드에서 initialize_model 을 한 번 돌리고
(기본 데이터 학습 → 배포 기준 → 등록 → 드리프트 임계값 보정, 로컬 기준 약 30초), 끝나면 서빙 캐시에 올린다.
그동안 /health 는 503 {"status": "training"}, /predict 는 503 으로 답한다.

MODEL_SOURCE=local 이면 학습하지 않는다 (로컬 번들은 scripts/train_baseline_v1.py 로 만든다).
학습이 실패하면 다시 시도하지 않는다 — python -m serving_app.initialize_model 로 직접 돌린다.
"""
import logging
import os
import threading

from serving_app.config import settings

logger = logging.getLogger("aiops")

IDLE, TRAINING, READY, FAILED = "idle", "training", "ready", "failed"

_lock = threading.Lock()
_state = {"status": IDLE, "error": None}
_thread: threading.Thread | None = None


def status() -> str:
    return _state["status"]


def start() -> bool:
    """기본 모델 학습을 시작한다. 이미 돌고 있거나·끝났거나·실패했거나 local 모드면 그대로 둔다 (시작했으면 True)"""
    global _thread
    if settings.model_source != "mlflow":
        return False
    with _lock:
        if _state["status"] != IDLE:
            return False
        _state.update(status=TRAINING, error=None)
        _thread = threading.Thread(target=_train, name="jimjak-bootstrap", daemon=True)
    _thread.start()
    return True


def _train() -> None:
    from serving_app import model_loader
    from serving_app.initialize_model import initialize_model

    logger.info("[INFO] 운영 모델이 없어 기본 모델 학습을 시작합니다 (%s)", os.path.basename(settings.training_data_path))
    try:
        result = initialize_model()
        if result["status"] not in ("promoted", "existing"):
            raise RuntimeError("기본 모델이 배포 기준을 통과하지 못했습니다")
        model = model_loader.reload_model()
    except Exception as e:  # noqa: BLE001
        _state.update(status=FAILED, error=str(e))
        logger.exception("[FAIL] 기본 모델 학습 실패: %s", e)
        return
    _state.update(status=READY)
    logger.info("[OK] 기본 모델 %s 준비 완료: 예측을 시작합니다", model.version)


def message() -> str:
    """운영 모델이 없을 때 /predict 503 응답 글자"""
    if settings.model_source != "mlflow":
        return f"로컬 모델이 없어요 ({settings.local_model_dir}). python scripts/train_baseline_v1.py 로 먼저 만드세요."
    if _state["status"] == FAILED:
        return f"기본 모델 학습에 실패했어요 ({_state['error']}). python -m serving_app.initialize_model 로 다시 학습하세요."
    return "운영 모델이 아직 없어 기본 모델(v1)을 학습하고 있어요. 30초쯤 뒤에 다시 시도하세요."
