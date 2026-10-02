"""임시 SQLite/아티팩트에 실제 Keras 모델을 기록하는 통합 테스트."""
import json
import tempfile
import unittest
from contextlib import ExitStack
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

import mlflow
import numpy as np
from tensorflow import keras

from data.features import JimJakScaler, load_rows
from serving_app import model_loader, model_registry, train_and_register as training
from serving_app.config import ROOT, settings
from serving_app.deployment_gate import evaluate_gate


class ModelManagementTest(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.temp = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        cfg = replace(settings, tracking_uri=f'sqlite:///{self.temp}/mlflow.db',
                      artifact_root=(self.temp / 'artifacts').as_uri(), base_epochs=1)
        for module in (model_registry, training, model_loader):
            self.stack.enter_context(patch.object(module, 'settings', cfg))
        self.stack.enter_context(patch.object(model_loader, '_model_cache', None))
        self.old_tracking = mlflow.get_tracking_uri()
        self.old_registry = mlflow.get_registry_uri()
        self.addCleanup(mlflow.set_tracking_uri, self.old_tracking)
        self.addCleanup(mlflow.set_registry_uri, self.old_registry)
        model_registry.configure_experiment()
        self.X = np.zeros((2, settings.sequence_length, 2), dtype='float32')

    def constant_model(self):
        model = keras.Sequential([
            keras.layers.Input((settings.sequence_length, 2)), keras.layers.Flatten(),
            keras.layers.Dense(1, kernel_initializer='zeros',
                               bias_initializer=keras.initializers.Constant(0.3)),
        ])
        model.compile(optimizer='adam', loss='mse')
        return model

    def register(self, lo, hi, passed=True, compare_current=False):
        scaler = JimJakScaler().fit([{'wait_min': lo, 'seats': 100},
                                     {'wait_min': hi, 'seats': 300}])
        predicted = lo + 0.3 * (hi - lo)
        gate = evaluate_gate([predicted - 1], [predicted if passed else predicted + 10],
                             [predicted + 4], [predicted + 2] if compare_current else None)
        with mlflow.start_run() as run:
            result = training._log_and_register(
                self.constant_model(), scaler, self.X, run.info.run_id, gate)
        return result

    def test_version_scaler_pair_export_rollback_and_failed_gate(self):
        first = self.register(10, 20)
        second = self.register(20, 40, compare_current=True)
        self.assertEqual((first['model_version'], second['model_version']), ('v1', 'v2'))
        loaded = model_loader.reload_model()
        sequence = [{'wait_min': 25, 'next_seats': 200}] * settings.sequence_length
        self.assertAlmostEqual(loaded.predict_one(sequence), 26, places=4)
        self.assertEqual(loaded.version, 'v2')
        # v1을 명시하면 v2와 다른 스케일러가 복원된다.
        with patch.object(model_loader, 'settings', replace(model_loader.settings, model_version='1')):
            pinned = model_loader._load_from_mlflow()
        self.assertAlmostEqual(pinned.predict_one(sequence), 13, places=4)
        client = model_registry.configure_tracking()
        second_run = client.get_run(second['run_id'])
        self.assertEqual(second_run.data.metrics['current_mae'], 3)
        self.assertEqual(second_run.data.metrics['current_rmse'], 3)
        self.assertEqual(client.get_model_version(model_registry.MODEL_NAME, '1').current_stage, 'Archived')
        rejected = self.register(100, 200, passed=False)
        self.assertFalse(rejected['promoted'])
        self.assertEqual(str(model_registry.current_version().version), '2')
        rejected_run = client.get_run(rejected['run_id'])
        self.assertEqual(rejected_run.data.tags['deployment_status'], 'rejected')
        self.assertIn('baseline_rmse', rejected_run.data.metrics)
        self.assertNotIn('current_rmse', rejected_run.data.metrics)
        result = model_registry.rollback('1')
        self.assertEqual(result['previous_version'], '2')
        self.assertEqual(str(model_registry.current_version().version), '1')
        self.assertEqual(client.get_model_version(model_registry.MODEL_NAME, '2').current_stage, 'Archived')
        self.assertEqual(model_loader.reload_model().version, 'v1')
        export_dir = self.temp / 'export-v2'
        model_registry.export_version('2', export_dir)
        with self.assertRaises(FileExistsError):
            model_registry.export_version('2', export_dir)
        with patch.object(model_loader, 'settings', replace(model_loader.settings,
                          model_source='local', local_model_dir=str(export_dir))):
            local = model_loader.reload_model()
            self.assertEqual(local.version, 'v2')
            self.assertAlmostEqual(local.predict_one(sequence), 26, places=4)
            # 스케일러가 손상된 새 모델은 기존 서빙 캐시를 교체하지 않는다.
            (export_dir / 'extra_files/scaler.pkl').write_bytes(b'broken')
            with self.assertRaises(ValueError):
                model_loader.reload_model()
            self.assertIs(model_loader._model_cache, local)

    def test_failed_bundle_validation_never_promotes(self):
        gate = evaluate_gate([10], [11], [15])
        with patch.object(model_registry, 'load_model_uri', side_effect=ValueError('broken')), \
                patch.object(training.mlflow, 'register_model') as register, \
                patch.object(model_registry, 'configure_tracking') as client:
            with self.assertRaisesRegex(ValueError, 'broken'):
                training._register_if_gate_passed('unused', 'run', gate)
        register.assert_not_called()
        client.assert_not_called()

    def test_failed_rollback_does_not_change_production(self):
        self.register(10, 20)
        with patch.object(model_registry, 'load_version', side_effect=ValueError('broken')):
            with self.assertRaisesRegex(ValueError, 'broken'):
                model_registry.rollback('99')
        self.assertEqual(str(model_registry.current_version().version), '1')
        runs = model_registry.configure_tracking().search_runs(
            [mlflow.get_experiment_by_name(settings.experiment_name).experiment_id],
            filter_string="tags.mlflow.runName = 'rollback'")
        self.assertEqual(runs[0].data.tags['rollback_status'], 'failed')

    def test_scratch_run_records_data_settings_and_failure(self):
        # 작은 실제 Keras 학습으로 전체 실행 기록을 확인한다 (성능 검증용 학습 아님).
        rows = load_rows(ROOT / 'data/train_normal.csv')[:50]
        with patch.object(training, 'build_model', side_effect=self.constant_model):
            result = training.train_and_register(rows=rows)
        run = model_registry.configure_tracking().get_run(result['run_id'])
        self.assertEqual(run.data.params['n_rows'], '50')
        self.assertEqual(run.data.params['epochs'], '1')
        self.assertEqual(run.data.params['data_start'], min(r['landingDatetime'] for r in rows))
        self.assertEqual(run.data.params['data_end'], max(r['landingDatetime'] for r in rows))
        self.assertEqual(run.data.params['n_train'], '24')
        self.assertEqual(run.data.params['n_validation'], '6')
        self.assertEqual(run.data.tags['current_comparison'], 'skipped_initial_deployment')
        self.assertEqual(run.info.status, 'FINISHED')
        for key in ('mae', 'rmse', 'baseline_mae', 'baseline_rmse'):
            self.assertIn(key, run.data.metrics)
        with self.assertRaises(ValueError):
            training.train_and_register(rows=[])
        runs = model_registry.configure_tracking().search_runs(
            [run.info.experiment_id], order_by=['attributes.start_time DESC'])
        self.assertEqual(runs[0].info.status, 'FAILED')
        self.assertEqual(runs[0].data.tags['deployment_status'], 'failed')
        self.assertTrue(runs[0].data.tags['failure_reason'])

    def test_current_model_is_evaluated_with_its_own_scaler(self):
        rows = load_rows(ROOT / 'data/train_normal.csv')[:50]
        old_scaler = JimJakScaler().fit([{'wait_min': 0, 'seats': 0},
                                         {'wait_min': 1000, 'seats': 1000}])
        current_model = self.constant_model()
        from types import SimpleNamespace
        captured = []
        original = training._predict_minutes

        def capture(model, scaler, X):
            captured.append((model, scaler, X.copy()))
            return original(model, scaler, X)

        with patch.object(training, '_current_version', return_value=SimpleNamespace(version='7')), \
                patch.object(model_registry, 'load_version', return_value=(current_model, old_scaler, {})), \
                patch.object(training, 'build_model', side_effect=self.constant_model), \
                patch.object(training, '_predict_minutes', side_effect=capture), \
                patch.object(training, '_log_and_register', return_value={}):
            training.train_and_register(rows=rows)
        self.assertIs(captured[0][1], old_scaler)
        np.testing.assert_allclose(captured[0][2], training._prepare(rows, old_scaler)[2])
        self.assertIsNot(captured[1][1], old_scaler)
        self.assertFalse(np.allclose(captured[0][2], captured[1][2]))


if __name__ == '__main__':
    unittest.main()
