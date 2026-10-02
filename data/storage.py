"""업로드된 편 기록 CSV 관리 — 재학습은 가장 최근 파일을 쓴다"""
import glob
import os

from serving_app.config import settings

UPLOAD_DIR = settings.upload_dir


def latest_upload(upload_dir: str = UPLOAD_DIR) -> str:
    """data/uploads/ 에 쌓인 CSV 중 가장 최근에 업로드된 파일의 경로를 반환한다."""
    files = sorted(glob.glob(os.path.join(upload_dir, "*.csv")), key=os.path.getmtime)
    if not files:
        raise FileNotFoundError(
            "업로드된 편 기록이 없습니다. 대시보드 시나리오 화면이나 POST /data/upload 로 CSV를 먼저 올리세요 "
            f"(예: data/normal_2w.csv -> {upload_dir}/)."
        )
    return files[-1]
