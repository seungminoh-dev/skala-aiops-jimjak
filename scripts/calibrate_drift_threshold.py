"""
드리프트 판정 기준(임계값) 보정 — 기획서 ③ "정상 데이터로 측정한 21회 MAE 중 상위 5%".

현재 서빙 모델로 정상 데이터(기본 data/normal_2w.csv)를 /predict/batch-test 와 같은 방식으로 예측하고
(직전 20편 → 다음 편), 연속된 21회 예측마다 MAE 를 재서(한 편씩 밀며) 그 상위 5%(p95)를 임계값으로 저장한다.
배포 기준(5분)보다 낮게 나오면 5분으로 올린다(drift_detector.MIN_THRESHOLD).

실행 (학습이 끝나 모델이 있어야 한다. MLflow Production 모델을 쓰려면 MODEL_SOURCE=mlflow):
    MODEL_SOURCE=mlflow python scripts/calibrate_drift_threshold.py [정상 데이터 CSV]
결과: serving_app/monitoring/drift_threshold.json (서버가 판정할 때 읽는다)
"""
import datetime as dt
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.features import SEQ_LEN, load_rows  # noqa: E402
from serving_app import model_loader  # noqa: E402
from serving_app.monitoring.drift_detector import MIN_THRESHOLD, THRESHOLD_PATH, WINDOW_SIZE  # noqa: E402

DEFAULT_CSV = "data/normal_2w.csv"
PERCENTILE = 95


def predict_errors(rows: list[dict], model) -> list[float]:
    """batch-test 와 같은 칸 구성: 칸 k = (k편 wait_min, k+1편 seats). 반환: 실제 − 예측 (분)"""
    errors = []
    for i in range(len(rows) - SEQ_LEN):
        sequence = [{"wait_min": rows[k]["wait_min"], "next_seats": rows[k + 1]["seats"]} for k in range(i, i + SEQ_LEN)]
        target = rows[i + SEQ_LEN]
        errors.append(target["wait_min"] - model.predict_one(sequence))
    return errors


def window_maes(errors: list[float], size: int = WINDOW_SIZE) -> list[float]:
    """연속된 size 회 예측마다의 MAE (한 편씩 밀며)"""
    abs_err = np.abs(np.asarray(errors, dtype=float))
    return [float(abs_err[i : i + size].mean()) for i in range(len(abs_err) - size + 1)]


def main(csv_path: str = DEFAULT_CSV) -> dict:
    rows = [r for r in load_rows(csv_path) if not r["event_tag"]]  # 정상 구간만
    model = model_loader.get_model()
    maes = window_maes(predict_errors(rows, model))
    if not maes:
        raise SystemExit(f"{csv_path}: 판정 창을 만들 만큼 행이 없습니다 (최소 {SEQ_LEN + WINDOW_SIZE}행)")

    p95 = float(np.percentile(maes, PERCENTILE))
    result = {
        "threshold": round(max(p95, MIN_THRESHOLD), 2),
        "p95": round(p95, 2),
        "min_threshold": MIN_THRESHOLD,
        "percentile": PERCENTILE,
        "windows": len(maes),
        "window_mae_mean": round(float(np.mean(maes)), 2),
        "window_mae_max": round(float(np.max(maes)), 2),
        "source_csv": os.path.basename(csv_path),
        "model_version": model.version,
        "measured_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    with open(THRESHOLD_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"정상 21회 MAE {len(maes)}개: 평균 {result['window_mae_mean']}분, 최대 {result['window_mae_max']}분")
    print(f"p{PERCENTILE} = {result['p95']}분 → 임계값 {result['threshold']}분 (최소 {MIN_THRESHOLD}분)")
    print(f"저장: {THRESHOLD_PATH}")
    return result


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV)
