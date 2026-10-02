import json
import os
import tempfile
import unittest

from serving_app.monitoring import drift_detector as dd

THRESHOLD = 5.0


def window(error: float, events: int = 0, tag: str = "bhs_failure", n: int = dd.WINDOW_SIZE) -> list[dict]:
    """오차가 모두 error 분인 예측 n개. 앞에서부터 events 편에 사건 태그"""
    return [{"predicted": 30.0, "actual": 30.0 + error, "event_tag": tag if i < events else ""} for i in range(n)]


class MaeTest(unittest.TestCase):
    def test_mae_and_rmse(self):
        w = [{"predicted": 10, "actual": 13}, {"predicted": 10, "actual": 6}]
        self.assertAlmostEqual(dd.compute_mae(w), 3.5)
        self.assertAlmostEqual(dd.compute_rmse(w), (12.5) ** 0.5)

    def test_empty(self):
        self.assertEqual(dd.compute_mae([]), 0.0)
        self.assertEqual(dd.compute_rmse([]), 0.0)


class JudgeTest(unittest.TestCase):
    def setUp(self):
        self.state = dd.DriftState()

    def judge(self, w):
        return dd.judge(w, self.state, threshold=THRESHOLD)

    def test_pending_until_window_is_full(self):
        v = self.judge(window(10, n=dd.WINDOW_SIZE - 1))
        self.assertEqual(v["status"], dd.PENDING)
        self.assertEqual(self.state.history, [])

    def test_ok_at_threshold(self):
        self.assertEqual(self.judge(window(THRESHOLD))["status"], dd.OK)

    def test_two_consecutive_breaches_trigger_retrain(self):
        first = self.judge(window(8))
        second = self.judge(window(8))
        self.assertEqual((first["status"], first["consecutive"]), (dd.WARN, 1))
        self.assertEqual((second["status"], second["consecutive"]), (dd.RETRAIN, 2))

    def test_ok_resets_consecutive(self):
        self.judge(window(8))
        self.judge(window(2))
        self.assertEqual(self.state.consecutive, 0)
        self.assertEqual(self.judge(window(8))["status"], dd.WARN)

    def test_event_window_is_alert_only(self):
        v = self.judge(window(9, events=4))
        self.assertEqual(v["status"], dd.ALERT_ONLY)
        self.assertEqual(v["event_tags"], ["bhs_failure"])
        self.assertEqual(v["event_count"], 4)
        self.assertEqual(self.state.consecutive, 0)

    def test_alert_only_keeps_consecutive(self):
        # 주의 1회 → 사건 창(그대로 1) → 다시 초과하면 2회째 → 재학습
        self.judge(window(8))
        self.assertEqual(self.judge(window(9, events=4))["consecutive"], 1)
        self.assertEqual(self.judge(window(8))["status"], dd.RETRAIN)

    def test_event_only_window_has_no_plain_mae(self):
        v = self.judge(window(20, events=dd.WINDOW_SIZE, tag="terminal_open"))
        self.assertEqual(v["status"], dd.ALERT_ONLY)
        self.assertIsNone(v["mae_without_events"])

    def test_mae_without_events(self):
        w = window(2, events=0)
        for p in w[:3]:
            p.update(actual=p["predicted"] + 40, event_tag="bhs_failure")
        v = self.judge(w)
        self.assertEqual(v["status"], dd.ALERT_ONLY)
        self.assertAlmostEqual(v["mae_without_events"], 2.0)

    def test_uses_only_last_window(self):
        old = window(30)
        self.assertEqual(self.judge(old + window(1))["status"], dd.OK)

    def test_reset(self):
        self.judge(window(8))
        self.state.reset()
        self.assertEqual(self.judge(window(8))["status"], dd.WARN)

    def test_history_is_capped(self):
        for _ in range(dd.HISTORY_SIZE + 5):
            self.judge(window(1))
        self.assertEqual(len(self.state.history), dd.HISTORY_SIZE)

    def test_verdict_carries_number_time_and_judged_points(self):
        first = self.judge(window(2, events=1))
        second = self.judge(window(2))
        self.assertEqual((first["no"], second["no"]), (1, 2))
        self.assertIn("T", first["at"])
        self.assertEqual(len(first["points"]), dd.WINDOW_SIZE)
        self.assertEqual(first["points"][0], {"predicted": 30.0, "actual": 32.0, "event_tag": "bhs_failure"})
        self.assertEqual(first["points"][1]["event_tag"], "")

    def test_annotate_last_changes_only_the_record(self):
        v = self.judge(window(8))
        self.state.annotate_last(model_version="v1")
        self.assertNotIn("model_version", v)
        self.assertEqual(self.state.history[-1]["model_version"], "v1")

    def test_clear_empties_everything(self):
        self.judge(window(8))
        self.state.clear()
        self.assertEqual((self.state.consecutive, self.state.history, self.state.judged), (0, [], 0))
        self.assertEqual(self.judge(window(1))["no"], 1)


class ThresholdTest(unittest.TestCase):
    def write(self, payload) -> str:
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w") as f:
            f.write(payload if isinstance(payload, str) else json.dumps(payload))
        self.addCleanup(os.remove, path)
        return path

    def test_calibrated_value(self):
        self.assertEqual(dd.load_threshold(self.write({"threshold": 6.4})), (6.4, "calibrated"))

    def test_never_below_deploy_gate(self):
        self.assertEqual(dd.load_threshold(self.write({"threshold": 3.9}))[0], dd.MIN_THRESHOLD)

    def test_missing_or_broken_file_uses_default(self):
        self.assertEqual(dd.load_threshold("/nonexistent/threshold.json"), (dd.DEFAULT_THRESHOLD, "default"))
        self.assertEqual(dd.load_threshold(self.write("not json"))[1], "default")


if __name__ == "__main__":
    unittest.main()
