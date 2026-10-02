"""FastAPI 앱 진입점"""
import logging
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from serving_app import model_loader
from serving_app.config import settings
from serving_app.routers import data, health, logs, monitoring, predict

# 드리프트 판정·재학습·배포 기준·응답 지연이 쓰는 "aiops" 로거를 logs/aiops.log 와 터미널에 연결한다.
# 형식: "시각 [태그] 메시지" (태그가 메시지에 있으면 등급을 다시 붙이지 않는다). routers/logs.py 가 읽기 전용으로 노출.
# 이 로거 하나만 설정하므로 uvicorn 자체 로깅과 충돌하지 않는다.
from serving_app.logging_config import configure_aiops_logger  # noqa: E402
from serving_app.request_timing import timing_middleware  # noqa: E402

configure_aiops_logger("logs")

app = FastAPI(title="HAIC Serving & AIOps")
app.middleware("http")(timing_middleware)  # /predict 응답 시간 기록, 1초 넘으면 [WARN]

app.include_router(predict.router)
app.include_router(health.router)
app.include_router(data.router)  # HAIC 데이터 업로드
app.include_router(logs.router)  # 대시보드: 재학습 로그 파일 조회
app.include_router(monitoring.router)  # 대시보드: 드리프트 임계값·연속 초과·최근 판정

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")  # 짐작 프론트엔드 (frontend/ 빌드 결과)


@app.on_event("startup")
def startup():
    # Day1 실습 포인트: LOADING_MODE=eager 로 켜고 서버 시작 시간을 lazy와 비교해보세요.
    if settings.loading_mode == "eager":
        model_loader.load_eager()
    else:
        print("[lazy] 모델은 첫 /predict 요청이 들어올 때 로드됩니다.")
