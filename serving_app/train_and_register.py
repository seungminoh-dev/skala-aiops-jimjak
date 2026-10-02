"""최초 학습과 기존 fine-tuning의 MLflow 기록·평가·승격 공통 경로."""
import argparse
import csv
import hashlib
import json
import logging
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import mlflow
import mlflow.tensorflow
import numpy as np
from tensorflow import keras

from data.features import (build_sequences, fit_training_scaler, load_rows,
                           normalize_rows, sequence_samples, train_test_split)
from data.storage import latest_upload
from serving_app.config import project_path, settings
from serving_app.deployment_gate import evaluate_gate
from serving_app.lstm_model import build_model
from serving_app import model_registry

logger = logging.getLogger("aiops")
MODEL_NAME = settings.model_name


def _prepare(rows, scaler):
    X, y = build_sequences(rows, scaler)
    X_train, y_train, X_test, y_test = train_test_split(X, y, settings.validation_ratio)
    return (np.asarray(X_train, dtype="float32"),
            np.asarray([scaler.scale_wait_min(v) for v in y_train], dtype="float32"),
            np.asarray(X_test, dtype="float32"), y_test)


def _predict_minutes(model, scaler, X):
    return [scaler.inverse_wait_min(float(p)) for p in model.predict(X, verbose=0).flatten()]


def _current_version():
    return model_registry.current_version()


def _validation_baseline(rows, n_train):
    return [float(np.mean([r["wait_min"] for r in history]))
            for history, _ in sequence_samples(rows)[n_train:]]


def _register_if_gate_passed(model_uri: str, run_id: str, gate: dict) -> dict:
    result = {"run_id": run_id, **gate, "promoted": False,
              "version": None, "model_version": None}
    if not gate["passed"]:
        logger.warning("[FAIL] 배포 차단: %s", "; ".join(gate["failed_reasons"]))
        return result
    # 손상된 번들은 등록/승격하지 않는다. 기존 Production은 이 검증 동안 유지된다.
    model_registry.load_model_uri(model_uri)
    version = mlflow.register_model(model_uri, MODEL_NAME)
    model_registry.configure_tracking().transition_model_version_stage(
        name=MODEL_NAME, version=version.version, stage="Production",
        archive_existing_versions=True,
    )
    result.update(promoted=True, version=str(version.version),
                  model_version=model_registry.version_string(version.version))
    logger.info("[OK] MAE=%.3f, Production %s 승격", gate["mae"], result["model_version"])
    return result


def _log_and_register(model, scaler, X_train, run_id, gate):
    for key in ("mae", "rmse", "baseline_mae", "baseline_rmse", "current_mae", "current_rmse"):
        if gate[key] is not None:
            mlflow.log_metric(key, gate[key])
    mlflow.set_tags({"gate_passed": str(gate["passed"]).lower(),
                     "current_comparison": gate["current_comparison"]})
    mlflow.log_dict(gate, "deployment_gate.json")
    with tempfile.TemporaryDirectory(prefix="jimjak-bundle-") as temp:
        extra_files = model_registry.write_bundle_files(temp, scaler, run_id)
        model_info = mlflow.tensorflow.log_model(
            model, name="model", input_example=X_train[:1], extra_files=extra_files)
    result = _register_if_gate_passed(model_info.model_uri, run_id, gate)
    result["model_uri"] = model_info.model_uri
    mlflow.log_dict(result, "deployment_result.json")
    mlflow.set_tags({"deployment_status": "promoted" if result["promoted"] else "rejected",
                     "registered_version": result["version"] or "none",
                     "failure_reason": "; ".join(result["failed_reasons"])})
    return result


def _log_data(rows, source, n_train):
    samples = sequence_samples(rows)
    train_targets = [target for _, target in samples[:n_train]]
    validation_targets = [target for _, target in samples[n_train:]]
    times = [r["landingDatetime"] for r in rows]
    metadata = {
        "data_source": source, "n_rows": len(rows), "n_train": n_train,
        "n_validation": len(validation_targets),
        "data_start": min(times), "data_end": max(times),
        "train_start": min(r["landingDatetime"] for r in train_targets),
        "train_end": max(r["landingDatetime"] for r in train_targets),
        "validation_start": min(r["landingDatetime"] for r in validation_targets),
        "validation_end": max(r["landingDatetime"] for r in validation_targets),
        "data_sha256": hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest(),
        "n_event_rows": sum(bool(r["event_tag"]) for r in rows),
        # 5번에서 날짜 기준 분리·이벤트 제외 정책으로 교체할 연결 지점.
        "split_policy": "chronological_sequence_ratio",
        "event_policy": "not_filtered",
    }
    mlflow.log_params(metadata)
    mlflow.log_dict(metadata, "dataset.json")


