"""
모델 버전·게이트 기록과 운영자 조치 — 대시보드(모델 화면)용. 기획서 ③ 재학습 "불합격 시"·"원래 상태로 돌아올 때".

    GET  /models            레지스트리 버전(운영·보관) + 학습·재학습 실행(게이트 결과·승인 대기 여부)
    POST /models/approve    {"run_id"}  성능 검사엔 떨어졌지만 현재 모델보다 나은 후보를 운영자가 승인
                                        → 새 버전 등록 → Production → 서빙 모델 교체
    POST /models/rollback   {"version"} 보관된 버전을 Production 으로 되돌림 → 서빙 모델 교체

학습·검증·번들 검사는 train_and_register·model_registry 가 남긴 기록과 함수를 그대로 쓴다(여기서 다시 학습하지 않는다).
승인·되돌림 뒤에는 재학습 승격 뒤(predict.batch_test)와 같이 서빙 모델을 다시 불러오고,
이전 모델이 쌓은 감시 창(최근 예측)과 연속 횟수를 비운다.
"""
import datetime as dt
import logging
import os

import mlflow
from fastapi import APIRouter, HTTPException
from mlflow.exceptions import MlflowException
from pydantic import BaseModel

from serving_app import model_loader, model_registry
from serving_app.config import settings
from serving_app.monitoring import drift_detector as dd
from serving_app.monitoring import retrain_trigger
from serving_app.routers import predict

logger = logging.getLogger("aiops")

router = APIRouter(prefix="/models")

TRAINING_RUNS = ("base-train", "fine-tune")  # 게이트까지 가는 실행 (rollback 실행은 빼고)
GATE_STATUSES = ("promoted", "rejected")


class ApproveRequest(BaseModel):
    run_id: str


class RollbackRequest(BaseModel):
    version: str  # "v1" 또는 "1"


def _iso(ms: int | None) -> str | None:
    return dt.datetime.fromtimestamp(ms / 1000).astimezone().isoformat(timespec="seconds") if ms else None


def _label(number) -> str | None:
    """레지스트리 버전 번호("2") → "v2". 없으면("none", None) None"""
    text = str(number) if number is not None else ""
    return model_registry.version_string(text) if text.isdecimal() else None


def _int(value) -> int | None:
    return int(value) if value not in (None, "", "none") else None


def _training_runs(client) -> list:
    experiment = client.get_experiment_by_name(settings.experiment_name)
    if experiment is None:
        return []
    runs = client.search_runs([experiment.experiment_id], order_by=["attributes.start_time ASC"], max_results=1000)
    return [r for r in runs if r.info.run_name in TRAINING_RUNS]


def _run_facts(run) -> dict:
    params, metrics = run.data.params, run.data.metrics
    mode = params.get("mode")
    source = params.get("data_source") or ""
    return {
        "mode": mode,
        "base_version": _label(params.get("current_version")) if mode == "fine-tune" else None,
        "mae": metrics.get("mae"),
        "baseline_mae": metrics.get("baseline_mae"),
        "current_mae": metrics.get("current_mae"),
        "epochs": _int(params.get("epochs")),
        "n_rows": _int(params.get("n_rows")),
        "n_train": _int(params.get("n_train")),
        "n_validation": _int(params.get("n_validation")),
        "data_source": os.path.basename(source) if source not in ("", "in_memory") else source or None,
    }


def _version_view(version, run) -> dict:
    return {
        "version": _label(version.version),
        "stage": version.current_stage,
        "run_id": version.run_id,
        "created_at": _iso(version.creation_timestamp),
        "updated_at": _iso(version.last_updated_timestamp),
        "approved": bool(run and run.data.tags.get("manual_approval") == "approved"),
        **(_run_facts(run) if run else {}),
    }


def _gate_view(run, latest: bool, production: str | None) -> dict:
    tags = run.data.tags
    facts = _run_facts(run)
    status = tags.get("deployment_status")
    approved = _label(tags.get("approved_version"))
    mae, current = facts["mae"], facts["current_mae"]
    # 승인 대기: 가장 최근 게이트이고, 그때 비교한 운영 모델이 아직 운영 중이며, 새 모델이 그보다 나을 때만
    needs_approval = (
        status == "rejected" and not approved and latest
        and mae is not None and current is not None and mae < current
        and facts["base_version"] is not None and facts["base_version"] == production
    )
    return {
        "run_id": run.info.run_id,
        "run_name": run.info.run_name,
        "at": _iso(run.info.start_time),
        "status": status,
        "passed": status == "promoted",
        "failed_reasons": [s for s in (tags.get("failure_reason") or "").split("; ") if s],
        "version": _label(tags.get("registered_version")),
        "needs_approval": needs_approval,
        "approved_version": approved,
        **facts,
    }


