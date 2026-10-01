import unittest
from unittest.mock import patch, Mock
from serving_app.deployment_gate import evaluate_gate


class GateTest(unittest.TestCase):
    def test_initial_deployment(self):
        result = evaluate_gate([10], [12], [14])
        self.assertTrue(result['passed'])
        self.assertEqual(result['current_comparison'], 'skipped_initial_deployment')

    def test_mae_limit(self):
        result = evaluate_gate([0], [6], [10], [7])
        self.assertFalse(result['passed'])
        self.assertEqual(len(result['failed_reasons']), 1)

    def test_baseline_improvement_required(self):
        self.assertFalse(evaluate_gate([0], [4], [4], [5])['passed'])

    def test_current_model_regression(self):
        self.assertFalse(evaluate_gate([0], [3], [5], [2])['passed'])

    def test_inclusive_boundaries(self):
        self.assertTrue(evaluate_gate([0], [5], [10], [5])['passed'])
        self.assertTrue(evaluate_gate([0], [4.5], [5], [4.5])['passed'])

    def test_invalid_predictions(self):
        for candidate in ([], [1, 2], [float('nan')], [float('inf')]):
            with self.subTest(candidate=candidate), self.assertRaises(ValueError):
                evaluate_gate([0], candidate, [5])

    def test_failed_gate_never_registers_or_promotes(self):
        from serving_app import train_and_register as training
        gate = evaluate_gate([0], [6], [5])
        with patch.object(training.mlflow, 'register_model') as register, \
                patch.object(training, 'MlflowClient') as client:
            result = training._register_if_gate_passed('unused', 'test', gate)
            self.assertFalse(result['promoted'])
            register.assert_not_called()
            client.assert_not_called()

    def test_passed_gate_promotes_and_archives_previous(self):
        from serving_app import train_and_register as training
        gate = evaluate_gate([0], [2], [5], [3])
        with patch.object(training.mlflow, 'register_model', return_value=Mock(version='2')), \
                patch.object(training, 'MlflowClient') as client:
            result = training._register_if_gate_passed('models:/test', 'test', gate)
            self.assertTrue(result['promoted'])
            client.return_value.transition_model_version_stage.assert_called_once_with(
                name=training.MODEL_NAME, version='2', stage='Production',
                archive_existing_versions=True)

    def test_registry_failure_is_not_initial_deployment(self):
        from serving_app import train_and_register as training
        with patch.object(training, 'MlflowClient') as client:
            client.return_value.search_model_versions.side_effect = RuntimeError('unavailable')
            with self.assertRaises(RuntimeError):
                training._current_version()


if __name__ == '__main__':
    unittest.main()
