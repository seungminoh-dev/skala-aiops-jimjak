import csv
import pickle
from pathlib import Path

SEQ_LEN = 20
REQUIRED_COLUMNS = {
    "flightId", "terminalId", "bagCarouselId", "line_id", "aircraftSubtype",
    "seats", "estimatedDatetime", "landingDatetime", "bagLastTime",
    "wait_min", "event_tag",
}


def normalize_rows(rows):
    """기존 LandingDatetime 표기를 수용하고, 라인별 시간순으로 정렬한다."""
    result = []
    for raw in rows:
        row = dict(raw)
        if "landingDatetime" not in row and "LandingDatetime" in row:
            row["landingDatetime"] = row.pop("LandingDatetime")
        missing = REQUIRED_COLUMNS - row.keys()
        if missing:
            raise ValueError(f"CSV 필수 컬럼 누락: {sorted(missing)}")
        row["wait_min"] = float(row["wait_min"])
        row["seats"] = int(row["seats"])
        row["event_tag"] = row["event_tag"] or ""
        result.append(row)
    return sorted(result, key=lambda r: (r["line_id"], r["landingDatetime"]))


def load_rows(csv_path="data/train_normal.csv"):
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        return normalize_rows(csv.DictReader(f))


class JimJakScaler:
    """학습 구간에서만 fit하며, 재학습·서빙에서는 저장된 기준을 재사용한다."""
    def __init__(self):
        self.wait_min = self.wait_max = None
        self.seats_min = self.seats_max = None

    def fit(self, rows):
        if not rows:
            raise ValueError("스케일러 학습 데이터가 없습니다.")
        self.wait_min = min(r["wait_min"] for r in rows)
        self.wait_max = max(r["wait_min"] for r in rows)
        self.seats_min = min(r["seats"] for r in rows)
        self.seats_max = max(r["seats"] for r in rows)
        return self

    @staticmethod
    def _scale(value, lo, hi):
        return 0.0 if hi == lo else (value - lo) / (hi - lo)

    def transform_point(self, wait_min, next_seats):
        return [self.scale_wait_min(wait_min),
                self._scale(next_seats, self.seats_min, self.seats_max)]

    def scale_wait_min(self, value):
        return self._scale(value, self.wait_min, self.wait_max)

    def inverse_wait_min(self, value):
        return value * (self.wait_max - self.wait_min) + self.wait_min

    def save(self, path="serving_app/models/scaler.pkl"):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self.__dict__, f)

    @classmethod
    def load(cls, path="serving_app/models/scaler.pkl"):
        with open(path, "rb") as f:
            state = pickle.load(f)
        required = {"wait_min", "wait_max", "seats_min", "seats_max"}
        if not required.issubset(state):
            raise ValueError("수하물용 스케일러가 아닙니다. 최초 학습을 다시 실행하세요.")
        scaler = cls()
        scaler.__dict__.update(state)
        return scaler


def sequence_samples(rows, seq_len=SEQ_LEN):
    """각 샘플은 같은 라인의 과거 기록과 타깃. 결과는 타깃 시각순이다."""
    from itertools import groupby
    samples = []
    ordered = sorted(rows, key=lambda r: (r["line_id"], r["landingDatetime"]))
    for _, group in groupby(ordered, key=lambda r: r["line_id"]):
        flights = list(group)
        for i in range(seq_len, len(flights)):
            samples.append((flights[i-seq_len:i], flights[i]))
    return sorted(samples, key=lambda s: (s[1]["landingDatetime"], s[1]["line_id"]))


def build_sequences(rows, scaler, seq_len=SEQ_LEN):
    X, y = [], []
    for history, target in sequence_samples(rows, seq_len):
        following = history[1:] + [target]
        X.append([scaler.transform_point(current["wait_min"], nxt["seats"])
                  for current, nxt in zip(history, following)])
        y.append(target["wait_min"])
    return X, y


def train_test_split(X, y, test_ratio=0.2):
    if not 0 < test_ratio < 1 or len(X) != len(y):
        raise ValueError("검증 비율 또는 X/y 길이가 올바르지 않습니다.")
    split = int(len(X) * (1 - test_ratio))
    if split < 1 or split >= len(X):
        raise ValueError("학습·검증 시퀀스가 각각 최소 1개 필요합니다.")
    return X[:split], y[:split], X[split:], y[split:]


def fit_training_scaler(rows, test_ratio=0.2):
    """검증 타깃과 이후 기록이 스케일러 fit에 들어가지 않도록 한다."""
    samples = sequence_samples(rows)
    train, _, _, _ = train_test_split(samples, samples, test_ratio)
    cutoff = samples[len(train)][1]["landingDatetime"]
    return JimJakScaler().fit([r for r in rows if r["landingDatetime"] < cutoff])
