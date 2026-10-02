"""
로그 조회 — 대시보드(로그·모델 화면)용 읽기 전용 API. 새 학습·승격 로직은 없다.

monitoring/retrain_trigger.py·train_and_register.py 의 "aiops" 로거가 쓰는 logs/aiops.log 를 그대로 노출한다
(로거 설정은 serving_app/logging_config.py, 앱 시작 시 main.py 에서 한 번).

    GET /logs                    로그 파일 목록
    GET /logs/events             aiops.log 를 줄 단위 사건으로 — [{time, tag, message}] (태그로 거르기, 최근 N개)
    GET /logs/latency            /predict 응답 시간 p50·p95·최대, 1초 초과 횟수 (serving_app/request_timing.py)
    GET /logs/{파일명}?tail=N    파일 내용 (tail 을 주면 마지막 N줄만)

기대 순서(기획서 ③): 재학습 [WARN] → [INFO] → [OK] 또는 [FAIL], 알림만 [ALERT]
"""
import os
import re

from fastapi import APIRouter, HTTPException, Query

from serving_app.request_timing import TRACKER

router = APIRouter(prefix="/logs")

LOG_DIR = "logs"
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


@router.get("")
def list_logs():
    if not os.path.isdir(LOG_DIR):
        return []
    files = []
    for name in sorted(os.listdir(LOG_DIR)):
        path = os.path.join(LOG_DIR, name)
        if os.path.isfile(path):
            files.append({"name": name, "size": os.path.getsize(path)})
    return files


@router.get("/events")
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
    return items[-limit:]


@router.get("/latency")
def latency():
    return TRACKER.stats()


@router.get("/{filename}")
def read_log(filename: str, tail: int | None = Query(None, ge=1, le=100_000, description="마지막 N줄만")):
    path = _safe_path(filename)
    with open(path, encoding="utf-8") as f:
        content = f.read()
    if tail is not None:
        content = "\n".join(content.splitlines()[-tail:])
    return {"name": filename, "content": content}
