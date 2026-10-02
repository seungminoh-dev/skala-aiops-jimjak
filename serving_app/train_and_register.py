import os
import logging
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mlflow
import mlflow.tensorflow
import numpy as np
from mlflow.tracking import MlflowClient
from tensorflow import keras

from data.features import load_rows, build_sequences, train_test_split, JimJakScaler, sequence_samples
from serving_app.deployment_gate import evaluate_gate
from data.storage import latest_upload
from serving_app.lstm_model import build_model

SEED = 42
keras.utils.set_random_seed(SEED)

logger = logging.getLogger("aiops")
MODEL_NAME = "HAIC_Predictor"
SCALER_PATH = "serving_app/models/scaler.pkl"
BASE_EPOCHS = 100
FINE_TUNE_EPOCHS = 10
FINE_TUNE_LR = 1e-4  # base 학습(1e-3)보다 낮은 학습률로 살짝만 갱신


def _prepare(rows: list[dict], scaler: JimJakScaler):
    X, y = build_sequences(rows, scaler)
    X_train, y_train, X_test, y_test = train_test_split(X, y)
    X_train = np.array(X_train, dtype="float32")
    X_test = np.array(X_test, dtype="float32")
    y_train_scaled = np.array([scaler.scale_wait_min(v) for v in y_train], dtype="float32")
    return X_train, y_train_scaled, X_test, y_test


def _predict_minutes(model, scaler, X):
    return [scaler.inverse_wait_min(float(p)) for p in model.predict(X, verbose=0).flatten()]


def _current_version():
    versions = MlflowClient().search_model_versions(f"name='{MODEL_NAME}'")
    production = [v for v in versions if v.current_stage == "Production"]
    if len(production) > 1:
        raise ValueError("Production 버전이 여러 개입니다. 운영 버전을 먼저 정리하세요.")
    return production[0] if production else None


def _validation_baseline(rows, n_train):
    return [float(np.mean([r["wait_min"] for r in history]))
            for history, _ in sequence_samples(rows)[n_train:]]


def _register_if_gate_passed(model_uri: str, run_id: str, gate: dict) -> dict:
    result = {"run_id": run_id, **gate, "promoted": False}
    if not gate["passed"]:
        logger.warning("[FAIL] 배포 차단: %s (MAE=%.3f, 평균=%.3f, 기존=%s)",
                       "; ".join(gate["failed_reasons"]), gate["mae"],
                       gate["baseline_mae"], gate["current_mae"])
        return result
    version = mlflow.register_model(model_uri, MODEL_NAME)
    MlflowClient().transition_model_version_stage(
        name=MODEL_NAME, version=version.version, stage="Production",
        archive_existing_versions=True,
    )
    result.update(promoted=True, version=version.version)
    logger.info("[OK] MAE=%.3f, Production v%s 승격", gate["mae"], version.version)
    return result


def _log_and_register(model, X_train, run_id, gate):
    for key in ("mae", "rmse", "baseline_mae", "current_mae"):
        if gate[key] is not None:
            mlflow.log_metric(key, gate[key])
    mlflow.log_dict(gate, "deployment_gate.json")
    model_info = mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])
    return _register_if_gate_passed(model_info.model_uri, run_id, gate)


def train_and_register(csv_path: str | None = None, rows: list[dict] | None = None) -> dict:
    """Day2: 처음부터(scratch) 학습. 데이터가 충분한 base 학습에서만 사용합니다.

    csv_path를 지정하지 않으면 data/uploads/에 가장 최근 업로드된 CSV를 사용합니다
    (data/storage.py의 latest_upload() - 대시보드에서 업로드한 파일).
    """
    if rows is None:
        rows = load_rows(csv_path or latest_upload())
    scaler = JimJakScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test = _prepare(rows, scaler)

    current = _current_version()
    current_preds = None
    if current is not None:
        current_model = mlflow.tensorflow.load_model(f"models:/{MODEL_NAME}/{current.version}")
        current_preds = _predict_minutes(current_model, scaler, X_test)
    baseline = _validation_baseline(rows, len(y_train_scaled))

    with mlflow.start_run(run_name="base-train"):
        model = build_model()
        model.fit(X_train, y_train_scaled, epochs=BASE_EPOCHS, verbose=0)

        preds = _predict_minutes(model, scaler, X_test)
        gate = evaluate_gate(y_test, preds, baseline, current_preds)

        mlflow.log_param("mode", "scratch")
        mlflow.log_param("epochs", BASE_EPOCHS)
        return _log_and_register(model, X_train, mlflow.active_run().info.run_id, gate)


def fine_tune(rows: list[dict]) -> dict:
    """
    Day3: 현재 Production 모델 가중치에서 이어서(warm start), 넘겨받은 rows(최근 데이터)로
    짧게 fine-tuning합니다. rows가 적을 때(예: 최근 1개월)도 스크래치 학습보다 훨씬 안정적입니다.
    """
    scaler = JimJakScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test = _prepare(rows, scaler)

    current = _current_version()
    if current is None:
        raise ValueError("fine-tuning을 시작할 Production 모델이 없습니다.")
    model = mlflow.tensorflow.load_model(f"models:/{MODEL_NAME}/{current.version}")
    # 가중치 변경하기 전에 기존 모델의 예측값 확보
    current_preds = _predict_minutes(model, scaler, X_test)
    baseline = _validation_baseline(rows, len(y_train_scaled))
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=FINE_TUNE_LR), loss="mse")

    with mlflow.start_run(run_name="fine-tune"):
        model.fit(X_train, y_train_scaled, epochs=FINE_TUNE_EPOCHS, verbose=0)

        preds = _predict_minutes(model, scaler, X_test)
        gate = evaluate_gate(y_test, preds, baseline, current_preds)

        mlflow.log_param("mode", "fine-tune")
        mlflow.log_param("epochs", FINE_TUNE_EPOCHS)
        mlflow.log_param("n_rows", len(rows))
        return _log_and_register(model, X_train, mlflow.active_run().info.run_id, gate)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    train_and_register()
