"""FastAPI 앱 진입점"""
import logging
import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from serving_app import model_loader
from serving_app.config import settings
from serving_app.routers import data, health, logs, predict

_LOG_DIR = settings.log_dir
os.makedirs(_LOG_DIR, exist_ok=True)
_aiops_logger = logging.getLogger("aiops")
_aiops_logger.setLevel(logging.INFO)
if not _aiops_logger.handlers:
    _handler = logging.FileHandler(os.path.join(_LOG_DIR, "aiops.log"), encoding="utf-8")
    _handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    _aiops_logger.addHandler(_handler)
    _aiops_logger.addHandler(logging.StreamHandler())  # 터미널에서도 동일하게 확인 가능

app = FastAPI(title="HAIC Serving & AIOps")

app.include_router(predict.router)
app.include_router(health.router)
app.include_router(data.router)  # HAIC 데이터 업로드
app.include_router(logs.router)  # 대시보드: 재학습 로그 파일 조회

_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")  # 대시보드 UI


@app.on_event("startup")
def startup():
    # Day1 실습 포인트: LOADING_MODE=eager 로 켜고 서버 시작 시간을 lazy와 비교해보세요.
    if settings.loading_mode == "eager":
        model_loader.load_eager()
    else:
        print("[lazy] 모델은 첫 /predict 요청이 들어올 때 로드됩니다.")
