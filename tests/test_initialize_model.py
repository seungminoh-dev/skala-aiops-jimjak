import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from serving_app import initialize_model as initialization
from serving_app import model_loader
from serving_app.monitoring import drift_detector as dd


class InitializationTest(unittest.TestCase):
    def test_existing_model_is_verified_without_retraining(self):
        with patch.object(initialization.model_registry, 'current_version', return_value=SimpleNamespace(version='3')), \
                patch.object(initialization.model_registry, 'load_version') as load, \
                patch.object(initialization, '_ensure_threshold', return_value=None) as ensure, \
                patch('serving_app.train_and_register.train_and_register') as train:
            result = initialization.initialize_model()
        self.assertEqual(result['status'], 'existing')
        self.assertEqual(result['model_version'], 'v3')
        load.assert_called_once_with('3')
        train.assert_not_called()
        ensure.assert_called_once_with(retrained=False)

    def test_broken_existing_model_does_not_trigger_silent_retraining(self):
        with patch.object(initialization.model_registry, 'current_version', return_value=SimpleNamespace(version='1')), \
                patch.object(initialization.model_registry, 'load_version', side_effect=ValueError('broken')), \
                patch('serving_app.train_and_register.train_and_register') as train:
            with self.assertRaisesRegex(ValueError, 'broken'):
                initialization.initialize_model()
        train.assert_not_called()

    def test_first_initialization_preserves_gate_failure(self):
        with patch.object(initialization.model_registry, 'current_version', return_value=None), \
                patch('serving_app.train_and_register.train_and_register', return_value={'promoted': False}) as train:
            result = initialization.initialize_model('sample.csv')
        train.assert_called_once_with(csv_path='sample.csv')
        self.assertEqual(result['status'], 'rejected')

    def test_force_explicitly_retrains(self):
        with patch.object(initialization.model_registry, 'current_version', return_value=SimpleNamespace(version='1')), \
                patch.object(initialization, '_ensure_threshold', return_value={'threshold': 5.0}) as ensure, \
                patch('serving_app.train_and_register.train_and_register', return_value={'promoted': True}):
            result = initialization.initialize_model(force=True)
        self.assertEqual(result['status'], 'promoted')
        self.assertEqual(result['drift_threshold'], {'threshold': 5.0})
        ensure.assert_called_once_with(retrained=True)


class ThresholdOnInitTest(unittest.TestCase):
    """초기화 때 드리프트 임계값 보정 — 실제 data/normal_2w.csv 와 상수 예측 모델로"""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.path = os.path.join(self.dir.name, 'state', 'drift_threshold.json')
        patcher = patch.object(dd, 'THRESHOLD_PATH', self.path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def model(self):
        return SimpleNamespace(version='v1', predict_one=lambda sequence: 35.0)

    def test_missing_threshold_is_calibrated(self):
        with patch.object(model_loader, 'get_model', return_value=self.model()):
            result = initialization._ensure_threshold(retrained=False)
        with open(self.path, encoding='utf-8') as f:
            self.assertEqual(json.load(f), result)
        self.assertEqual((result['model_version'], result['source_csv']), ('v1', 'normal_2w.csv'))
        self.assertEqual(result['threshold'], round(max(result['p95'], dd.MIN_THRESHOLD), 2))

    def test_existing_threshold_is_kept_unless_retrained(self):
        os.makedirs(os.path.dirname(self.path))
        with open(self.path, 'w', encoding='utf-8') as f:
            f.write('{"threshold": 5.0}')
        with patch.object(model_loader, 'get_model') as get_model:
            self.assertIsNone(initialization._ensure_threshold(retrained=False))
        get_model.assert_not_called()

    def test_calibration_failure_does_not_stop_init(self):
        with patch.object(model_loader, 'get_model', side_effect=RuntimeError('no model')), \
                self.assertLogs('aiops', 'ERROR') as logs:
            self.assertIsNone(initialization._ensure_threshold(retrained=True))
        self.assertIn('[FAIL] 드리프트 임계값 보정 실패', logs.output[0])
        self.assertFalse(os.path.exists(self.path))
