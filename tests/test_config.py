import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from serving_app.config import ROOT, load_settings


class ConfigTest(unittest.TestCase):
    def test_environment_overrides_file_and_paths_are_root_relative(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'settings.json'
            path.write_text(json.dumps({'base_epochs': 3, 'sequence_length': 12}))
            with patch.dict(os.environ, {'JIMJAK_CONFIG': str(path), 'BASE_EPOCHS': '2',
                                         'MLFLOW_TRACKING_URI': 'sqlite:///test.db'}, clear=True):
                cfg = load_settings()
            self.assertEqual(cfg.base_epochs, 2)
            self.assertEqual(cfg.sequence_length, 12)
            self.assertEqual(cfg.tracking_uri, f'sqlite:///{ROOT}/test.db')
            self.assertEqual(cfg.local_model_dir, str(ROOT / 'serving_app/models/v1'))

    def test_invalid_settings_fail_early(self):
        for env in ({'MODEL_SOURCE': 'typo'}, {'LOADING_MODE': 'typo'},
                    {'BASE_EPOCHS': '0'}, {'LEARNING_RATE': 'nan'},
                    {'MODEL_VERSION': 'v1'}, {'VALIDATION_RATIO': '1'},
                    {'RETRAIN_MIN_TRAIN_SAMPLES': '0'},
                    {'RETRAIN_VALIDATION_DAYS': '14'}):
            with self.subTest(env=env), patch.dict(os.environ, env, clear=True):
                with self.assertRaises(ValueError):
                    load_settings()

    def test_unknown_config_key_is_not_silently_ignored(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'config.json'
            path.write_text('{"epoch": 10}')
            with patch.dict(os.environ, {'JIMJAK_CONFIG': str(path)}, clear=True):
                with self.assertRaises(ValueError):
                    load_settings()
