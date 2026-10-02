import unittest
from datetime import datetime, timedelta

from data.features import encode_samples, JimJakScaler
from data.retraining import InsufficientRetrainingData, split_retraining_rows


def flight_rows(days=16, flights_per_day=24, line='T1-03'):
    start = datetime(2026, 10, 1)
    rows = []
    for i in range(days * flights_per_day):
        time = start + timedelta(days=i // flights_per_day, hours=(i % flights_per_day) * 24 / flights_per_day)
        rows.append({
            'flightId': f'F{i}', 'terminalId': 'P01', 'bagCarouselId': '3',
            'line_id': line, 'aircraftSubtype': '738', 'seats': 189 + i % 2,
            'estimatedDatetime': time.strftime('%Y%m%d%H%M'),
            'landingDatetime': time.strftime('%Y%m%d%H%M'),
            'bagLastTime': (time + timedelta(minutes=30)).strftime('%Y%m%d%H%M'),
            'wait_min': 30 + i % 5, 'event_tag': '',
        })
    return rows


class RetrainingDataTest(unittest.TestCase):
    def test_calendar_boundaries_and_leading_context(self):
        split = split_retraining_rows(flight_rows())
        self.assertEqual(split.metadata['window_start'], '202610030000')
        self.assertEqual(split.metadata['window_end_exclusive'], '202610170000')
        self.assertEqual(split.metadata['validation_cutoff'], '202610140000')
        self.assertEqual(len(split.train_samples), 11 * 24)
        self.assertEqual(len(split.validation_samples), 3 * 24)
        self.assertEqual(split.metadata['n_context_rows'], 20)
        self.assertEqual(split.train_samples[0][1]['landingDatetime'], '202610030000')
        self.assertEqual(split.validation_samples[0][1]['landingDatetime'], '202610140000')
        self.assertTrue(all(t['landingDatetime'] < '202610140000' for _, t in split.train_samples))
        self.assertTrue(all(t['landingDatetime'] >= '202610140000' for _, t in split.validation_samples))

    def test_event_target_and_all_20_following_windows_excluded_without_stitching(self):
        rows = flight_rows()
        rows[100]['event_tag'] = 'bhs_failure'
        split = split_retraining_rows(rows)
        all_samples = split.train_samples + split.validation_samples
        target_ids = {target['flightId'] for _, target in all_samples}
        for i in range(100, 121):
            self.assertNotIn(f'F{i}', target_ids)
        self.assertIn('F99', target_ids)
        self.assertIn('F121', target_ids)
        self.assertEqual(split.metadata['n_event_excluded_samples'], 21)
        for history, target in all_samples:
            original_index = int(target['flightId'][1:])
            self.assertEqual([r['flightId'] for r in history],
                             [r['flightId'] for r in rows[original_index-20:original_index]])

    def test_event_at_validation_boundary_and_unknown_tag(self):
        rows = flight_rows()
        rows[13 * 24]['event_tag'] = ' custom_event '
        split = split_retraining_rows(rows)
        self.assertEqual(len(split.validation_samples), 72 - 21)
        self.assertEqual(split.validation_samples[0][1]['flightId'], f'F{13*24+21}')

    def test_event_before_window_still_invalidates_leading_history(self):
        rows = flight_rows()
        rows[47]['event_tag'] = 'terminal_open'
        split = split_retraining_rows(rows)
        self.assertEqual(split.train_samples[0][1]['flightId'], 'F68')
        self.assertEqual(split.metadata['n_event_excluded_samples'], 20)

    def test_line_isolation_and_order_independence(self):
        rows = flight_rows() + flight_rows(line='T2-03')
        split = split_retraining_rows(list(reversed(rows)))
        self.assertEqual(len(split.validation_samples), 144)
        for history, target in split.train_samples + split.validation_samples:
            self.assertTrue(all(row['line_id'] == target['line_id'] for row in history))

    def test_real_days_do_not_depend_on_number_of_flights(self):
        split = split_retraining_rows(flight_rows(flights_per_day=12))
        self.assertEqual(len(split.validation_samples), 36)
        self.assertEqual(split.metadata['validation_cutoff'], '202610140000')

    def test_validation_label_is_not_in_encoded_inputs(self):
        split = split_retraining_rows(flight_rows())
        scaler = JimJakScaler().fit(flight_rows())
        history, target = split.validation_samples[0]
        original_X, original_y = encode_samples([(history, target)], scaler)
        changed_X, changed_y = encode_samples([(history, dict(target, wait_min=9999))], scaler)
        self.assertEqual(original_X, changed_X)
        self.assertNotEqual(original_y, changed_y)
        self.assertEqual(original_X[0][-1][1], scaler.transform_point(history[-1]['wait_min'], target['seats'])[1])

    def test_minimum_samples_defer_and_report_counts(self):
        for rows, expected_validation in (([], 0), (flight_rows(days=1), 4)):
            with self.subTest(rows=len(rows)):
                with self.assertRaises(InsufficientRetrainingData) as error:
                    split_retraining_rows(rows)
                self.assertEqual(error.exception.metadata['n_validation'], expected_validation)
        rows = flight_rows()
        for row in rows[-72:]:
            row['event_tag'] = 'bhs_failure'
        with self.assertRaises(InsufficientRetrainingData) as error:
            split_retraining_rows(rows)
        self.assertEqual(error.exception.metadata['n_validation'], 0)

    def test_invalid_timestamp_fails_instead_of_using_row_ratio(self):
        rows = flight_rows()
        rows[0]['landingDatetime'] = 'not-a-date'
        with self.assertRaises(ValueError):
            split_retraining_rows(rows)
