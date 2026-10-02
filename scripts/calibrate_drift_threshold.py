"""
드리프트 판정 기준(임계값) 보정 — 직접 실행용. 계산은 serving_app/monitoring/calibration.py 가 한다.

운영 모델로 정상 데이터(기본 data/normal_2w.csv)의 21편 창 MAE 상위 5%(p95)를 재서
임계값 = max(p95, 배포 기준 5분) 으로 저장한다. Docker 는 init(serving_app.initialize_model)이 최초 학습 뒤 자동으로 한다.

실행 (학습이 끝나 모델이 있어야 한다. MLflow Production 모델을 쓰려면 MODEL_SOURCE=mlflow):
    MODEL_SOURCE=mlflow python scripts/calibrate_drift_threshold.py [정상 데이터 CSV]
결과: DRIFT_THRESHOLD_PATH (기본 serving_app/monitoring/drift_threshold.json) — 서버가 판정할 때 읽는다
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from serving_app import model_loader  # noqa: E402
from serving_app.monitoring.calibration import DEFAULT_CSV, PERCENTILE, calibrate  # noqa: E402
from serving_app.monitoring.drift_detector import MIN_THRESHOLD, THRESHOLD_PATH  # noqa: E402


def main(csv_path: str = DEFAULT_CSV) -> dict:
    result = calibrate(model_loader.get_model(), csv_path)
    print(f"정상 21회 MAE {result['windows']}개: 평균 {result['window_mae_mean']}분, 최대 {result['window_mae_max']}분")
    print(f"p{PERCENTILE} = {result['p95']}분 → 임계값 {result['threshold']}분 (최소 {MIN_THRESHOLD}분)")
    print(f"저장: {THRESHOLD_PATH}")
    return result


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV)
