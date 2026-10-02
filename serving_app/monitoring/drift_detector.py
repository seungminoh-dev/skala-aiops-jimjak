"""
드리프트 판정·구분 규칙 — 기획서 ③ "드리프트 판정과 대응".

감시
    최근 예측 21회의 MAE(= 실제 처리 시간과 예측의 차이를 절댓값으로 평균, 분)를 본다.
    RMSE 도 함께 계산해 기록만 한다(판정은 MAE 로 한다 — 분 단위라 설명이 쉽고, 큰 오차 몇 개에 덜 흔들린다).

판정 기준 (임계값)
    정상 데이터로 잰 21회 MAE 의 상위 5%(p95).
    scripts/calibrate_drift_threshold.py 가 현재 Production 모델로 재서 drift_threshold.json 에 저장하고,
    여기서는 그 값을 읽는다. 파일이 없으면 DEFAULT_THRESHOLD 를 쓴다.
    배포 기준(MAE 5분)보다 낮게 잡히면 기준을 통과한 모델도 평소에 드리프트로 판정되므로,
    MIN_THRESHOLD(= 배포 기준) 아래로는 내리지 않는다.

구분 (임계값을 넘었을 때)
    - 창 안에 이벤트 표시(event_tag)가 있는 편이 있으면 → alert_only
      일시적 이상(컨베이어 고장, 개장 초기 등)으로 보고 알림만 한다. 연속 횟수는 늘리지도 줄이지도 않는다.
    - 이벤트 표시가 없으면 → warn, 연속 횟수 +1
      연속 CONSECUTIVE_LIMIT(2)회에 닿으면 → retrain (재학습은 retrain_trigger.py 가 잇는다)
    임계값 이하면 → ok, 연속 횟수는 0 으로 돌아간다.

이 모듈은 계산과 판정만 한다(로그·재학습 호출 없음). 상태(연속 횟수·최근 판정)는 DriftState 하나가 들고,
serving_app/routers/predict.py 의 recent_predictions 가 21건만 남기더라도 연속 횟수는 여기서 이어진다.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
from dataclasses import dataclass, field

WINDOW_SIZE = 21  # 최근 예측 21회
CONSECUTIVE_LIMIT = 2  # 이벤트 없는 초과가 2회 연속이면 재학습
MIN_THRESHOLD = 5.0  # 배포 기준 MAE(분). 임계값은 이보다 낮아지지 않는다
DEFAULT_THRESHOLD = MIN_THRESHOLD  # drift_threshold.json 이 없을 때 — 보정 전에는 하한(배포 기준 5분)으로 판정
HISTORY_SIZE = 50  # 상태 API 로 보여 줄 최근 판정 수

THRESHOLD_PATH = os.getenv(
    "DRIFT_THRESHOLD_PATH", os.path.join(os.path.dirname(__file__), "drift_threshold.json")
)

# 판정 종류 — /predict/batch-test 의 drift_check.status 와 같은 이름 (기획서 ⑤)
OK = "ok"
WARN = "warn"
ALERT_ONLY = "alert_only"
RETRAIN = "retrain_triggered"
PENDING = "pending"


def compute_mae(window: list[dict]) -> float:
    """window: [{"predicted": float, "actual": float, ...}]. 비어 있으면 0.0"""
    if not window:
        return 0.0
    return sum(abs(p["actual"] - p["predicted"]) for p in window) / len(window)


def compute_rmse(window: list[dict]) -> float:
    if not window:
        return 0.0
    return math.sqrt(sum((p["actual"] - p["predicted"]) ** 2 for p in window) / len(window))


def load_threshold(path: str = THRESHOLD_PATH) -> tuple[float, str]:
    """(임계값, 출처). 출처는 'calibrated' 또는 'default'"""
    try:
        with open(path, encoding="utf-8") as f:
            value = float(json.load(f)["threshold"])
        return max(value, MIN_THRESHOLD), "calibrated"
    except (OSError, ValueError, KeyError, TypeError):
        return max(DEFAULT_THRESHOLD, MIN_THRESHOLD), "default"


@dataclass
class DriftState:
    """연속 초과 횟수와 최근 판정 기록. 서버 안에 하나만 둔다(STATE)."""

    consecutive: int = 0
    history: list[dict] = field(default_factory=list)
    judged: int = 0  # 지금까지 내린 판정 수 — 판정 순번(no)

    def record(self, verdict: dict) -> None:
        self.history.append(dict(verdict))  # 응답으로 나가는 dict 와 따로 둔다 (annotate_last 는 기록에만)
        del self.history[:-HISTORY_SIZE]

    def annotate_last(self, **fields) -> None:
        """마지막 판정 기록에 덧붙인다 — 운영 버전·재학습 결과 (상태 API 로 화면을 다시 그릴 때 쓴다)"""
        if self.history:
            self.history[-1].update(fields)

    def reset(self) -> None:
        """재학습(성공·실패 모두) 뒤 — 판정 기록을 새로 시작한다(기획서 ③ 재학습 후)."""
        self.consecutive = 0

    def clear(self) -> None:
        """데모 초기화 — 연속 횟수·판정 기록·순번을 모두 비운다"""
        self.consecutive = 0
        self.history.clear()
        self.judged = 0


STATE = DriftState()


def judge(recent_predictions: list[dict], state: DriftState = STATE, threshold: float | None = None) -> dict:
    """
    최근 예측으로 판정 하나를 내리고 state 를 갱신한다.

    recent_predictions: [{"predicted": float, "actual": float, "event_tag": str}, ...] (오래된 것 → 최근)
    반환: {"status", "mae", "rmse", "threshold", "threshold_source", "consecutive", "limit",
           "window_size", "event_tags", "event_count", "mae_without_events",
           "no", "at", "points"}  — no 판정 순번, at 판정 시각, points 판정한 21편(예측·실제·사건 표시)
    """
    if threshold is None:
        threshold, source = load_threshold()
    else:
        source = "given"

    base = {"threshold": round(threshold, 2), "threshold_source": source, "limit": CONSECUTIVE_LIMIT, "window_size": WINDOW_SIZE}

    if len(recent_predictions) < WINDOW_SIZE:
        verdict = {**base, "status": PENDING, "count": len(recent_predictions), "consecutive": state.consecutive}
        return verdict

    window = recent_predictions[-WINDOW_SIZE:]
    mae = compute_mae(window)
    events = [p for p in window if p.get("event_tag")]
    plain = [p for p in window if not p.get("event_tag")]
    tags = sorted({p["event_tag"] for p in events})

    if mae <= threshold:
        state.consecutive = 0
        status = OK
    elif events:
        status = ALERT_ONLY  # 연속 횟수는 그대로
    else:
        state.consecutive += 1
        status = RETRAIN if state.consecutive >= CONSECUTIVE_LIMIT else WARN

    state.judged += 1
    verdict = {
        **base,
        "no": state.judged,
        "at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": status,
        "mae": round(mae, 2),
        "rmse": round(compute_rmse(window), 2),
        "consecutive": state.consecutive,
        "event_tags": tags,
        "event_count": len(events),
        # 사건 편을 뺀 MAE — 사건 편만 있는 창이면 잴 수 없으므로 None
        "mae_without_events": round(compute_mae(plain), 2) if events and plain else None,
        # 판정한 21편 — 대시보드 감시 창 차트 (새로고침해도 다시 그릴 수 있게 기록에도 남긴다)
        "points": [
            {"predicted": round(float(p["predicted"]), 1), "actual": float(p["actual"]), "event_tag": p.get("event_tag") or ""}
            for p in window
        ],
    }
    state.record(verdict)
    return verdict


def is_drift(recent_predictions: list[dict], threshold: float | None = None) -> bool:
    """MAE 가 임계값을 넘는가 (구분 규칙·상태 없이 수치만). 실습 스켈레톤과의 호환용"""
    if len(recent_predictions) < WINDOW_SIZE:
        return False
    limit = load_threshold()[0] if threshold is None else threshold
    return compute_mae(recent_predictions[-WINDOW_SIZE:]) > limit
