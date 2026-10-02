import unittest
from unittest.mock import patch

from serving_app.monitoring import drift_detector as dd
from serving_app.monitoring import retrain_trigger
from serving_app.routers import monitoring, predict


def window(error: float) -> list[dict]:
    return [{"predicted": 30.0, "actual": 30.0 + error, "event_tag": ""} for _ in range(dd.WINDOW_SIZE)]


class MonitoringRouterTest(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(dd, "load_threshold", return_value=(5.0, "calibrated"))
        patcher.start()
        self.addCleanup(patcher.stop)
        dd.STATE.clear()
        self.addCleanup(dd.STATE.clear)
        predict.recent_predictions.clear()
        self.addCleanup(predict.recent_predictions.clear)

    def test_status_reports_window_and_history(self):
        predict.recent_predictions[:] = window(8)[:13]
        dd.judge(window(8))
        s = monitoring.status()
        self.assertEqual((s["threshold"], s["window_count"], s["consecutive"]), (5.0, 13, 1))
        self.assertEqual(s["last"]["status"], dd.WARN)
        self.assertEqual(len(s["last"]["points"]), dd.WINDOW_SIZE)

    def test_reset_clears_monitoring_state_only(self):
        dd.judge(window(8))
        predict.recent_predictions[:] = window(8)
        retrain_trigger._rejected_file = "a.csv"
        with self.assertLogs("aiops", "INFO") as logs:
            self.assertEqual(monitoring.reset(), {"ok": True})
        s = monitoring.status()
        self.assertEqual((s["consecutive"], s["window_count"], s["history"], s["last"]), (0, 0, [], None))
        self.assertIsNone(retrain_trigger._rejected_file)
        self.assertIn("[INFO] 데모 초기화", logs.output[0])


if __name__ == "__main__":
    unittest.main()
