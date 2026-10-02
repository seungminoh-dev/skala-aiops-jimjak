import unittest
from types import SimpleNamespace
from unittest.mock import patch

from serving_app import initialize_model as initialization


class InitializationTest(unittest.TestCase):
    def test_existing_model_is_verified_without_retraining(self):
        with patch.object(initialization.model_registry, 'current_version', return_value=SimpleNamespace(version='3')), \
                patch.object(initialization.model_registry, 'load_version') as load, \
                patch('serving_app.train_and_register.train_and_register') as train:
            result = initialization.initialize_model()
        self.assertEqual(result['status'], 'existing')
        self.assertEqual(result['model_version'], 'v3')
        load.assert_called_once_with('3')
        train.assert_not_called()

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
                patch('serving_app.train_and_register.train_and_register', return_value={'promoted': True}):
            self.assertEqual(initialization.initialize_model(force=True)['status'], 'promoted')
