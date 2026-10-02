"""기존 DataFrame 호출용 호환 진입점. 실제 전처리는 data.features에서 관리한다."""
import numpy as np
from data import features

SEQ_LEN = features.SEQ_LEN


class JimJakScaler(features.JimJakScaler):
    def fit(self, rows):
        if hasattr(rows, "to_dict"):
            rows = rows.to_dict("records")
        return super().fit(rows)

    def transform_df(self, df):
        return np.array([self.transform_point(r["wait_min"], r["seats"])
                         for r in df.to_dict("records")])


def build_sequences(df, scaler, seq_len=SEQ_LEN):
    rows = features.normalize_rows(df.to_dict("records"))
    X, y = features.build_sequences(rows, scaler, seq_len)
    return np.asarray(X).reshape((-1, seq_len, 2)), np.asarray(y)


def train_test_split_chrono(X, y, test_ratio=0.2):
    return features.train_test_split(X, y, test_ratio)
