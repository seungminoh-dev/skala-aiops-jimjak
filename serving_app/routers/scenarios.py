"""
시나리오 데이터 파일 — 대시보드(시나리오 화면)가 드리프트 시나리오를 직접 돌릴 때 쓰는 읽기 전용 API.

화면이 scripts/simulate_drift.py 와 같은 흐름을 그대로 한다:
    1) GET /scenarios/{id}/file 로 원본 CSV 를 받아 /data/upload 로 올린다 — 재학습이 쓸 "새 기간 데이터"
    2) 41편(직전 20편 + 판정 창 21편)씩, 21편 간격으로 잘라 /predict/batch-test 에 보낸다 → 배치 하나에 판정 1회

    GET /scenarios              시나리오 목록 — 파일·행 수·사건 편 수·보낼 수 있는 배치 수
    GET /scenarios/{id}/file    CSV 원본 (text/csv)
"""
import csv

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from data.features import SEQ_LEN
from serving_app.config import project_path
from serving_app.monitoring.drift_detector import WINDOW_SIZE

router = APIRouter(prefix="/scenarios")

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
    return {
        "id": scenario_id,
        "file": path.name,
        "rows": len(rows),
        "event_rows": sum(bool((r.get("event_tag") or "").strip()) for r in rows),
        "batches": max(0, (len(rows) - BATCH_N) // WINDOW_SIZE + 1),
    }


@router.get("")
def list_scenarios():
    return [_summary(scenario_id) for scenario_id in SCENARIO_FILES]


@router.get("/{scenario_id}/file")
def scenario_file(scenario_id: str):
    path = _path(scenario_id)
    return FileResponse(path, media_type="text/csv", filename=path.name)
