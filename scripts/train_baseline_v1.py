"""최초 학습도 공통 MLflow 기록·배포 게이트·모델 번들 경로를 사용한다."""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from serving_app.config import settings
from serving_app.train_and_register import train_and_register
from serving_app.logging_config import configure_aiops_logger


def main():
    parser = argparse.ArgumentParser(description="수하물 baseline 학습 및 MLflow 등록")
    parser.add_argument("--csv", default=settings.training_data_path)
    args = parser.parse_args()
    configure_aiops_logger(settings.log_dir)
    result = train_and_register(csv_path=args.csv)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
