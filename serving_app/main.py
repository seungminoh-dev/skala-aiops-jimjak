"""
FastAPI 앱 진입점.

Day1: app 생성, 라우터(predict, health) 등록, startup 이벤트에서 로딩 모드에 따라 모델 준비
Day2: data 라우터 등록 (HAIC 데이터 업로드)
Day3: "aiops" 로거를 logs/aiops.log 파일로 연결(로깅 설정) + logs 라우터(로그 파일 조회) 등록

정적 화면: serving_app/static 은 「짐작」 프론트엔드(frontend/)의 빌드 결과입니다.
frontend 에서 `npm run build:serve` 를 실행하면 이 폴더를 비우고 새로 채웁니다(손으로 고치지 않음).
화면 이동은 해시(#/t1-03 등)라서 FastAPI 는 "/" 의 index.html 과 /assets/* 만 내주면 됩니다.
API 라우터를 먼저 등록한 뒤 StaticFiles를 "/"에 마지막으로 mount해야, /predict 같은
API 경로가 정적 파일보다 먼저 매칭됩니다(Starlette는 등록 순서대로 라우트를 검사합니다).
"""
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from serving_app import model_loader
from serving_app.routers import data, health, logs, predict

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

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")  # 짐작 프론트엔드 (frontend/ 빌드 결과)


@app.on_event("startup")
def startup():
    # Day1 실습 포인트: LOADING_MODE=eager 로 켜고 서버 시작 시간을 lazy와 비교해보세요.
    if os.getenv("LOADING_MODE", "lazy") == "eager":
        model_loader.load_eager()
    else:
        print("[lazy] 모델은 첫 /predict 요청이 들어올 때 로드됩니다.")
