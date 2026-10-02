import unittest

from fastapi import HTTPException

from serving_app.routers import scenarios


class ScenariosTest(unittest.TestCase):
    def test_list_has_every_scenario_with_batch_count(self):
        items = {s["id"]: s for s in scenarios.list_scenarios()}
        self.assertEqual(set(items), set(scenarios.SCENARIO_FILES))
        normal = items["normal"]
        self.assertEqual(normal["file"], "normal_2w.csv")
        self.assertEqual(normal["batches"], (normal["rows"] - scenarios.BATCH_N) // 21 + 1)
        self.assertEqual(normal["event_rows"], 0)
        self.assertGreater(items["bhs_failure"]["event_rows"], 0)

    def test_wait_summary_matches_the_file(self):
        import csv

        normal = next(s for s in scenarios.list_scenarios() if s["id"] == "normal")
        with open(scenarios._path("normal"), encoding="utf-8-sig", newline="") as f:
            waits = [float(r["wait_min"]) for r in csv.DictReader(f)]
        self.assertEqual(normal["wait_mean"], round(sum(waits) / len(waits), 1))
        self.assertEqual((normal["wait_min"], normal["wait_max"]), (min(waits), max(waits)))
        self.assertEqual(normal["over_50"], sum(w > 50 for w in waits))

    def test_file_is_the_raw_csv(self):
        response = scenarios.scenario_file("staff_shortage")
        self.assertEqual(response.media_type, "text/csv")
        self.assertTrue(str(response.path).endswith("data/staff_shortage_2w.csv"))

    def test_unknown_scenario_is_404(self):
        with self.assertRaises(HTTPException) as err:
            scenarios.scenario_file("../secret")
        self.assertEqual(err.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
