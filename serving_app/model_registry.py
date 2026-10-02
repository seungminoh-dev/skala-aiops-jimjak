"""MLflow 설정과 모델·스케일러 번들의 등록/복구 계약"""
import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path

import mlflow
from mlflow.tracking import MlflowClient

from data.features import JimJakScaler
from serving_app.config import settings

MODEL_NAME = settings.model_name
SCALER_FORMAT = "jimjak-minmax-pickle-v1"


def configure_tracking():
    mlflow.set_tracking_uri(settings.tracking_uri)
    # 외부 MLFLOW_REGISTRY_URI 때문에 다른 레지스트리를 바라보지 않도록 통일한다.
    mlflow.set_registry_uri(settings.tracking_uri)
    return MlflowClient()


def configure_experiment():
    client = configure_tracking()
    experiment = client.get_experiment_by_name(settings.experiment_name)
    if experiment is None:
        experiment_id = client.create_experiment(
            settings.experiment_name, artifact_location=settings.artifact_root)
    else:
        if experiment.artifact_location.rstrip("/") != settings.artifact_root.rstrip("/"):
            raise ValueError("기존 실험의 아티팩트 경로가 ARTIFACT_ROOT와 다릅니다. 기존 경로를 사용하거나 새 EXPERIMENT_NAME을 지정하세요.")
        experiment_id = experiment.experiment_id
    mlflow.set_experiment(experiment_id=experiment_id)


def current_version():
    client = configure_tracking()
    versions = client.search_model_versions(f"name='{MODEL_NAME}'")
    production = [v for v in versions if v.current_stage == "Production"]
    if len(production) > 1:
        raise ValueError("Production 버전이 여러 개입니다. 운영 버전을 먼저 정리하세요.")
    return production[0] if production else None


def version_string(version):
    text = str(version)
    if not text.isdecimal() or int(text) < 1:
        raise ValueError("버전은 1 이상의 숫자여야 합니다.")
    return f"v{int(text)}"


def write_bundle_files(directory, scaler, run_id):
    """extra_files에 저장할 스케일러와 호환성 정보를 만든다."""
    directory = Path(directory)
    scaler_path = directory / "scaler.pkl"
    scaler.save(scaler_path)
    metadata = {
        "schema_version": 1,
        "model_name": MODEL_NAME,
        "run_id": run_id,
        "sequence_length": settings.sequence_length,
        "features": ["wait_min", "next_seats"],
        "scaler_format": SCALER_FORMAT,
        "scaler_sha256": hashlib.sha256(scaler_path.read_bytes()).hexdigest(),
    }
    metadata_path = directory / "bundle.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return [str(scaler_path), str(metadata_path)]


def load_bundle(path):
    """동일한 모델 디렉터리의 스케일러만 허용한다. 기존 공용 파일로 대체하지 않는다."""
    import mlflow.tensorflow
    import numpy as np

    path = Path(path)
    metadata = json.loads((path / "extra_files/bundle.json").read_text())
    expected = {
        "schema_version": 1, "model_name": MODEL_NAME,
        "sequence_length": settings.sequence_length,
        "features": ["wait_min", "next_seats"], "scaler_format": SCALER_FORMAT,
    }
    if any(metadata.get(k) != v for k, v in expected.items()):
        raise ValueError("모델 번들의 이름·입력 규격·스케일러 형식이 현재 설정과 다릅니다.")
    scaler_path = path / "extra_files/scaler.pkl"
    if hashlib.sha256(scaler_path.read_bytes()).hexdigest() != metadata["scaler_sha256"]:
        raise ValueError("모델에 연결된 스케일러의 체크섬이 일치하지 않습니다.")
    scaler = JimJakScaler.load(scaler_path)
    bounds = np.asarray([scaler.wait_min, scaler.wait_max, scaler.seats_min, scaler.seats_max], dtype=float)
    if not np.isfinite(bounds).all() or bounds[0] > bounds[1] or bounds[2] > bounds[3]:
        raise ValueError("스케일러 범위가 올바르지 않습니다.")
    model = mlflow.tensorflow.load_model(str(path))
    if tuple(model.input_shape[1:]) != (settings.sequence_length, 2):
        raise ValueError("저장된 모델의 입력 shape이 설정과 다릅니다.")
    # 파일을 읽는 데 성공해도 실제 추론이 불가능하면 승격/캐시 교체를 막는다.
    predicted = np.asarray(model(np.zeros((1, settings.sequence_length, 2), dtype="float32"), training=False))
    if predicted.shape != (1, 1) or not np.isfinite(predicted).all():
        raise ValueError("저장된 모델의 추론 검증에 실패했습니다.")
    return model, scaler, metadata


