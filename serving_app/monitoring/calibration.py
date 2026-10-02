"""
드리프트 판정 기준(임계값) 보정 — 기획서 ③ "판정 기준".

운영 모델로 정상 데이터(기본 data/normal_2w.csv)를 /predict/batch-test 와 같은 방식으로 예측하고
(직전 20편 → 다음 편), 21편 창을 한 편씩 밀며 잰 MAE 의 상위 5%(p95)를 구한다.
임계값 = max(p95, 배포 기준 5분) — p95 가 5분보다 낮으면 기준을 통과한 모델도 평소 오차만으로 걸릴 수 있어 5분을 하한으로 둔다.
결과는 drift_detector.THRESHOLD_PATH(환경변수 DRIFT_THRESHOLD_PATH)에 저장하고, 서버는 판정할 때 읽는다.

부르는 곳: serving_app/initialize_model.py (최초 학습 뒤·임계값 파일이 없을 때), scripts/calibrate_drift_threshold.py (직접 실행)
"""
import datetime as dt
import json
import logging
import os

import numpy as np

from data.features import SEQ_LEN, load_rows
from serving_app.config import project_path
from serving_app.monitoring.drift_detector import MIN_THRESHOLD, THRESHOLD_PATH, WINDOW_SIZE

logger = logging.getLogger("aiops")

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


def calibrate(model, csv_path: str = DEFAULT_CSV, path: str = THRESHOLD_PATH) -> dict:
    """model: predict_one(sequence) 와 version 이 있는 서빙 모델 (model_loader.LoadedModel)"""
    rows = [r for r in load_rows(str(project_path(csv_path))) if not r["event_tag"]]  # 정상 구간만
    maes = window_maes(predict_errors(rows, model))
    if not maes:
        raise ValueError(f"{csv_path}: 판정 창을 만들 만큼 행이 없습니다 (최소 {SEQ_LEN + WINDOW_SIZE}행)")

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
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    logger.info(
        "[INFO] 드리프트 임계값 보정: 정상 21편 MAE 상위 5%% %.2f분 → 임계값 %.1f분 (%s %s, 창 %d개)",
        result["p95"], result["threshold"], result["model_version"], result["source_csv"], result["windows"],
    )
    return result
