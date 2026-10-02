"""프로세스 시작 시 JSON 설정을 읽는다. 환경변수가 파일보다 우선한다."""
import json
import math
import os
from dataclasses import dataclass, fields
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def project_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path.resolve() if path.is_absolute() else (ROOT / path).resolve()


@dataclass(frozen=True)
class Settings:
    model_name: str
    experiment_name: str
    sequence_length: int
    seed: int
    base_epochs: int
    fine_tune_epochs: int
    batch_size: int
    learning_rate: float
    fine_tune_learning_rate: float
    validation_ratio: float
    mae_limit: float
    baseline_ratio: float
    tracking_uri: str
    artifact_root: str
    model_source: str
    loading_mode: str
    model_version: str
    local_model_dir: str
    training_data_path: str
    upload_dir: str
    log_dir: str
    retrain_window_days: int
    retrain_validation_days: int
    retrain_min_train_samples: int
    retrain_min_validation_samples: int


def load_settings() -> Settings:
    values = json.loads((ROOT / "serving_app/settings.json").read_text())
    if os.getenv("JIMJAK_CONFIG"):
        overrides = json.loads(project_path(os.environ["JIMJAK_CONFIG"]).read_text())
        unknown = overrides.keys() - values.keys()
        if unknown:
            raise ValueError(f"알 수 없는 설정: {sorted(unknown)}")
        values.update(overrides)
    for field in fields(Settings):
        env_name = "MLFLOW_TRACKING_URI" if field.name == "tracking_uri" else field.name.upper()
        if env_name in os.environ:
            values[field.name] = field.type(os.environ[env_name])
        if type(values[field.name]) is not field.type:
            # JSON의 정수 표기도 float 설정에 허용한다.
            if field.type is float and type(values[field.name]) is int:
                values[field.name] = float(values[field.name])
            else:
                raise ValueError(f"설정 타입 오류: {field.name}")
    cfg = Settings(**values)
    for name in ("sequence_length", "base_epochs", "fine_tune_epochs", "batch_size",
                 "retrain_window_days", "retrain_validation_days",
                 "retrain_min_train_samples", "retrain_min_validation_samples"):
        if getattr(cfg, name) < 1:
            raise ValueError(f"{name}은 1 이상이어야 합니다.")
    for name in ("learning_rate", "fine_tune_learning_rate", "mae_limit"):
        if not math.isfinite(getattr(cfg, name)) or getattr(cfg, name) <= 0:
            raise ValueError(f"{name}은 유한한 양수여야 합니다.")
    if not 0 < cfg.validation_ratio < 1 or not 0 < cfg.baseline_ratio < 1:
        raise ValueError("validation_ratio와 baseline_ratio는 0과 1 사이여야 합니다.")
    if cfg.retrain_validation_days >= cfg.retrain_window_days:
        raise ValueError("재학습 검증 일수는 대상 기간보다 짧아야 합니다.")
    if cfg.model_source not in {"local", "mlflow"} or cfg.loading_mode not in {"lazy", "eager"}:
        raise ValueError("MODEL_SOURCE는 local/mlflow, LOADING_MODE는 lazy/eager입니다.")
    if cfg.model_version and (not cfg.model_version.isdecimal() or int(cfg.model_version) < 1):
        raise ValueError("MODEL_VERSION은 1 이상의 숫자 문자열이어야 합니다 (예: 1).")
    if not cfg.model_name or "'" in cfg.model_name or not cfg.experiment_name:
        raise ValueError("모델·실험 이름을 확인하세요. 모델 이름에 작은따옴표는 사용할 수 없습니다.")
    for name in ("local_model_dir", "training_data_path", "upload_dir", "log_dir"):
        values[name] = str(project_path(values[name]))
    if values["tracking_uri"].startswith("sqlite:///"):
        values["tracking_uri"] = "sqlite:///" + str(project_path(values["tracking_uri"][10:]))
    if "://" not in values["artifact_root"]:
        values["artifact_root"] = project_path(values["artifact_root"]).as_uri()
    return Settings(**values)


settings = load_settings()
