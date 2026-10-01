"""Day1: 헬스체크 엔드포인트."""
from fastapi import APIRouter, HTTPException

from serving_app import model_loader

router = APIRouter()


@router.get("/health")
def health():
    model = model_loader._model_cache
    body = {
        "status": "ok" if model else "not_ready",
        "model_loaded": model is not None,
        "loading_mode": _current_loading_mode(),
        "model_version": model.version if model else None,
    }
    if model is None:
        # 모델이 준비되지 않으면 503 (기획서 ②) - lazy는 첫 /predict 요청 전까지 로드 전이다
        raise HTTPException(status_code=503, detail=body)
    return body


def _current_loading_mode() -> str:
    import os

    return os.getenv("LOADING_MODE", "lazy")
