import copy
import tempfile
import unittest
from pathlib import Path
from data.features import (load_rows, build_sequences, JimJakScaler,
                           fit_training_scaler, sequence_samples)

ROOT = Path(__file__).resolve().parents[1]


class FeaturesTest(unittest.TestCase):
    def setUp(self):
        self.rows = load_rows(ROOT / 'data/train_normal.csv')

    def test_all_existing_csvs_and_legacy_column(self):
        for path in (ROOT / 'data').glob('*.csv'):
            rows = load_rows(path)
            self.assertIn('landingDatetime', rows[0])
            X, y = build_sequences(rows, JimJakScaler().fit(rows))
            self.assertEqual(len(X), len(rows) - 20)
            self.assertEqual(len(X[0]), 20)
            self.assertEqual(len(X[0][0]), 2)
            self.assertEqual(len(X), len(y))

    def test_next_seats_and_serving_transform(self):
        scaler = fit_training_scaler(self.rows)
        X, y = build_sequences(self.rows, scaler)
        for j in range(20):
            self.assertEqual(X[0][j], scaler.transform_point(
                self.rows[j]['wait_min'], self.rows[j+1]['seats']))
        self.assertEqual(y[0], self.rows[20]['wait_min'])
        changed = copy.deepcopy(self.rows)
        changed[20]['wait_min'] = 9999
        self.assertEqual(X[0], build_sequences(changed, scaler)[0][0])

    def test_validation_does_not_fit_scaler(self):
        original = fit_training_scaler(self.rows)
        changed = copy.deepcopy(self.rows)
        changed[-1]['wait_min'] = 9999
        changed[-1]['seats'] = 9999
        self.assertEqual(vars(original), vars(fit_training_scaler(changed)))

    def test_lines_do_not_mix_and_input_is_sorted(self):
        a = self.rows[:25]
        b = [dict(r, line_id='T2-03') for r in a]
        samples = sequence_samples(list(reversed(a+b)))
        self.assertEqual(len(samples), 10)
        for history, target in samples:
            self.assertTrue(all(r['line_id'] == target['line_id'] for r in history))

    def test_scaler_roundtrip_and_old_scaler_rejection(self):
        scaler = fit_training_scaler(self.rows)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'scaler.pkl'
            scaler.save(path)
            restored = JimJakScaler.load(path)
            self.assertAlmostEqual(restored.inverse_wait_min(restored.scale_wait_min(45)), 45)
            self.assertEqual(restored.transform_point(45, 189), scaler.transform_point(45, 189))
            import pickle
            path.write_bytes(pickle.dumps({'close_min': 1}))
            with self.assertRaises(ValueError):
                JimJakScaler.load(path)


if __name__ == '__main__':
    unittest.main()
