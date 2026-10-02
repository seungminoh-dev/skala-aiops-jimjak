"""
로그 조회 — 대시보드(로그·모델 화면)용 읽기 전용 API. "aiops" 로거가 쓰는 aiops.log 를 그대로 노출한다.

    GET /logs                    로그 파일 목록
    GET /logs/events             aiops.log 를 줄 단위 사건으로 — [{time, at, tag, message}] (태그로 거르기, 최근 N개)
                                 at = time 에 서버 시간대를 붙인 ISO 시각 (컨테이너는 UTC 라 화면이 시각을 맞출 때 쓴다)
    GET /logs/latency            /predict 응답 시간 p50·p95·최대, 1초 초과 횟수 (serving_app/request_timing.py)
    GET /logs/{파일명}?tail=N    파일 내용 (tail 을 주면 마지막 N줄만)
"""
import datetime as dt
import os
import re

from fastapi import APIRouter, HTTPException, Query

from serving_app.request_timing import TRACKER
from serving_app.config import settings
from serving_app.schemas import response_example

router = APIRouter(prefix="/logs", tags=["로그"])

LOG_DIR = settings.log_dir
AIOPS_LOG = "aiops.log"

# 2026-10-02 09:40:09 [WARN] 메시지
# (예전 형식도 읽는다: 2026-10-02 09:40:09,451 [WARNING] [WARN] 메시지)
_LINE = re.compile(
    r"^(?P<time>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:,\d+)?"
    r"(?: \[(?:DEBUG|INFO|WARNING|ERROR|CRITICAL)\](?= \[))?"
    r" \[(?P<tag>[A-Z]+)\] (?P<message>.*)$"
)


def _safe_path(filename: str) -> str:
    # 경로 조작(디렉토리 탈출) 방지: 순수 파일명만 허용
    if filename != os.path.basename(filename) or filename in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="잘못된 파일명입니다")
    path = os.path.join(LOG_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="로그 파일을 찾을 수 없습니다")
    return path


def parse_events(text: str) -> list[dict]:
    """로그 본문 → [{time, tag, message}]. 태그로 시작하지 않는 줄(예외 추적 등)은 앞 사건에 붙인다"""
    events: list[dict] = []
    for line in text.splitlines():
        m = _LINE.match(line)
        if m:
            events.append({"time": m["time"], "tag": m["tag"], "message": m["message"]})
        elif events and line.strip():
            events[-1]["message"] += "\n" + line
    return events


@router.get("", summary="로그 파일 목록 조회", responses={200: response_example("파일명과 크기(byte), 없으면 빈 배열", [{"name": "aiops.log", "size": 1024}])})
def list_logs():
    if not os.path.isdir(LOG_DIR):
        return []
    files = []
    for name in sorted(os.listdir(LOG_DIR)):
        path = os.path.join(LOG_DIR, name)
        if os.path.isfile(path):
            files.append({"name": name, "size": os.path.getsize(path)})
    return files


@router.get("/events", summary="운영 로그를 사건 목록으로 조회",
    description="시간·태그·메시지로 파싱한 최근 사건을 반환합니다. 로그가 없으면 빈 배열입니다.",
    responses={200: response_example("태그로 필터링한 사건 목록", [{"time": "2026-10-02 09:40:09", "tag": "WARN", "message": "드리프트 감지 (1/2)"}])})
def events(
    limit: int = Query(200, ge=1, le=5000, description="최근 N개"),
    tags: str | None = Query(None, description="쉼표로 구분한 태그 (예: WARN,ALERT)"),
):
    path = os.path.join(LOG_DIR, AIOPS_LOG)
    if not os.path.isfile(path):
        return []
    with open(path, encoding="utf-8") as f:
        items = parse_events(f.read())
    if tags:
        wanted = {t.strip().upper() for t in tags.split(",") if t.strip()}
        items = [e for e in items if e["tag"] in wanted]
    items = items[-limit:]
    tz = dt.datetime.now().astimezone().tzinfo  # 로그 줄 시각은 서버 지역 시각
    for e in items:
        e["at"] = dt.datetime.strptime(e["time"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=tz).isoformat()
    return items


@router.get("/latency", summary="단건 예측 응답 시간 통계 조회",
    description="단위는 ms입니다. /predict의 최근 최대 500회 통계이며, 배치 테스트는 제외합니다. "
                "측정이 없으면 p50_ms·p95_ms·max_ms는 null입니다. total·slow_count는 프로세스 누적값입니다.",
    responses={200: response_example("측정 전 상태", {"count": 0, "total": 0, "slow_count": 0, "threshold_ms": 1000.0, "p50_ms": None, "p95_ms": None, "max_ms": None})})
def latency():
    return TRACKER.stats()


@router.get("/{filename}", summary="로그 파일 본문 조회",
    description="순수 파일명만 허용합니다. tail을 지정하면 마지막 N줄을 반환합니다.",
    responses={
        200: response_example("파일명과 본문", {"name": "aiops.log", "content": "2026-10-02 09:40:09 [WARN] 드리프트 감지 (1/2)"}),
        400: response_example("잘못된 파일명", {"detail": "잘못된 파일명입니다"}),
        404: response_example("파일 없음", {"detail": "로그 파일을 찾을 수 없습니다"}),
    })
def read_log(filename: str, tail: int | None = Query(None, ge=1, le=100_000, description="마지막 N줄만")):
    path = _safe_path(filename)
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if tail is not None:
        content = "\n".join(content.splitlines()[-tail:])
    return {"name": filename, "content": content}
