import csv
import datetime as dt
import os
import tempfile
import unittest
from unittest.mock import patch

from serving_app.monitoring import drift_detector as dd
from serving_app.monitoring import retrain_trigger as rt

FIELDS = [
    "flightId", "terminalId", "bagCarouselId", "line_id", "aircraftSubtype", "seats",
    "estimatedDatetime", "landingDatetime", "bagLastTime", "wait_min", "event_tag",
]


def write_csv(days: int, per_day: int = 16, event_at: tuple[int, int] | None = None) -> str:
    """days 일치 편 기록. event_at=(시작 행, 끝 행) 이면 그 구간에 사건 태그"""
    fd, path = tempfile.mkstemp(suffix=".csv")
    start = dt.datetime(2026, 9, 1)
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for i in range(days * per_day):
            t = start + dt.timedelta(minutes=90 * i)
            tag = "bhs_failure" if event_at and event_at[0] <= i < event_at[1] else ""
            w.writerow({
                "flightId": f"KE{i:03d}", "terminalId": "P01", "bagCarouselId": "3", "line_id": "T1-03",
                "aircraftSubtype": "738", "seats": 189, "estimatedDatetime": t.strftime("%Y%m%d%H%M"),
                "landingDatetime": t.strftime("%Y%m%d%H%M"), "bagLastTime": t.strftime("%Y%m%d%H%M"),
                "wait_min": 35, "event_tag": tag,
            })
    return path


def window(error: float) -> list[dict]:
    return [{"predicted": 30.0, "actual": 30.0 + error, "event_tag": ""} for _ in range(dd.WINDOW_SIZE)]


class RetrainRowsTest(unittest.TestCase):
    def test_last_two_weeks_without_events(self):
        path = write_csv(days=30, event_at=(470, 474))  # 사건 4편은 마지막 2주 안
        self.addCleanup(os.remove, path)
        rows, info = rt.retrain_rows(path)
        last = max(r["landingDatetime"] for r in rows)
        first = min(r["landingDatetime"] for r in rows)
        span = dt.datetime.strptime(last, "%Y%m%d%H%M") - dt.datetime.strptime(first, "%Y%m%d%H%M")
        self.assertLessEqual(span, dt.timedelta(days=14))
        self.assertTrue(all(not r["event_tag"] for r in rows))
        self.assertEqual(info["events_excluded"], 4)
        self.assertEqual(info["rows"], len(rows))


class CheckAndTriggerTest(unittest.TestCase):
    def setUp(self):
        dd.STATE.consecutive = 0
        dd.STATE.history.clear()
        patcher = patch.object(dd, "load_threshold", return_value=(5.0, "given"))
        patcher.start()
        self.addCleanup(patcher.stop)

    def rows(self, n=200):
        return [{"wait_min": 35.0, "seats": 189, "event_tag": "", "landingDatetime": "202609010000", "line_id": "T1-03"}] * n

    def test_no_retrain_before_second_breach(self):
        with patch.object(rt, "_fine_tune") as ft:
            self.assertEqual(rt.check_and_trigger(window(8))["status"], dd.WARN)
            ft.assert_not_called()

    def test_second_breach_retrains_and_promotes(self):
        rt.check_and_trigger(window(8))
        with patch.object(rt, "retrain_rows", return_value=(self.rows(), {"file": "x.csv", "rows": 200, "events_excluded": 0})), \
             patch.object(rt, "_fine_tune", return_value={"promoted": True, "version": "2", "passed": True, "mae": 4.1}) as ft:
            result = rt.check_and_trigger(window(8))
        ft.assert_called_once()
        self.assertEqual(result["status"], dd.RETRAIN)
        self.assertTrue(result["promoted"])
        self.assertEqual(result["version"], "v2")
        self.assertEqual(dd.STATE.consecutive, 0)

    def test_gate_failure_keeps_model_and_resets(self):
        rt.check_and_trigger(window(8))
        failed = {"promoted": False, "passed": False, "mae": 5.6, "failed_reasons": ["MAE가 5분을 초과했습니다."]}
        with patch.object(rt, "retrain_rows", return_value=(self.rows(), {"file": "x.csv", "rows": 200, "events_excluded": 0})), \
             patch.object(rt, "_fine_tune", return_value=failed):
            result = rt.check_and_trigger(window(8))
        self.assertFalse(result["promoted"])
        self.assertEqual(result["retrain"]["failed_reasons"], ["MAE가 5분을 초과했습니다."])
        self.assertEqual(dd.STATE.consecutive, 0)

    def test_not_enough_rows_skips_fine_tune(self):
        rt.check_and_trigger(window(8))
        with patch.object(rt, "retrain_rows", return_value=(self.rows(10), {"file": "x.csv", "rows": 10, "events_excluded": 0})), \
             patch.object(rt, "_fine_tune") as ft:
            result = rt.check_and_trigger(window(8))
        ft.assert_not_called()
        self.assertFalse(result["promoted"])
        self.assertEqual(result["retrain"]["error"], "not_enough_rows")

    def test_fine_tune_error_does_not_raise(self):
        rt.check_and_trigger(window(8))
        with patch.object(rt, "retrain_rows", return_value=(self.rows(), {"file": "x.csv", "rows": 200, "events_excluded": 0})), \
             patch.object(rt, "_fine_tune", side_effect=ValueError("fine-tuning을 시작할 Production 모델이 없습니다.")):
            result = rt.check_and_trigger(window(8))
        self.assertFalse(result["promoted"])
        self.assertFalse(result["retrain"]["ok"])
        self.assertEqual(dd.STATE.consecutive, 0)

    def test_alert_only_never_retrains(self):
        tagged = window(9)
        for p in tagged[:4]:
            p["event_tag"] = "bhs_failure"
        with patch.object(rt, "_fine_tune") as ft:
            for _ in range(3):
                self.assertEqual(rt.check_and_trigger(tagged)["status"], dd.ALERT_ONLY)
        ft.assert_not_called()


if __name__ == "__main__":
    unittest.main()
