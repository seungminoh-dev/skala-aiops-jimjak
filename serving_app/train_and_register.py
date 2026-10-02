"""최초 학습과 기존 fine-tuning의 MLflow 기록·평가·승격 공통 경로"""
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

from data.features import (build_sequences, encode_samples, fit_training_scaler, load_rows,
                           normalize_rows, sequence_samples, train_test_split)
from data.retraining import InsufficientRetrainingData, split_retraining_rows
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


def _log_and_register(model, scaler, X_train, run_id, gate, result_context=None):
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
    if result_context is not None:
        # 승격 뒤 기록 실패가 나더라도 호출자에게 실제 승격 여부·버전을 보존한다.
        result_context.update(result)
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
        # 최초 학습은 기존 시간순 비율 분할을 사용한다.
        "split_policy": "chronological_sequence_ratio",
        "event_policy": "not_filtered",
    }
    mlflow.log_params(metadata)
    mlflow.log_dict(metadata, "dataset.json")


def _train(csv_path=None, rows=None):
    model_registry.configure_experiment()
    epochs = settings.base_epochs
    learning_rate = settings.learning_rate
    with mlflow.start_run(run_name="base-train") as run:
        mlflow.log_params({
            "model_name": MODEL_NAME, "mode": "scratch", "seed": settings.seed,
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
            scaler = fit_training_scaler(rows, settings.validation_ratio)
            X_train, y_train, X_test, y_test = _prepare(rows, scaler)
            _log_data(rows, source, len(y_train))
            current_preds = None
            if current_model is not None:
                # 같은 원본 검증 타깃을 기존 모델 자신의 스케일러로 변환한다.
                _, _, current_X_test, _ = _prepare(rows, current_scaler)
                current_preds = _predict_minutes(current_model, current_scaler, current_X_test)
            baseline = _validation_baseline(rows, len(y_train))
            model = build_model()
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
    return _train(csv_path=csv_path, rows=rows)


def _retraining_result():
    return {
        "status": "failed", "promoted": False, "passed": False,
        "run_id": None, "version": None, "model_version": None, "current_version": None,
        "mae": None, "rmse": None, "current_mae": None, "current_rmse": None,
        "baseline_mae": None, "baseline_rmse": None,
        "metrics": {name: {"mae": None, "rmse": None}
                    for name in ("candidate", "current", "baseline")},
        "failure_code": None, "failure_reason": None, "failed_reasons": [], "dataset": {},
    }


def _sample_arrays(samples, scaler):
    X, y = encode_samples(samples, scaler)
    return np.asarray(X, dtype="float32"), y


def _log_retraining_dataset(metadata, source):
    mlflow.log_params({"data_source": source, **metadata})
    mlflow.log_dict({"data_source": source, **metadata}, "dataset.json")


def _finish_retraining_result(result):
    result["metrics"] = {
        "candidate": {"mae": result["mae"], "rmse": result["rmse"]},
        "current": {"mae": result["current_mae"], "rmse": result["current_rmse"]},
        "baseline": {"mae": result["baseline_mae"], "rmse": result["baseline_rmse"]},
    }
    mlflow.set_tags({"deployment_status": result["status"],
                     "failure_reason": result["failure_reason"] or "",
                     "failure_code": result["failure_code"] or ""})
    mlflow.log_dict(result, "deployment_result.json")
    return result


def fine_tune(rows: list[dict] | None = None, csv_path: str | None = None) -> dict:
    """별도로 읽은 Production 가중치를 최근 데이터로 미세조정하고 결과를 반환한다.

    rows/csv_path 생략 시 최신 업로드 CSV를 사용한다. 서버 캐시 교체는 호출자의 역할이다.
    status: promoted / rejected / deferred(샘플 부족) / failed(실행 오류).
    """
    result = _retraining_result()
    stage = "tracking"
    try:
        model_registry.configure_experiment()
        with mlflow.start_run(run_name="fine-tune") as run:
            result["run_id"] = run.info.run_id
            try:
                mlflow.log_params({
                    "model_name": MODEL_NAME, "mode": "fine-tune", "seed": settings.seed,
                    "sequence_length": settings.sequence_length, "epochs": settings.fine_tune_epochs,
                    "learning_rate": settings.fine_tune_learning_rate, "batch_size": settings.batch_size,
                    "mae_limit": settings.mae_limit, "baseline_ratio": settings.baseline_ratio,
                    "window_days": settings.retrain_window_days,
                    "validation_days": settings.retrain_validation_days,
                    "min_train_samples": settings.retrain_min_train_samples,
                    "min_validation_samples": settings.retrain_min_validation_samples,
                    "shuffle": False, "scaler_format": model_registry.SCALER_FORMAT,
                })
                mlflow.log_dict({k: v for k, v in asdict(settings).items() if k in {
                    "model_name", "seed", "sequence_length", "fine_tune_epochs",
                    "fine_tune_learning_rate", "batch_size", "mae_limit", "baseline_ratio",
                    "retrain_window_days", "retrain_validation_days",
                    "retrain_min_train_samples", "retrain_min_validation_samples",
                }}, "training_config.json")
                stage = "registry"
                current = _current_version()
                mlflow.log_param("current_version", str(current.version) if current else "none")
                if current is not None:
                    result.update(current_version=str(current.version),
                                  model_version=model_registry.version_string(current.version))
                stage = "data"
                if rows is not None and csv_path is not None:
                    raise ValueError("rows와 csv_path 중 하나만 지정하세요.")
                source = "in_memory" if rows is not None else str(project_path(csv_path or latest_upload()))
                normalized = normalize_rows(rows) if rows is not None else load_rows(source)
                try:
                    split = split_retraining_rows(
                        normalized, window_days=settings.retrain_window_days,
                        validation_days=settings.retrain_validation_days,
                        min_train_samples=settings.retrain_min_train_samples,
                        min_validation_samples=settings.retrain_min_validation_samples,
                        seq_len=settings.sequence_length)
                except InsufficientRetrainingData as exc:
                    result.update(status="deferred", failure_code="insufficient_data",
                                  failure_reason=str(exc), failed_reasons=[str(exc)], dataset=exc.metadata)
                    _log_retraining_dataset(exc.metadata, source)
                    logger.warning("[FAIL] 재학습 보류: %s", exc)
                    return _finish_retraining_result(result)
                result["dataset"] = split.metadata
                split.metadata["data_sha256"] = hashlib.sha256(
                    json.dumps(normalized, sort_keys=True).encode()).hexdigest()
                _log_retraining_dataset(split.metadata, source)
                stage = "registry"
                if current is None:
                    result["failure_code"] = "missing_production"
                    raise ValueError("fine-tuning을 시작할 Production 모델이 없습니다.")
                stage = "loading"
                current_model, scaler, _ = model_registry.load_version(current.version)
                X_train, y_train = _sample_arrays(split.train_samples, scaler)
                X_valid, y_valid = _sample_arrays(split.validation_samples, scaler)
                y_train = np.asarray([scaler.scale_wait_min(y) for y in y_train], dtype="float32")
                current_preds = _predict_minutes(current_model, scaler, X_valid)
                baseline = [float(np.mean([row["wait_min"] for row in history]))
                            for history, _ in split.validation_samples]
                stage = "training"
                keras.utils.set_random_seed(settings.seed)
                # 로드한 비교 모델도 수정하지 않도록 별도 가중치 복사본만 학습한다.
                candidate = keras.models.clone_model(current_model)
                candidate.set_weights(current_model.get_weights())
                candidate.compile(optimizer=keras.optimizers.Adam(
                    learning_rate=settings.fine_tune_learning_rate), loss="mse")
                logger.info("[INFO] fine-tuning 시작: 기존=%s, 학습=%s, 검증=%s",
                            result["model_version"], len(y_train), len(y_valid))
                candidate.fit(X_train, y_train, epochs=settings.fine_tune_epochs,
                              batch_size=settings.batch_size, shuffle=False, verbose=0)
                stage = "evaluation"
                predictions = _predict_minutes(candidate, scaler, X_valid)
                gate = evaluate_gate(y_valid, predictions, baseline, current_preds)
                result.update(gate)
                mlflow.log_table({
                    "line_id": [target["line_id"] for _, target in split.validation_samples],
                    "landingDatetime": [target["landingDatetime"] for _, target in split.validation_samples],
                    "actual_min": y_valid, "candidate_min": predictions,
                    "current_min": current_preds, "rolling_mean_min": baseline,
                }, "validation_predictions.json")
                stage = "registration"
                registered = _log_and_register(candidate, scaler, X_train, run.info.run_id, gate,
                                               result_context=result)
                result.update(registered)
                result.update(status="promoted" if result["promoted"] else "rejected",
                              failure_code=None if result["promoted"] else "gate_rejected",
                              failure_reason=None if result["promoted"] else "; ".join(gate["failed_reasons"]))
                if not result["promoted"]:
                    result["model_version"] = model_registry.version_string(result["current_version"])
                return _finish_retraining_result(result)
            except Exception as exc:
                result.update(status="failed", failure_code=result["failure_code"] or f"{stage}_failed",
                              failure_reason=str(exc), failed_reasons=[str(exc)])
                _finish_retraining_result(result)
                mlflow.log_dict(result, "failure.json")
                # 예외를 밖으로 전달해 MLflow run을 FAILED로 종료하고, 호출자에게는 아래에서 결과 반환.
                raise
    except Exception as exc:
        result.update(status="failed", failure_code=result["failure_code"] or f"{stage}_failed",
                      failure_reason=str(exc), failed_reasons=[str(exc)])
        logger.exception("[FAIL] fine-tuning 실패: %s", result["failure_code"])
        return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="학습 CSV 경로 (생략: 최신 업로드)")
    parser.add_argument("--mode", choices=("scratch", "fine-tune"), default="scratch")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    result = fine_tune(csv_path=args.csv) if args.mode == "fine-tune" else train_and_register(csv_path=args.csv)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
