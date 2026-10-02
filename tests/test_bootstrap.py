import json
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from serving_app import bootstrap, model_loader
from serving_app.main import model_not_ready
from serving_app.routers import health


class BootstrapTest(unittest.TestCase):
    """첫 실행 — 운영 모델이 없으면 기본 모델을 백그라운드에서 한 번만 학습한다 (실제 학습은 하지 않고 바꿔 끼운다)"""

    def setUp(self):
        bootstrap._state.update(status=bootstrap.IDLE, error=None)
        self.addCleanup(bootstrap._state.update, status=bootstrap.IDLE, error=None)
        cache = patch.object(model_loader, '_model_cache', None)
        cache.start()
        self.addCleanup(cache.stop)

    def run_bootstrap(self, result=None, error=None):
        with patch('serving_app.initialize_model.initialize_model', return_value=result, side_effect=error) as init, \
                patch.object(model_loader, 'reload_model', return_value=SimpleNamespace(version='v1')) as reload:
            self.assertTrue(bootstrap.start())
            bootstrap._thread.join(5)
        return init, reload

    def test_missing_model_starts_training_once_and_answers_503(self):
        with patch.object(model_loader, '_load_model', side_effect=model_loader.ModelNotReady('없음')), \
                patch.object(bootstrap, 'start') as start:
            with self.assertRaises(model_loader.ModelNotReady):
                model_loader.get_model()
            self.assertIsNone(model_loader.load_eager())
        self.assertEqual(start.call_count, 2)
        response = model_not_ready(None, model_loader.ModelNotReady('없음'))
        self.assertEqual(response.status_code, 503)
        self.assertIn('기본 모델(v1)을 학습', json.loads(response.body)['detail'])

    def test_success_loads_new_model_and_does_not_rerun(self):
        with self.assertLogs('aiops', 'INFO') as logs:
            init, reload = self.run_bootstrap(result={'status': 'promoted'})
        init.assert_called_once_with()
        reload.assert_called_once_with()
        self.assertEqual(bootstrap.status(), bootstrap.READY)
        self.assertIn('[OK] 기본 모델 v1 준비 완료', logs.output[-1])
        self.assertFalse(bootstrap.start())  # 끝났으면 다시 학습하지 않는다

    def test_gate_failure_is_reported_and_not_retried(self):
        with self.assertLogs('aiops', 'INFO') as logs:
            _, reload = self.run_bootstrap(result={'status': 'rejected'})
        reload.assert_not_called()
        self.assertEqual(bootstrap.status(), bootstrap.FAILED)
        self.assertIn('[FAIL] 기본 모델 학습 실패', logs.output[-1])
        self.assertIn('initialize_model', bootstrap.message())
        self.assertFalse(bootstrap.start())
        with self.assertRaises(HTTPException) as caught:
            health.health()
        self.assertEqual((caught.exception.status_code, caught.exception.detail['status']), (503, 'failed'))

    def test_health_reports_training(self):
        bootstrap._state.update(status=bootstrap.TRAINING)
        with self.assertRaises(HTTPException) as caught:
            health.health()
        self.assertEqual(caught.exception.detail['status'], 'training')

    def test_local_source_never_trains(self):
        with patch.object(bootstrap, 'settings', replace(bootstrap.settings, model_source='local')):
            self.assertFalse(bootstrap.start())
            self.assertIn('train_baseline_v1.py', bootstrap.message())
        self.assertEqual(bootstrap.status(), bootstrap.IDLE)


if __name__ == '__main__':
    unittest.main()
