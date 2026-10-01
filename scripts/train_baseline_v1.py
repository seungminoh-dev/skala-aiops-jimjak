import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.features import load_rows, build_sequences, train_test_split, JimJakScaler, fit_training_scaler
from serving_app.lstm_model import build_model

MODEL_PATH = "serving_app/models/haic_v1.keras"
SCALER_PATH = "serving_app/models/scaler.pkl"
BASE_EPOCHS = 100


def rmse(y_true, y_pred) -> float:
    return (sum((a - b) ** 2 for a, b in zip(y_true, y_pred)) / len(y_true)) ** 0.5


def main():
    import numpy as np

    rows = load_rows("data/train_normal.csv")

    scaler = fit_training_scaler(rows)
    scaler.save(SCALER_PATH)
    print(f"scaler fit on {len(rows)}행 -> {SCALER_PATH}")

    X, y = build_sequences(rows, scaler)  # y: 스케일 안 된 처리 시간(분)
    X_train, y_train, X_test, y_test = train_test_split(X, y)
    X_train = np.array(X_train, dtype="float32")
    X_test = np.array(X_test, dtype="float32")
    y_train_scaled = np.array([scaler.scale_wait_min(v) for v in y_train], dtype="float32")

    model = build_model()
    model.fit(X_train, y_train_scaled, epochs=BASE_EPOCHS, verbose=0)

    preds_scaled = model.predict(X_test, verbose=0).flatten()
    preds = [scaler.inverse_wait_min(p) for p in preds_scaled]  # 실제 분 단위로 복원
    score = rmse(y_test, preds)
    print(f"baseline v1 RMSE = {score:.2f}  (배포 게이트: $4.00)")

    model.save(MODEL_PATH)
    print(f"saved -> {MODEL_PATH}")
    if score > 4.00:
        print(
            "※ 참고: 이 RMSE는 Day1 로컬 모델이며 배포 게이트($4.00) 통과 여부는 "
            "Day2에서 MLflow로 다시 정식 검증합니다."
        )


if __name__ == "__main__":
    main()
