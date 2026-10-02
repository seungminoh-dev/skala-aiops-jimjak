import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from mlflow.exceptions import MlflowException
from mlflow.protos.databricks_pb2 import RESOURCE_DOES_NOT_EXIST

from serving_app.monitoring import drift_detector as dd
from serving_app.monitoring import retrain_trigger
from serving_app.routers import models as models_router
from serving_app.routers import predict


def run(run_id, status, mode="fine-tune", base="1", mae=4.0, current=8.0, start=1_000, **tags):
    params = {"mode": mode, "current_version": base if mode == "fine-tune" else "none", "epochs": "10",
              "n_rows": "220", "n_train": "150", "n_validation": "50", "data_source": "in_memory"}
    metrics = {"mae": mae, "baseline_mae": 5.0}
    if current is not None:
        metrics["current_mae"] = current
    return SimpleNamespace(
        info=SimpleNamespace(run_id=run_id, run_name="fine-tune" if mode == "fine-tune" else "base-train", start_time=start),
        data=SimpleNamespace(params=params, metrics=metrics, tags={"deployment_status": status, **tags}),
    )


def version(number, stage, run_id):
    return SimpleNamespace(version=number, current_stage=stage, run_id=run_id,
                           creation_timestamp=1_000, last_updated_timestamp=2_000)


class FakeClient:
    def __init__(self, runs, versions):
        self.runs, self.versions = runs, versions
        self.transition_model_version_stage = MagicMock()
        self.set_tag = MagicMock()

    def get_experiment_by_name(self, name):
        return SimpleNamespace(experiment_id="1")

    def search_runs(self, experiment_ids, **kwargs):
        return self.runs

    def search_model_versions(self, query):
        return self.versions


def history(production="2"):
    """v1 최초 학습 → v2 재학습 승격 → 불합격 두 번 (마지막만 현재 모델보다 나음)"""
    runs = [
        run("base", "promoted", mode="scratch", mae=2.8, current=None, registered_version="1"),
        run("ft-ok", "promoted", base="1", mae=4.1, current=10.4, registered_version="2"),
        run("ft-worse", "rejected", base="2", mae=6.0, current=5.0, failure_reason="MAE가 5분을 초과했습니다."),
        run("ft-better", "rejected", base="2", mae=3.0, current=11.2,
            failure_reason="직전 20편 평균 대비 MAE가 10% 이상 개선되지 않았습니다."),
    ]
    versions = [version("1", "Archived" if production != "1" else "Production", "base"),
                version("2", "Production" if production == "2" else "Archived", "ft-ok")]
    return FakeClient(runs, versions)


class ListTest(unittest.TestCase):
    def view(self, client):
        with patch.object(models_router.model_registry, "configure_tracking", return_value=client):
            return models_router.list_models()

    def test_versions_and_gates(self):
        v = self.view(history())
        self.assertEqual(v["production"], "v2")
        self.assertEqual([x["version"] for x in v["versions"]], ["v1", "v2"])
        self.assertEqual(v["versions"][1]["base_version"], "v1")
        self.assertEqual([g["run_id"] for g in v["gates"] if g["needs_approval"]], ["ft-better"])
        worse = next(g for g in v["gates"] if g["run_id"] == "ft-worse")
        self.assertEqual(worse["failed_reasons"], ["MAE가 5분을 초과했습니다."])
        self.assertEqual(next(g for g in v["gates"] if g["run_id"] == "ft-ok")["version"], "v2")

    def test_no_approval_after_production_changed(self):
        self.assertFalse(any(g["needs_approval"] for g in self.view(history(production="1"))["gates"]))

    def test_no_approval_once_approved(self):
        client = history()
        client.runs[-1].data.tags["approved_version"] = "3"
        gate = self.view(client)["gates"][-1]
        self.assertFalse(gate["needs_approval"])
        self.assertEqual(gate["approved_version"], "v3")


