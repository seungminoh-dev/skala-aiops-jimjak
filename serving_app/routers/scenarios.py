"""
시나리오 데이터 파일 — 대시보드(시나리오 화면)가 드리프트 시나리오를 직접 돌릴 때 쓰는 읽기 전용 API.

화면이 scripts/simulate_drift.py 와 같은 흐름을 그대로 한다:
    1) GET /scenarios/{id}/file 로 원본 CSV 를 받아 /data/upload 로 올린다 — 재학습이 쓸 "새 기간 데이터"
    2) 41편(직전 20편 + 판정 창 21편)씩, 21편 간격으로 잘라 /predict/batch-test 에 보낸다 → 배치 하나에 판정 1회

    GET /scenarios              시나리오 목록 — 파일·행 수·사건 편 수·보낼 수 있는 배치 수·처리 시간 요약
    GET /scenarios/{id}/file    CSV 원본 (text/csv)
"""
import csv
import statistics

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from data.features import SEQ_LEN
from serving_app.config import project_path
from serving_app.monitoring.drift_detector import WINDOW_SIZE
from serving_app.schemas import response_example

router = APIRouter(prefix="/scenarios", tags=["시나리오"])

# 시나리오 id → 데이터 파일 (기획서 "시나리오와 파일 구성", scripts/simulate_drift.py 와 같은 이름)
SCENARIO_FILES = {
    "normal": "data/normal_2w.csv",
    "bhs_failure": "data/bhs_failure_2w.csv",
    "staff_shortage": "data/staff_shortage_2w.csv",
    "expansion": "data/expansion_2w.csv",
    "terminal_open": "data/terminal_open_4w.csv",
    "process_change": "data/process_change_2w.csv",
}
BATCH_N = SEQ_LEN + WINDOW_SIZE  # 41편 → 예측 21회 → 판정 1회


def _path(scenario_id: str):
    if scenario_id not in SCENARIO_FILES:
        raise HTTPException(404, f"알 수 없는 시나리오입니다: {scenario_id}")
    path = project_path(SCENARIO_FILES[scenario_id])
    if not path.is_file():
        raise HTTPException(404, f"시나리오 데이터 파일이 없습니다: {SCENARIO_FILES[scenario_id]}")
    return path


def _summary(scenario_id: str) -> dict:
    path = _path(scenario_id)
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    waits = [float(r["wait_min"]) for r in rows if (r.get("wait_min") or "").strip()]
    return {
        "id": scenario_id,
        "file": path.name,
        "rows": len(rows),
        "event_rows": sum(bool((r.get("event_tag") or "").strip()) for r in rows),
        "batches": max(0, (len(rows) - BATCH_N) // WINDOW_SIZE + 1),
        # 처리 시간 요약 (분) — 시나리오 화면의 "평균 처리 시간 · 50분 넘는 편"
        "wait_mean": round(statistics.fmean(waits), 1) if waits else None,
        "wait_median": statistics.median(waits) if waits else None,
        "wait_min": min(waits, default=None),
        "wait_max": max(waits, default=None),
        "over_50": sum(w > 50 for w in waits),
    }


@router.get("", summary="드리프트 시나리오 데이터 목록",
    description="대시보드 시나리오 화면이 쓰는 6가지 데이터 파일의 요약입니다. batches 는 41편(직전 20편 + 판정 창 21편)씩 "
                "21편 간격으로 보낼 수 있는 배치 수이고, 처리 시간은 분 단위입니다.",
    responses={200: response_example("시나리오별 요약 (6개 중 1개)", [{
        "id": "normal", "file": "normal_2w.csv", "rows": 220, "event_rows": 0, "batches": 9,
        "wait_mean": 35.2, "wait_median": 35.0, "wait_min": 22.0, "wait_max": 53.0, "over_50": 1}])})
def list_scenarios():
    return [_summary(scenario_id) for scenario_id in SCENARIO_FILES]


@router.get("/{scenario_id}/file", summary="시나리오 CSV 원본 받기",
    description="scenario_id: normal · bhs_failure · staff_shortage · expansion · terminal_open · process_change. "
                "받은 파일을 POST /data/upload 로 올리고 41편씩 POST /predict/batch-test 로 보내면 "
                "scripts/simulate_drift.py 와 같은 흐름으로 시나리오가 실행됩니다.",
    responses={
        200: {"description": "CSV 원본 (text/csv)", "content": {"text/csv": {"example":
            "flightId,terminalId,bagCarouselId,line_id,aircraftSubtype,seats,estimatedDatetime,LandingDatetime,bagLastTime,wait_min,event_tag\n"
            "LJ690,P01,3,T1-03,738,189,202610010050,202610010043,202610010117,34,\n"}}},
        404: response_example("알 수 없는 시나리오", {"detail": "알 수 없는 시나리오입니다: abc"}),
    })
def scenario_file(scenario_id: str):
    path = _path(scenario_id)
    return FileResponse(path, media_type="text/csv", filename=path.name)
