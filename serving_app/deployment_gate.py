import numpy as np

from serving_app.config import settings

MAE_LIMIT = settings.mae_limit
BASELINE_RATIO = settings.baseline_ratio


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
        failed.append(f"MAE가 {MAE_LIMIT:g}분을 초과했습니다.")
    if mae > baseline_mae * BASELINE_RATIO:
        failed.append(f"직전 {settings.sequence_length}편 평균 대비 MAE가 {(1 - BASELINE_RATIO) * 100:g}% 이상 개선되지 않았습니다.")
    if current_mae is not None and mae > current_mae:
        failed.append("현재 Production 모델보다 MAE가 높습니다.")
    return {
        "mae": mae,
        "rmse": float(np.sqrt(np.mean((actual - predicted) ** 2))),
        "baseline_mae": baseline_mae,
        "baseline_rmse": float(np.sqrt(np.mean((actual - mean_prediction) ** 2))),
        "current_rmse": float(np.sqrt(np.mean((actual - arrays[3]) ** 2))) if current is not None else None,
        "current_mae": current_mae,
        "passed": not failed,
        "failed_reasons": failed,
        "current_comparison": "skipped_initial_deployment" if current is None else "evaluated",
    }
