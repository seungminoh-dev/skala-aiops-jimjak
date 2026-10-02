import numpy as np

MAE_LIMIT = 5.0
BASELINE_RATIO = 0.9


def evaluate_gate(y_true, candidate, baseline, current=None):
    arrays = [np.asarray(values, dtype=float) for values in (y_true, candidate, baseline)]
    if current is not None:
        arrays.append(np.asarray(current, dtype=float))
    if any(a.ndim != 1 or a.size == 0 or a.shape != arrays[0].shape for a in arrays):
        raise ValueError("정답과 모든 예측은 길이가 같은 비어 있지 않은 1차원 배열이어야 합니다.")
    if any(not np.isfinite(a).all() for a in arrays):
        raise ValueError("정답과 예측에 NaN 또는 무한대가 있습니다.")

    actual, predicted, mean_prediction = arrays[:3]
    mae = float(np.mean(np.abs(actual - predicted)))
    baseline_mae = float(np.mean(np.abs(actual - mean_prediction)))
    current_mae = float(np.mean(np.abs(actual - arrays[3]))) if current is not None else None
    failed = []
    if mae > MAE_LIMIT:
        failed.append("MAE가 5분을 초과했습니다.")
    if mae > baseline_mae * BASELINE_RATIO:
        failed.append("직전 20편 평균 대비 MAE가 10% 이상 개선되지 않았습니다.")
    if current_mae is not None and mae > current_mae:
        failed.append("현재 Production 모델보다 MAE가 높습니다.")
    return {
        "mae": mae,
        "rmse": float(np.sqrt(np.mean((actual - predicted) ** 2))),
        "baseline_mae": baseline_mae,
        "current_mae": current_mae,
        "passed": not failed,
        "failed_reasons": failed,
        "current_comparison": "skipped_initial_deployment" if current is None else "evaluated",
    }
