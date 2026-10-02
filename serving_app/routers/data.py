"""수하물 처리 기록 CSV 업로드 및 최신 파일 상태 조회"""
import csv
import io
import os
import time

from fastapi import APIRouter, File, HTTPException, UploadFile

from data.features import SEQ_LEN, load_rows, normalize_rows, REQUIRED_COLUMNS
from data.storage import UPLOAD_DIR, latest_upload
from serving_app.monitoring.drift_detector import WINDOW_SIZE
from serving_app.schemas import response_example

router = APIRouter(prefix="/data", tags=["데이터"])

MIN_ROWS = SEQ_LEN + WINDOW_SIZE


@router.post("/upload", summary="수하물 처리 기록 CSV 업로드",
    description=f"UTF-8 또는 UTF-8 BOM CSV를 multipart/form-data의 file 필드로 전달합니다. 최소 {MIN_ROWS}행이 필요합니다. "
                f"필수 컬럼: {', '.join(sorted(REQUIRED_COLUMNS))}. LandingDatetime도 landingDatetime으로 인식합니다. "
                "파일을 저장하며, 업로드만으로 학습이나 배포를 실행하지 않습니다.",
    responses={200: response_example("업로드 파일명과 행 수", {"filename": "jimjak_1790905257303947007.csv", "rows": 960}),
               400: response_example("인코딩·필수 컬럼·숫자 형식·최소 행 수 오류", {"detail": "최소 41행 이상의 데이터가 필요합니다."})})
async def upload(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "UTF-8로 인코딩된 CSV 파일만 업로드할 수 있습니다.")

    reader = csv.DictReader(io.StringIO(text))
    if not REQUIRED_COLUMNS.issubset({("landingDatetime" if c == "LandingDatetime" else c) for c in (reader.fieldnames or [])}):
        raise HTTPException(400, f"CSV에 {sorted(REQUIRED_COLUMNS)} 컬럼이 모두 있어야 합니다.")
    try:
        rows = normalize_rows(reader)
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc))
    if len(rows) < MIN_ROWS:
        raise HTTPException(400, f"최소 {MIN_ROWS}행 이상의 데이터가 필요합니다.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest = os.path.join(UPLOAD_DIR, f"jimjak_{time.time_ns()}.csv")
    with open(dest, "w", encoding="utf-8", newline="") as f:
        f.write(text)

    return {"filename": os.path.basename(dest), "rows": len(rows)}


@router.get("/status", summary="최신 업로드 CSV 상태 조회",
    responses={200: {"description": "파일이 없으면 exists만 false로 반환합니다. 날짜는 착륙시각(YYYYMMDDHHMM)입니다.",
        "content": {"application/json": {"examples": {
            "uploaded": {"value": {"exists": True, "filename": "jimjak_1790905257303947007.csv", "rows": 960,
                "start_date": "202608010119", "end_date": "202609180100", "min_wait_min": 22, "max_wait_min": 56}},
            "empty": {"value": {"exists": False}},
        }}}}})
def status():
    try:
        path = latest_upload()
    except FileNotFoundError:
        return {"exists": False}

    rows = load_rows(path)
    waits = [r["wait_min"] for r in rows]
    return {
        "exists": True,
        "filename": os.path.basename(path),
        "rows": len(rows),
        "start_date": min(r["landingDatetime"] for r in rows),
        "end_date": max(r["landingDatetime"] for r in rows),
        "min_wait_min": min(waits),
        "max_wait_min": max(waits),
    }