class ApproveTest(unittest.TestCase):
    def setUp(self):
        self.client = history()
        for target, value in (
            (models_router.model_registry, {"configure_tracking": self.client, "load_model_uri": None}),
            (models_router.model_loader, {"reload_model": None}),
        ):
            for name, rv in value.items():
                p = patch.object(target, name, return_value=rv)
                setattr(self, name, p.start())
                self.addCleanup(p.stop)
        predict.recent_predictions[:] = [{"predicted": 1.0, "actual": 2.0, "event_tag": ""}]
        dd.STATE.consecutive = 1
        retrain_trigger._rejected_file = "x.csv"

    def test_approve_registers_promotes_and_swaps_serving_model(self):
        with patch.object(models_router.mlflow.artifacts, "load_dict", return_value={"model_uri": "models:/m-1"}), \
             patch.object(models_router.mlflow, "register_model", return_value=SimpleNamespace(version="3")) as reg, \
             self.assertLogs("aiops", "INFO") as logs:
            result = models_router.approve(models_router.ApproveRequest(run_id="ft-better"))
        self.assertEqual(result, {"version": "v3", "previous": "v2", "run_id": "ft-better"})
        reg.assert_called_once_with("models:/m-1", models_router.model_registry.MODEL_NAME)
        self.load_model_uri.assert_called_once_with("models:/m-1")
        self.client.transition_model_version_stage.assert_called_once()
        self.assertEqual(self.client.transition_model_version_stage.call_args.kwargs["stage"], "Production")
        self.client.set_tag.assert_any_call("ft-better", "approved_version", "3")
        self.reload_model.assert_called_once()
        self.assertEqual((predict.recent_predictions, dd.STATE.consecutive, retrain_trigger._rejected_file), ([], 0, None))
        self.assertIn("[OK] 운영자 승인", logs.output[0])

    def test_approve_refuses_other_runs(self):
        with self.assertRaises(HTTPException) as worse:
            models_router.approve(models_router.ApproveRequest(run_id="ft-worse"))
        self.assertEqual(worse.exception.status_code, 409)
        with self.assertRaises(HTTPException) as missing:
            models_router.approve(models_router.ApproveRequest(run_id="nope"))
        self.assertEqual(missing.exception.status_code, 404)
        self.reload_model.assert_not_called()

    def test_broken_bundle_is_not_registered(self):
        self.load_model_uri.side_effect = ValueError("스케일러 체크섬 불일치")
        with patch.object(models_router.mlflow.artifacts, "load_dict", return_value={"model_uri": "models:/m-1"}), \
             patch.object(models_router.mlflow, "register_model") as reg, self.assertRaises(HTTPException) as err:
            models_router.approve(models_router.ApproveRequest(run_id="ft-better"))
        self.assertEqual(err.exception.status_code, 422)
        reg.assert_not_called()


class RollbackTest(unittest.TestCase):
    def setUp(self):
        for name, rv in (("current_version", SimpleNamespace(version="2")), ("rollback", None)):
            p = patch.object(models_router.model_registry, name, return_value=rv)
            setattr(self, name, p.start())
            self.addCleanup(p.stop)
        p = patch.object(models_router.model_loader, "reload_model")
        self.reload_model = p.start()
        self.addCleanup(p.stop)

    def call(self, v):
        return models_router.rollback(models_router.RollbackRequest(version=v))

    def test_rollback_switches_and_reloads(self):
        with self.assertLogs("aiops", "INFO") as logs:
            self.assertEqual(self.call("v1"), {"version": "v1", "previous": "v2"})
        self.rollback.assert_called_once_with("1")
        self.reload_model.assert_called_once()
        self.assertIn("v2 → v1", logs.output[0])

    def test_rollback_errors(self):
        for v, code in (("2", 409), ("abc", 422)):
            with self.assertRaises(HTTPException) as err:
                self.call(v)
            self.assertEqual(err.exception.status_code, code)
        self.rollback.side_effect = MlflowException("없음", error_code=RESOURCE_DOES_NOT_EXIST)
        with self.assertRaises(HTTPException) as err:
            self.call("v9")
        self.assertEqual(err.exception.status_code, 404)
        self.reload_model.assert_not_called()


if __name__ == "__main__":
    unittest.main()
