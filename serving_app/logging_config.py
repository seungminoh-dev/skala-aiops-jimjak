"""
"aiops" 로거 설정 — 드리프트 판정·재학습·배포 기준·응답 지연 로그를 logs/aiops.log 와 터미널에 남긴다.

한 줄 형식 (기획서 ③ 로그 태그):
    2026-10-02 09:40:09 [WARN] 드리프트 감지 (2/2): MAE 8.8분 > 임계값 5.0분 - 재학습 시작
    2026-10-02 09:40:15 [OK] MAE=4.409, Production v2 승격

- 메시지가 이미 [INFO]·[WARN]·[ALERT]·[OK]·[FAIL] 태그로 시작하면 그대로 쓴다 (등급을 한 번 더 붙이지 않는다)
- 태그가 없으면 로그 등급으로 붙인다: INFO → [INFO], WARNING → [WARN], ERROR 이상 → [FAIL]
- 파일은 1MB 마다 돌려 5개까지 보관한다 (aiops.log, aiops.log.1 …)
- uvicorn 자체 로깅과 섞이지 않도록 "aiops" 로거 하나만 설정하고, 위(root)로 넘기지 않는다
"""
import logging
import os
import re
from logging.handlers import RotatingFileHandler

LOGGER_NAME = "aiops"
TAGS = ("INFO", "WARN", "ALERT", "OK", "FAIL")
_TAG_AT_START = re.compile(r"^\[(?:%s)\]" % "|".join(TAGS))
_LEVEL_TAG = {logging.DEBUG: "INFO", logging.INFO: "INFO", logging.WARNING: "WARN", logging.ERROR: "FAIL", logging.CRITICAL: "FAIL"}

MAX_BYTES = 1_000_000
BACKUP_COUNT = 5


class TagFormatter(logging.Formatter):
    """'시각 [태그] 메시지' — 메시지에 태그가 있으면 그대로, 없으면 등급으로 붙인다"""

    def format(self, record: logging.LogRecord) -> str:
        message = record.getMessage()
        if not _TAG_AT_START.match(message):
            message = f"[{_LEVEL_TAG.get(record.levelno, 'INFO')}] {message}"
        line = f"{self.formatTime(record, '%Y-%m-%d %H:%M:%S')} {message}"
        if record.exc_info:
            line += "\n" + self.formatException(record.exc_info)
        return line


def configure_aiops_logger(log_dir: str = "logs", filename: str = "aiops.log") -> logging.Logger:
    """앱 시작 시 한 번 부른다. 다시 불러도 핸들러가 겹치지 않는다."""
    os.makedirs(log_dir, exist_ok=True)
    logger = logging.getLogger(LOGGER_NAME)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not getattr(logger, "_jimjak_configured", False):
        formatter = TagFormatter()
        file_handler = RotatingFileHandler(
            os.path.join(log_dir, filename), maxBytes=MAX_BYTES, backupCount=BACKUP_COUNT, encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        stream_handler = logging.StreamHandler()  # 터미널에서도 같은 형식으로
        stream_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        logger.addHandler(stream_handler)
        logger._jimjak_configured = True  # type: ignore[attr-defined]
    return logger
