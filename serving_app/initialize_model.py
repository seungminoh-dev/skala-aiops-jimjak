"""Docker 초기화 명령: 기존 운영 모델을 검증하고 미등록 상태에서 학습한다."""
import argparse
import json
import logging

from serving_app.config import settings
from serving_app.logging_config import configure_aiops_logger
from serving_app import model_registry

logger = logging.getLogger("aiops")


def initialize_model(csv_path=None, force=False):
    current = model_registry.current_version()
    if current is not None and not force:
        model_registry.load_version(current.version)
        result = {"status": "existing", "promoted": False,
                  "version": str(current.version),
                  "model_version": model_registry.version_string(current.version)}
        logger.info("[OK] 기존 Production %s 로딩 검증 완료: 초기 학습 생략", result["model_version"])
        return result
    from serving_app.train_and_register import train_and_register

    result = train_and_register(csv_path=csv_path or settings.training_data_path)
    result["status"] = "promoted" if result["promoted"] else "rejected"
    return result


def main():
    parser = argparse.ArgumentParser(description="운영 모델 초기화 (별도 학습·등록 명령)")
    parser.add_argument("--csv", default=settings.training_data_path)
    parser.add_argument("--force", action="store_true", help="기존 운영 모델이 있어도 전체 학습·평가 실행")
    args = parser.parse_args()
    configure_aiops_logger(settings.log_dir)
    try:
        result = initialize_model(args.csv, args.force)
    except Exception:
        logger.exception("[FAIL] 모델 초기화 실패")
        raise SystemExit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["status"] == "rejected":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
