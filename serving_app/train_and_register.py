import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mlflow
import mlflow.tensorflow
import numpy as np
from mlflow.tracking import MlflowClient
from tensorflow import keras

from data.features import load_rows, build_sequences, train_test_split, JimJakScaler
from data.storage import latest_upload
from serving_app.lstm_model import build_model

# 시드 고정: LSTM 가중치 초기화가 랜덤이라 시드 없이는 실행마다 RMSE가 크게 흔들려
# (관찰치: 2.22~5.29) 게이트($4.00) 통과 여부가 운에 좌우됩니다. numpy/tensorflow/python
# random을 한 번에 고정해 재현 가능한 학습 결과를 보장합니다.
SEED = 42
keras.utils.set_random_seed(SEED)

RMSE_GATE = 4.00
MODEL_NAME = "HAIC_Predictor"
SCALER_PATH = "serving_app/models/scaler.pkl"
BASE_EPOCHS = 100  # 3층 LSTM + 3년치 데이터 기준, RMSE가 안정적으로 게이트 아래로 수렴하는 지점
FINE_TUNE_EPOCHS = 10
FINE_TUNE_LR = 1e-4  # base 학습(1e-3)보다 낮은 학습률로 살짝만 갱신


def rmse(y_true, y_pred) -> float:
    return float(np.sqrt(np.mean((np.array(y_true) - np.array(y_pred)) ** 2)))


def _prepare(rows: list[dict], scaler: JimJakScaler):
    X, y = build_sequences(rows, scaler)
    X_train, y_train, X_test, y_test = train_test_split(X, y)
    X_train = np.array(X_train, dtype="float32")
    X_test = np.array(X_test, dtype="float32")
    y_train_scaled = np.array([scaler.scale_wait_min(v) for v in y_train], dtype="float32")
    return X_train, y_train_scaled, X_test, y_test


def _register_if_gate_passed(model, run_id: str, score: float) -> dict:
    result = {"run_id": run_id, "rmse": score, "promoted": False}
    if score <= RMSE_GATE:
        v = mlflow.register_model(f"runs:/{run_id}/model", MODEL_NAME)
        MlflowClient().transition_model_version_stage(name=MODEL_NAME, version=v.version, stage="Production")
        result["promoted"] = True
        result["version"] = v.version
        print(f"[GATE PASSED] rmse={score:.2f} -> {MODEL_NAME} v{v.version} promoted to Production")
    else:
        print(f"[GATE FAILED] rmse={score:.2f} > {RMSE_GATE} -> 배포 차단, 기존 Production 유지")
    return result


def train_and_register(csv_path: str | None = None, rows: list[dict] | None = None) -> dict:
    """Day2: 처음부터(scratch) 학습. 데이터가 충분한 base 학습에서만 사용합니다.

    csv_path를 지정하지 않으면 data/uploads/에 가장 최근 업로드된 CSV를 사용합니다
    (data/storage.py의 latest_upload() - 대시보드에서 업로드한 파일).
    """
    if rows is None:
        rows = load_rows(csv_path or latest_upload())
    scaler = JimJakScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test = _prepare(rows, scaler)

    with mlflow.start_run(run_name="base-train"):
        model = build_model()
        model.fit(X_train, y_train_scaled, epochs=BASE_EPOCHS, verbose=0)

        preds = [scaler.inverse_wait_min(p) for p in model.predict(X_test, verbose=0).flatten()]
        score = rmse(y_test, preds)

        mlflow.log_param("mode", "scratch")
        mlflow.log_param("epochs", BASE_EPOCHS)
        mlflow.log_metric("rmse", score)
        mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])

        return _register_if_gate_passed(model, mlflow.active_run().info.run_id, score)


def fine_tune(rows: list[dict]) -> dict:
    """
    Day3: 현재 Production 모델 가중치에서 이어서(warm start), 넘겨받은 rows(최근 데이터)로
    짧게 fine-tuning합니다. rows가 적을 때(예: 최근 1개월)도 스크래치 학습보다 훨씬 안정적입니다.
    """
    scaler = JimJakScaler.load(SCALER_PATH)
    X_train, y_train_scaled, X_test, y_test = _prepare(rows, scaler)

    model = mlflow.tensorflow.load_model(f"models:/{MODEL_NAME}/Production")
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=FINE_TUNE_LR), loss="mse")

    with mlflow.start_run(run_name="fine-tune"):
        model.fit(X_train, y_train_scaled, epochs=FINE_TUNE_EPOCHS, verbose=0)

        preds = [scaler.inverse_wait_min(p) for p in model.predict(X_test, verbose=0).flatten()]
        score = rmse(y_test, preds)

        mlflow.log_param("mode", "fine-tune")
        mlflow.log_param("epochs", FINE_TUNE_EPOCHS)
        mlflow.log_param("n_rows", len(rows))
        mlflow.log_metric("rmse", score)
        mlflow.tensorflow.log_model(model, name="model", input_example=X_train[:1])

        return _register_if_gate_passed(model, mlflow.active_run().info.run_id, score)


if __name__ == "__main__":
    train_and_register()
