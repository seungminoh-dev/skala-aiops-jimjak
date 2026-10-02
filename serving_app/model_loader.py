import os
import time

from data.features import JimJakScaler

LOCAL_MODEL_PATH = "serving_app/models/haic_v1.keras"
SCALER_PATH = "serving_app/models/scaler.pkl"
MODEL_NAME = "HAIC_Predictor"  # train_and_register.py의 MODEL_NAME과 같아야 한다

_model_cache = None  # Lazy Loading 캐시


class LoadedModel:
    """local .keras와 mlflow 두 소스를 동일한 인터페이스로 감싸는 래퍼."""

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
    from tensorflow import keras

    keras_model = keras.models.load_model(LOCAL_MODEL_PATH)
    scaler = JimJakScaler.load(SCALER_PATH)
    return LoadedModel(keras_model=keras_model, scaler=scaler, version="v1-local")


def _load_from_mlflow() -> LoadedModel:
    import mlflow.tensorflow
    from mlflow.tracking import MlflowClient

    mv = MlflowClient().get_latest_versions(MODEL_NAME, stages=["Production"])[0]
    keras_model = mlflow.tensorflow.load_model(f"models:/{MODEL_NAME}/{mv.version}")
    scaler = JimJakScaler.load(SCALER_PATH)  # 스케일러는 MLflow가 아니라 항상 로컬 파일에서
    return LoadedModel(keras_model=keras_model, scaler=scaler, version=f"v{mv.version}")


def _load_model() -> LoadedModel:
    source = os.getenv("MODEL_SOURCE", "local")
    if source == "mlflow":
        return _load_from_mlflow()
    return _load_from_local()


def load_eager() -> LoadedModel:
    """Eager Loading: 서버 시작 시점에 즉시 모델을 로드한다."""
    start = time.time()
    model = _load_model()
    print(f"[eager] model loaded in {time.time() - start:.3f}s at startup")
    global _model_cache
    _model_cache = model
    return model


def get_model() -> LoadedModel:
    """Lazy Loading: 첫 요청이 들어올 때만 로드하고, 이후에는 캐시를 재사용한다."""
    global _model_cache
    if _model_cache is None:
        start = time.time()
        _model_cache = _load_model()
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
