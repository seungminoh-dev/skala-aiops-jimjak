import csv
import json
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow import keras

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from data.features import (
    JimJakScaler,
    build_sequences,
    fit_training_scaler,
    load_rows,
    sequence_samples,
    train_test_split,
)
from serving_app.lstm_model import build_model

DATA_PATH = ROOT / "data/train_normal.csv"
OUTPUT_DIR = ROOT / "serving_app/models"
MODEL_PATH = OUTPUT_DIR / "haic_v1.keras"
SCALER_PATH = OUTPUT_DIR / "scaler.pkl"
BASE_EPOCHS = 100
BATCH_SIZE = 32
SEED = 42
VALIDATION_RATIO = 0.2


def predict_minutes(model, scaler, X):
    """정규화된 모델 출력을 처리 시간(분)으로 복원한다."""
    scaled = model.predict(X, verbose=0).flatten()
    return np.asarray([scaler.inverse_wait_min(float(value)) for value in scaled])


def evaluate(y_true, predicted, baseline):
    """동일한 검증 대상에서 LSTM과 직전 20편 평균 예측을 비교한다."""
    actual = np.asarray(y_true)
    mae = float(np.mean(np.abs(actual - predicted)))
    rmse = float(np.sqrt(np.mean((actual - predicted) ** 2)))
    baseline_mae = float(np.mean(np.abs(actual - baseline)))
    improvement = (1 - mae / baseline_mae) * 100 if baseline_mae > 0 else None
    return {
        "mae_min": mae,
        "rmse_min": rmse,
        "rolling_mean_mae_min": baseline_mae,
        "improvement_percent": improvement,
    }


def save_and_verify(model, scaler, X_valid, predicted):
    """저장한 모델·스케일러를 다시 읽어 예측값이 유지되는지 확인한다."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save(MODEL_PATH)
    scaler.save(SCALER_PATH)
    restored_model = keras.models.load_model(MODEL_PATH)
    restored_scaler = JimJakScaler.load(SCALER_PATH)
    restored = predict_minutes(restored_model, restored_scaler, X_valid)
    np.testing.assert_allclose(restored, predicted, rtol=1e-6, atol=1e-5)


def main():
    keras.utils.set_random_seed(SEED)
    tf.config.experimental.enable_op_determinism()

    # 검증 구간을 제외하고 스케일러를 fit한다.
    rows = load_rows(DATA_PATH)
    scaler = fit_training_scaler(rows, VALIDATION_RATIO)
    X, y = build_sequences(rows, scaler)
    X_train, y_train, X_valid, y_valid = train_test_split(X, y, VALIDATION_RATIO)
    X_train = np.asarray(X_train, dtype="float32")
    X_valid = np.asarray(X_valid, dtype="float32")
    y_train_scaled = np.asarray(
        [scaler.scale_wait_min(value) for value in y_train], dtype="float32"
    )

    print(f"학습 {len(y_train)}개 / 검증 {len(y_valid)}개", flush=True)
    model = build_model()
    model.fit(
        X_train, y_train_scaled, epochs=BASE_EPOCHS,
        batch_size=BATCH_SIZE, shuffle=False, verbose=2,
    )

    predicted = predict_minutes(model, scaler, X_valid)
    valid_samples = sequence_samples(rows)[len(y_train):]
    baseline = np.asarray([
        np.mean([row["wait_min"] for row in history])
        for history, _ in valid_samples
    ])
    metrics = evaluate(y_valid, predicted, baseline)
    save_and_verify(model, scaler, X_valid, predicted)

    report = {
        "data_file": DATA_PATH.name,
        "seed": SEED,
        "epochs": BASE_EPOCHS,
        "batch_size": BATCH_SIZE,
        "tensorflow": tf.__version__,
        "numpy": np.__version__,
        "n_rows": len(rows),
        "n_train": len(y_train),
        "n_validation": len(y_valid),
        "validation_start": valid_samples[0][1]["landingDatetime"],
        "validation_end": valid_samples[-1][1]["landingDatetime"],
        **metrics,
        "reload_verified": True,
        "evaluation_note": "직전 편의 실제 처리시간이 확인되었다고 가정한 순차 평가. ETA 1시간 전 실시간 평가가 아님.",
    }
    (OUTPUT_DIR / "baseline_metrics.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    with (OUTPUT_DIR / "baseline_predictions.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["line_id", "landingDatetime", "actual_min", "predicted_min", "rolling_mean_min"])
        for (_, target), actual, pred, mean in zip(valid_samples, y_valid, predicted, baseline):
            writer.writerow([target["line_id"], target["landingDatetime"], actual, pred, mean])

    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    print(f"모델·스케일러 저장 및 재로딩 검증 완료: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