def _train(mode, csv_path=None, rows=None):
    model_registry.configure_experiment()
    epochs = settings.base_epochs if mode == "scratch" else settings.fine_tune_epochs
    learning_rate = settings.learning_rate if mode == "scratch" else settings.fine_tune_learning_rate
    with mlflow.start_run(run_name="base-train" if mode == "scratch" else "fine-tune") as run:
        mlflow.log_params({
            "model_name": MODEL_NAME, "mode": mode, "seed": settings.seed,
            "sequence_length": settings.sequence_length, "epochs": epochs,
            "learning_rate": learning_rate, "batch_size": settings.batch_size,
            "validation_ratio": settings.validation_ratio, "mae_limit": settings.mae_limit,
            "baseline_ratio": settings.baseline_ratio, "shuffle": False,
            "scaler_format": model_registry.SCALER_FORMAT,
        })
        # URI에는 인증정보가 포함될 수 있으므로 전체 환경 설정 대신 학습 설정만 기록한다.
        config = asdict(settings)
        mlflow.log_dict({k: config[k] for k in (
            "sequence_length", "seed", "base_epochs", "fine_tune_epochs", "batch_size",
            "learning_rate", "fine_tune_learning_rate", "validation_ratio", "mae_limit",
            "baseline_ratio", "model_name")}, "training_config.json")
        mlflow.set_tag("deployment_status", "pending")
        try:
            keras.utils.set_random_seed(settings.seed)
            if rows is None:
                source = str(project_path(csv_path or latest_upload()))
                rows = load_rows(source)
            else:
                source = "in_memory"
                rows = normalize_rows(rows)
            times = [row["landingDatetime"] for row in rows]
            mlflow.log_params({"data_source": source, "n_rows": len(rows),
                               "data_start": min(times, default="none"),
                               "data_end": max(times, default="none")})
            current = _current_version()
            mlflow.log_param("current_version", current.version if current else "none")
            current_model = current_scaler = None
            if current is not None:
                current_model, current_scaler, _ = model_registry.load_version(current.version)
            if mode == "fine-tune" and current is None:
                raise ValueError("fine-tuning을 시작할 Production 모델이 없습니다.")
            scaler = fit_training_scaler(rows, settings.validation_ratio) if mode == "scratch" else current_scaler
            X_train, y_train, X_test, y_test = _prepare(rows, scaler)
            _log_data(rows, source, len(y_train))
            current_preds = None
            if current_model is not None:
                # 같은 원본 검증 타깃을 기존 모델 자신의 스케일러로 변환한다.
                _, _, current_X_test, _ = _prepare(rows, current_scaler)
                current_preds = _predict_minutes(current_model, current_scaler, current_X_test)
            baseline = _validation_baseline(rows, len(y_train))
            if mode == "scratch":
                model = build_model()
            else:
                model = current_model
                model.compile(optimizer=keras.optimizers.Adam(learning_rate=learning_rate), loss="mse")
            model.fit(X_train, y_train, epochs=epochs, batch_size=settings.batch_size,
                      shuffle=False, verbose=0)
            predictions = _predict_minutes(model, scaler, X_test)
            gate = evaluate_gate(y_test, predictions, baseline, current_preds)
            # 기존 baseline 예측 보고서도 실행별 아티팩트로 보관한다.
            with tempfile.TemporaryDirectory(prefix="jimjak-evaluation-") as temp:
                path = Path(temp) / "baseline_predictions.csv"
                with path.open("w", newline="", encoding="utf-8") as stream:
                    writer = csv.writer(stream)
                    writer.writerow(["line_id", "landingDatetime", "actual_min", "predicted_min", "rolling_mean_min"])
                    samples = sequence_samples(rows)[len(y_train):]
                    for (_, target), actual, pred, mean in zip(samples, y_test, predictions, baseline):
                        writer.writerow([target["line_id"], target["landingDatetime"], actual, pred, mean])
                mlflow.log_artifact(str(path))
            return _log_and_register(model, scaler, X_train, run.info.run_id, gate)
        except Exception as exc:
            mlflow.set_tags({"deployment_status": "failed", "failure_reason": str(exc)})
            mlflow.log_dict({"run_id": run.info.run_id, "promoted": False,
                             "failure_reason": str(exc)}, "failure.json")
            logger.exception("[FAIL] 학습·평가·등록 실패")
            raise


def train_and_register(csv_path: str | None = None, rows: list[dict] | None = None) -> dict:
    """최초/전체 학습. 경로 생략 시 최신 업로드 CSV를 사용한다."""
    return _train("scratch", csv_path=csv_path, rows=rows)


def fine_tune(rows: list[dict]) -> dict:
    """현재 Production 번들의 가중치·스케일러를 사용한다.

    최근 2주/마지막 3일 검증·이벤트 시퀀스 제외는 5번 작업에서 구현한다.
    현재는 기존 시간순 비율 분리를 유지한다.
    """
    return _train("fine-tune", rows=rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="학습 CSV 경로 (생략: 최신 업로드)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print(json.dumps(train_and_register(csv_path=args.csv), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
