"""FastAPI 앱 진입점"""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from serving_app import bootstrap, model_loader
from serving_app.config import settings
from serving_app.routers import data, health, logs, models, monitoring, predict, scenarios

# 드리프트 판정·재학습·배포 기준·응답 지연이 쓰는 "aiops" 로거를 logs/aiops.log 와 터미널에 연결한다.
# 형식: "시각 [태그] 메시지" (태그가 메시지에 있으면 등급을 다시 붙이지 않는다). routers/logs.py 가 읽기 전용으로 노출.
# 이 로거 하나만 설정하므로 uvicorn 자체 로깅과 충돌하지 않는다.
from serving_app.logging_config import configure_aiops_logger  # noqa: E402
from serving_app.request_timing import timing_middleware  # noqa: E402

configure_aiops_logger(settings.log_dir)

app = FastAPI(title="짐작 — 수하물 처리 시간 예측 AIOps")
app.middleware("http")(timing_middleware)  # /predict 응답 시간 기록, 1초 넘으면 [WARN]


@app.exception_handler(model_loader.ModelNotReady)
def model_not_ready(_request: Request, _exc: model_loader.ModelNotReady):
    # 운영 모델이 아직 없음 → 503 (500 이 아니라). 첫 실행이면 기본 모델을 학습하는 중이다 (serving_app/bootstrap.py)
    return JSONResponse(status_code=503, content={"detail": bootstrap.message()})


app.include_router(predict.router)
app.include_router(health.router)
app.include_router(data.router)  # 학습·재학습용 편 기록 CSV 업로드
app.include_router(logs.router)  # 대시보드: 재학습 로그 파일 조회
app.include_router(monitoring.router)  # 대시보드: 드리프트 임계값·연속 초과·최근 판정
app.include_router(models.router)  # 대시보드: 모델 버전·게이트 기록, 운영자 승인·되돌림
app.include_router(scenarios.router)  # 대시보드: 시나리오 데이터 파일 (화면이 시뮬레이션을 직접 돌린다)

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")  # 짐작 프론트엔드 (frontend/ 빌드 결과)


@app.on_event("startup")
def startup():
    # Day1 실습 포인트: LOADING_MODE=eager 로 켜고 서버 시작 시간을 lazy와 비교해보세요.
    if settings.loading_mode == "eager":
        model_loader.load_eager()
    else:
        print("[lazy] 모델은 첫 /predict 요청이 들어올 때 로드됩니다.")
