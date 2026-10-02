"""업로드된 HAIC 데이터 파일 관리"""
import glob
import os

from serving_app.config import settings

UPLOAD_DIR = settings.upload_dir


def latest_upload(upload_dir: str = UPLOAD_DIR) -> str:
    """data/uploads/ 에 쌓인 CSV 중 가장 최근에 업로드된 파일의 경로를 반환한다."""
    files = sorted(glob.glob(os.path.join(upload_dir, "*.csv")), key=os.path.getmtime)
    if not files:
        raise FileNotFoundError(
            "업로드된 HAIC 데이터가 없습니다. 대시보드에서 CSV 파일을 먼저 업로드하세요 "
            f"(data/sample_haic_prices.csv를 예시로 업로드해볼 수 있습니다 -> {upload_dir}/)."
        )
    return files[-1]
