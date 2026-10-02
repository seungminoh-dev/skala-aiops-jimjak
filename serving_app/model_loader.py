import json
import time
from pathlib import Path

from data.features import JimJakScaler
from serving_app.config import settings
from serving_app import model_registry

MODEL_NAME = settings.model_name

_model_cache = None  # Lazy Loading 캐시


class ModelNotReady(ValueError):
    """운영 모델이 아직 없다 — 서버는 503 으로 답하고 기본 모델 학습을 시작한다 (serving_app/bootstrap.py)"""


class LoadedModel:
    """로컬 번들과 MLflow 등록 버전을 동일한 인터페이스로 감싸는 래퍼."""

    def __init__(self, keras_model, scaler: JimJakScaler, version: str):
        self._keras_model = keras_model
        self.scaler = scaler
        self.version = version

    def predict_one(self, sequence: list[dict]) -> float:
        """
        sequence: [{"wait_min": ..., "next_seats": ...}, ...] 길이 SEQ_LEN, 오래된 편 -> 최근 편 순서.
        """
        import numpy as np

        scaled = [self.scaler.transform_point(p["wait_min"], p["next_seats"]) for p in sequence]
        x = np.array([scaled], dtype="float32")  # (1, SEQ_LEN, 2)
        pred_scaled = float(self._keras_model.predict(x, verbose=0)[0][0])
        return self.scaler.inverse_wait_min(pred_scaled)


def _load_from_local() -> LoadedModel:
    directory = Path(settings.local_model_dir)
    if not (directory / "version.json").exists():
        raise ModelNotReady(f"로컬 모델 번들이 없습니다: {directory}")
    model, scaler, metadata = model_registry.load_bundle(directory)
    manifest = json.loads((directory / "version.json").read_text())
    if manifest["model_name"] != MODEL_NAME or manifest["run_id"] != metadata["run_id"]:
        raise ValueError("로컬 버전 정보가 모델 번들과 다릅니다.")
    version = model_registry.version_string(manifest["version"])
    if settings.model_version and version != model_registry.version_string(settings.model_version):
        raise ValueError("MODEL_VERSION과 로컬 번들의 버전이 다릅니다.")
    return LoadedModel(model, scaler, version)


def _load_from_mlflow() -> LoadedModel:
    version = settings.model_version
    if not version:
        current = model_registry.current_version()
        if current is None:
            raise ModelNotReady(f"{MODEL_NAME}에 Production 모델이 없습니다. 학습·배포 판정을 먼저 확인하세요.")
        version = current.version
    model, scaler, _ = model_registry.load_version(version)
    return LoadedModel(model, scaler, model_registry.version_string(version))


def _load_model() -> LoadedModel:
    if settings.model_source == "mlflow":
        return _load_from_mlflow()
    return _load_from_local()


def _start_bootstrap() -> None:
    from serving_app import bootstrap

    bootstrap.start()  # 첫 실행: 기본 모델을 백그라운드에서 학습 (이미 돌고 있으면 그대로)


def load_eager() -> LoadedModel | None:
    """Eager Loading: 서버 시작 시점에 즉시 모델을 로드한다. 운영 모델이 없으면 기본 모델 학습을 시작하고 None."""
    start = time.time()
    try:
        model = _load_model()
    except ModelNotReady:
        _start_bootstrap()
        print("[eager] 운영 모델이 없어 기본 모델을 백그라운드에서 학습합니다")
        return None
    print(f"[eager] model loaded in {time.time() - start:.3f}s at startup")
    global _model_cache
    _model_cache = model
    return model


def get_model() -> LoadedModel:
    """Lazy Loading: 첫 요청이 들어올 때만 로드하고, 이후에는 캐시를 재사용한다."""
    global _model_cache
    if _model_cache is None:
        start = time.time()
        try:
            _model_cache = _load_model()
        except ModelNotReady:
            _start_bootstrap()
            raise
        print(f"[lazy] model loaded in {time.time() - start:.3f}s on first request")
    return _model_cache


def reload_model() -> LoadedModel:
    """
    Day3: 재학습으로 새 버전이 Production이 되면 캐시를 새 모델로 바꾼다 (가이드 부록 1 #6).
    새 모델을 다 불러온 뒤에 바꾸므로, 로드에 실패하면 기존 모델이 그대로 남는다.
    """
    global _model_cache
    _model_cache = _load_model()
    return _model_cache