def _models_view() -> dict:
    client = model_registry.configure_tracking()
    versions = sorted(client.search_model_versions(f"name='{model_registry.MODEL_NAME}'"), key=lambda v: int(v.version))
    runs = _training_runs(client)
    by_run = {r.info.run_id: r for r in runs}
    production = next((v for v in versions if v.current_stage == "Production"), None)
    production_label = _label(production.version) if production else None
    gated = [r for r in runs if r.data.tags.get("deployment_status") in GATE_STATUSES]
    return {
        "model_name": model_registry.MODEL_NAME,
        "production": production_label,
        "versions": [_version_view(v, by_run.get(v.run_id)) for v in versions],
        "gates": [_gate_view(r, i == len(gated) - 1, production_label) for i, r in enumerate(gated)],
    }


def _swap_serving_model() -> None:
    """새 Production 으로 서빙 캐시를 바꾸고, 이전 모델의 감시 창·연속 횟수를 비운다 (batch_test 승격 뒤와 같다)"""
    model_loader.reload_model()
    predict.recent_predictions.clear()
    dd.STATE.reset()
    retrain_trigger._rejected_file = None


@router.get("")
def list_models():
    return _models_view()


@router.post("/approve")
def approve(req: ApproveRequest):
    view = _models_view()
    gate = next((g for g in view["gates"] if g["run_id"] == req.run_id), None)
    if gate is None:
        raise HTTPException(404, "학습 기록을 찾을 수 없습니다.")
    if not gate["needs_approval"]:
        raise HTTPException(409, "승인을 기다리는 후보가 아닙니다. (이미 승인했거나, 그 뒤에 운영 모델이 바뀌었습니다)")
    try:
        model_uri = mlflow.artifacts.load_dict(f"runs:/{req.run_id}/deployment_result.json")["model_uri"]
        model_registry.load_model_uri(model_uri)  # 번들(스케일러·입력 규격·추론) 검사 — 실패하면 등록하지 않는다
    except (KeyError, OSError, ValueError, MlflowException) as e:
        raise HTTPException(422, f"후보 모델을 불러오지 못했습니다: {e}")

    client = model_registry.configure_tracking()
    registered = mlflow.register_model(model_uri, model_registry.MODEL_NAME)
    client.transition_model_version_stage(
        name=model_registry.MODEL_NAME, version=registered.version, stage="Production", archive_existing_versions=True,
    )
    client.set_tag(req.run_id, "manual_approval", "approved")
    client.set_tag(req.run_id, "approved_version", str(registered.version))
    version = _label(registered.version)
    _swap_serving_model()
    logger.info(
        "[OK] 운영자 승인: 배포 기준 미달 후보(run %s, MAE %.1f분 < 현재 %.1f분)를 Production %s 로 적용 (이전 %s)",
        req.run_id[:8], gate["mae"], gate["current_mae"], version, view["production"],
    )
    return {"version": version, "previous": view["production"], "run_id": req.run_id}


@router.post("/rollback")
def rollback(req: RollbackRequest):
    number = req.version.strip().lstrip("vV")
    try:
        label = model_registry.version_string(number)
    except ValueError as e:
        raise HTTPException(422, str(e))
    current = model_registry.current_version()
    previous = _label(current.version) if current else None
    if previous == label:
        raise HTTPException(409, f"{label}은 이미 Production 입니다.")
    try:
        model_registry.rollback(number)
    except MlflowException as e:
        if e.error_code == "RESOURCE_DOES_NOT_EXIST":
            raise HTTPException(404, f"{label} 버전이 없습니다.")
        raise
    except ValueError as e:
        raise HTTPException(422, f"{label} 모델을 불러오지 못했습니다: {e}")
    _swap_serving_model()
    logger.info("[OK] 운영자 되돌림: Production %s → %s", previous, label)
    return {"version": label, "previous": previous}
