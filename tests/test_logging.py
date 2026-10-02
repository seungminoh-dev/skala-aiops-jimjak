import asyncio
import logging
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response

from serving_app import logging_config, request_timing
from serving_app.routers import logs as logs_router


def record(message: str, level: int = logging.INFO) -> logging.LogRecord:
    return logging.LogRecord("aiops", level, __file__, 1, message, None, None)


class TagFormatterTest(unittest.TestCase):
    def setUp(self):
        self.fmt = logging_config.TagFormatter()

    def test_keeps_existing_tag(self):
        line = self.fmt.format(record("[ALERT] 일시적 이상", logging.WARNING))
        self.assertRegex(line, r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \[ALERT\] 일시적 이상$")

    def test_adds_tag_from_level(self):
        self.assertIn(" [WARN] 그냥 경고", self.fmt.format(record("그냥 경고", logging.WARNING)))
        self.assertIn(" [FAIL] 실패", self.fmt.format(record("실패", logging.ERROR)))
        self.assertIn(" [INFO] 정보", self.fmt.format(record("정보")))


class ConfigureTest(unittest.TestCase):
    def test_writes_file_once_even_if_called_twice(self):
        logger = logging.getLogger(logging_config.LOGGER_NAME)
        saved = (logger.handlers[:], getattr(logger, "_jimjak_configured", False))
        logger.handlers.clear()
        logger._jimjak_configured = False
        try:
            with tempfile.TemporaryDirectory() as d, patch("sys.stderr"):
                logging_config.configure_aiops_logger(d)
                logging_config.configure_aiops_logger(d)
                self.assertEqual(len(logger.handlers), 2)
                logger.warning("[WARN] 드리프트 감지 (1/2)")
                for h in logger.handlers:
                    h.flush()
                with open(os.path.join(d, "aiops.log"), encoding="utf-8") as f:
                    lines = f.read().splitlines()
                self.assertEqual(len(lines), 1)
                self.assertTrue(lines[0].endswith("[WARN] 드리프트 감지 (1/2)"))
                for h in logger.handlers:
                    h.close()
        finally:
            logger.handlers[:] = saved[0]
            logger._jimjak_configured = saved[1]


class LogsRouterTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        patcher = patch.object(logs_router, "LOG_DIR", self.dir.name)
        patcher.start()
        self.addCleanup(patcher.stop)
        with open(os.path.join(self.dir.name, "aiops.log"), "w", encoding="utf-8") as f:
            f.write(
                "2026-10-02 09:37:38,522 [INFO] [INFO] 드리프트 점검 정상\n"  # 예전 형식
                "2026-10-02 09:40:09 [WARN] 드리프트 감지 (2/2)\n"
                "2026-10-02 09:40:09 [INFO] 재학습 시작\n"
                "2026-10-02 09:40:15 [FAIL] 재학습 실패: boom\n"
                "Traceback (most recent call last):\n"
                "2026-10-02 09:41:00 [ALERT] 일시적 이상\n"
            )

    def test_events_parse_both_formats(self):
        items = logs_router.events(limit=100, tags=None)
        self.assertEqual([e["tag"] for e in items], ["INFO", "WARN", "INFO", "FAIL", "ALERT"])
        self.assertEqual(items[0]["message"], "드리프트 점검 정상")
        self.assertIn("Traceback", items[3]["message"])

    def test_events_carry_time_with_server_offset(self):
        e = logs_router.events(limit=1, tags=None)[0]
        self.assertTrue(e["at"].startswith("2026-10-02T09:41:00"))
        self.assertRegex(e["at"], r"[+-]\d{2}:\d{2}$")

    def test_events_filter_and_limit(self):
        self.assertEqual([e["tag"] for e in logs_router.events(limit=100, tags="warn, alert")], ["WARN", "ALERT"])
        self.assertEqual(len(logs_router.events(limit=2, tags=None)), 2)

    def test_tail(self):
        content = logs_router.read_log("aiops.log", tail=1)["content"]
        self.assertEqual(content, "2026-10-02 09:41:00 [ALERT] 일시적 이상")

    def test_rejects_path_traversal_and_missing(self):
        with self.assertRaises(HTTPException) as bad:
            logs_router.read_log("../secret", tail=None)
        self.assertEqual(bad.exception.status_code, 400)
        with self.assertRaises(HTTPException) as missing:
            logs_router.read_log("nope.log", tail=None)
        self.assertEqual(missing.exception.status_code, 404)

    def test_list(self):
        self.assertEqual([f["name"] for f in logs_router.list_logs()], ["aiops.log"])


class LatencyTest(unittest.TestCase):
    def test_stats(self):
        t = request_timing.LatencyTracker(slow_ms=1000)
        for ms in (10, 20, 30, 40, 1500):
            t.add(ms)
        s = t.stats()
        self.assertEqual((s["count"], s["slow_count"], s["max_ms"], s["p50_ms"]), (5, 1, 1500, 30))

    def test_empty_stats(self):
        self.assertIsNone(request_timing.LatencyTracker().stats()["p95_ms"])

    def run_middleware(self, path: str, seconds: float):
        request = Request({"type": "http", "method": "POST", "path": path, "headers": [], "query_string": b""})

        async def call_next(_):
            return Response("ok")

        ticks = iter([0.0, seconds])
        with patch.object(request_timing.time, "perf_counter", lambda: next(ticks)):
            return asyncio.run(request_timing.timing_middleware(request, call_next))

    def test_slow_predict_is_logged(self):
        tracker = request_timing.LatencyTracker()
        with patch.object(request_timing, "TRACKER", tracker), self.assertLogs("aiops", "WARNING") as logs:
            response = self.run_middleware("/predict", 1.5)
        self.assertEqual(response.headers["X-Response-Time-Ms"], "1500.0")
        self.assertIn("[WARN] 예측 응답 지연", logs.output[0])
        self.assertEqual(tracker.stats()["slow_count"], 1)

    def test_batch_test_is_not_tracked(self):
        tracker = request_timing.LatencyTracker()
        with patch.object(request_timing, "TRACKER", tracker):
            self.run_middleware("/predict/batch-test", 5.0)
        self.assertEqual(tracker.stats()["count"], 0)


if __name__ == "__main__":
    unittest.main()
