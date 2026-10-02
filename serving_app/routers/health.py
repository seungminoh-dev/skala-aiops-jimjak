"""헬스체크 엔드포인트"""
from fastapi import APIRouter, HTTPException

from serving_app import bootstrap, model_loader
from serving_app.schemas import response_example

router = APIRouter(tags=["모델 상태"])


@router.get("/health", summary="서빙 모델 준비 상태 조회", description="모델을 새로 로딩하지 않고 캐시 상태를 조회합니다. 모델이 없으면 503을 반환하며, status는 초기 학습 중 training, 학습 실패 failed, 로딩 전 not_ready로 구분합니다.",
    responses={
        200: response_example("모델 준비 완료", {"status": "ok", "model_loaded": True, "loading_mode": "eager", "model_version": "v1"}),
        503: response_example("모델 미준비", {"detail": {"status": "not_ready", "model_loaded": False, "loading_mode": "lazy", "model_version": None}}),
    })
def health():
    model = model_loader._model_cache
    # 모델이 없을 때: training = 첫 실행이라 기본 모델 학습 중, failed = 그 학습이 실패, not_ready = 아직 로드 전
    pending = {bootstrap.TRAINING: "training", bootstrap.FAILED: "failed"}.get(bootstrap.status(), "not_ready")
    body = {
        "status": "ok" if model else pending,
        "model_loaded": model is not None,
        "loading_mode": _current_loading_mode(),
        "model_version": model.version if model else None,
    }
    if model is None:
        # 모델이 준비되지 않으면 503 (기획서 ②) - lazy는 첫 /predict 요청 전까지 로드 전이다
        raise HTTPException(status_code=503, detail=body)
    return body


def _current_loading_mode() -> str:
    from serving_app.config import settings

    return settings.loading_mode