def load_model_uri(model_uri):
    configure_tracking()
    with tempfile.TemporaryDirectory(prefix="jimjak-model-") as temp:
        path = mlflow.artifacts.download_artifacts(artifact_uri=model_uri, dst_path=temp)
        return load_bundle(path)


def load_version(version):
    version_string(version)
    client = configure_tracking()
    registered = client.get_model_version(MODEL_NAME, str(version))
    model, scaler, metadata = load_model_uri(f"models:/{MODEL_NAME}/{version}")
    if metadata["run_id"] != registered.run_id:
        raise ValueError("등록 버전과 번들의 학습 run_id가 다릅니다.")
    return model, scaler, metadata


def rollback(version):
    """번들 로딩 검증 후 지정 버전을 Production으로 복원한다. 서빙 캐시는 별도 갱신."""
    display_version = version_string(version)
    configure_experiment()
    previous = current_version()
    with mlflow.start_run(run_name="rollback"):
        mlflow.log_params({"operation": "rollback", "model_name": MODEL_NAME,
                           "target_version": str(version),
                           "previous_version": previous.version if previous else "none"})
        try:
            load_version(version)
            configure_tracking().transition_model_version_stage(
                name=MODEL_NAME, version=str(version), stage="Production",
                archive_existing_versions=True)
            result = {"version": str(version), "model_version": display_version,
                      "previous_version": str(previous.version) if previous else None,
                      "status": "rolled_back", "serving_reload_required": True}
            mlflow.log_dict(result, "rollback_result.json")
            mlflow.set_tag("rollback_status", "succeeded")
            return result
        except Exception as exc:
            mlflow.set_tags({"rollback_status": "failed", "failure_reason": str(exc)})
            raise


def export_version(version, destination):
    """등록 버전을 로컬 서빙용으로 내보낸다. 기존 디렉터리는 덮어쓰지 않는다."""
    version_string(version)
    client = configure_tracking()
    registered = client.get_model_version(MODEL_NAME, str(version))
    destination = Path(destination).resolve()
    if destination.exists():
        raise FileExistsError(f"기존 번들은 덮어쓸 수 없습니다: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix=".export-") as temp:
        path = Path(mlflow.artifacts.download_artifacts(
            artifact_uri=f"models:/{MODEL_NAME}/{version}", dst_path=temp))
        _, _, metadata = load_bundle(path)
        if metadata["run_id"] != registered.run_id:
            raise ValueError("등록 버전과 번들의 학습 run_id가 다릅니다.")
        (path / "version.json").write_text(json.dumps({
            "version": str(version), "model_name": MODEL_NAME,
            "run_id": registered.run_id,
        }, indent=2) + "\n")
        shutil.move(str(path), str(destination))
    return {"version": str(version), "directory": str(destination)}


def main():
    parser = argparse.ArgumentParser(description="짐작 모델 버전 복구·내보내기")
    sub = parser.add_subparsers(dest="command", required=True)
    restore = sub.add_parser("rollback")
    restore.add_argument("--version", required=True)
    export = sub.add_parser("export")
    export.add_argument("--version", required=True)
    export.add_argument("--output", required=True)
    args = parser.parse_args()
    result = rollback(args.version) if args.command == "rollback" else export_version(args.version, args.output)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
