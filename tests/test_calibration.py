import json
import os
import tempfile
import unittest
from types import SimpleNamespace

from serving_app.monitoring import calibration
from serving_app.monitoring import drift_detector as dd


class CalibrationTest(unittest.TestCase):
    def test_window_maes_slide_by_one(self):
        self.assertEqual(calibration.window_maes([1, -3, 2, 0], size=2), [2.0, 2.5, 1.0])

    def test_calibrate_floors_at_gate_and_writes_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "drift_threshold.json")
            model = SimpleNamespace(version="v7", predict_one=lambda sequence: float(sequence[-1]["wait_min"]))
            with self.assertLogs("aiops", "INFO") as logs:
                result = calibration.calibrate(model, path=path)
            with open(path, encoding="utf-8") as f:
                self.assertEqual(json.load(f), result)
        self.assertEqual(result["windows"], 220 - 20 - dd.WINDOW_SIZE + 1)  # normal_2w.csv 220편
        self.assertEqual(result["threshold"], round(max(result["p95"], dd.MIN_THRESHOLD), 2))
        self.assertGreaterEqual(result["threshold"], dd.MIN_THRESHOLD)
        self.assertEqual(result["model_version"], "v7")
        self.assertIn("[INFO] 드리프트 임계값 보정", logs.output[0])


if __name__ == "__main__":
    unittest.main()
