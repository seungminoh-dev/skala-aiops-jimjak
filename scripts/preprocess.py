"""
인천공항 수하물 처리시간 예측(ZimJak)을 위한 전처리 모듈.

LSTM 모델 학습(train) 및 실시간 서빙(serving) 시 모두 사용됩니다.
기획서 규칙에 따라 직전 20편의 항공편 데이터를 시퀀스로 묶으며,
각 시퀀스의 입력 형태는 (해당 편의 wait_min, 다음 편의 seats)로 구성됩니다.
"""
import pandas as pd
import numpy as np
import pickle
import os

SEQ_LEN = 20  # LSTM 입력 윈도우 길이 (직전 20편)

class ZimJakScaler:
    """
    seats와 wait_min을 [0, 1] 범위로 정규화하는 Min-Max 스케일러.
    학습 시 fit()으로 기준을 잡고 .pkl로 저장한 뒤, 서빙 시 동일한 객체를 로드하여 재사용합니다.
    """
    def __init__(self):
        self.seats_min = self.seats_max = None
        self.wait_min = self.wait_max = None

    def fit(self, df: pd.DataFrame) -> "ZimJakScaler":
        self.seats_min = df['seats'].min()
        self.seats_max = df['seats'].max()
        self.wait_min = df['wait_min'].min()
        self.wait_max = df['wait_min'].max()
        return self

    def _scale(self, value, min_val, max_val):
        if max_val == min_val:
            return 0.0
        return (value - min_val) / (max_val - min_val)

    def _unscale(self, value, min_val, max_val):
        return value * (max_val - min_val) + min_val

    def transform_df(self, df: pd.DataFrame) -> np.ndarray:
        """
        DataFrame을 받아 정규화된 2D Numpy 배열로 반환합니다.
        기획서 입력 순서에 맞춰 (wait_min, seats) 순으로 배열을 구성합니다.
        """
        scaled_wait = df['wait_min'].apply(lambda x: self._scale(x, self.wait_min, self.wait_max))
        scaled_seats = df['seats'].apply(lambda x: self._scale(x, self.seats_min, self.seats_max))
        return np.column_stack((scaled_wait, scaled_seats))

    def inverse_wait_min(self, scaled_wait: float) -> float:
        """모델이 예측한 정규화된 값을 실제 분(min) 단위로 복원"""
        return self._unscale(scaled_wait, self.wait_min, self.wait_max)

    def save(self, path: str = "scaler.pkl"):
        # 저장할 디렉터리가 없으면 생성
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self.__dict__, f)

    @classmethod
    def load(cls, path: str = "scaler.pkl") -> "ZimJakScaler":
        scaler = cls()
        with open(path, "rb") as f:
            scaler.__dict__.update(pickle.load(f))
        return scaler


def build_sequences(df: pd.DataFrame, scaler: ZimJakScaler, seq_len: int = SEQ_LEN):
    """
    기획서 규칙에 맞춘 정규화된 입력 시퀀스(X)와 정규화 전 타깃(y)을 생성합니다.
    각 칸은 (현재 편 wait_min, 다음 편 seats)이며, 
    마지막 칸에는 예측 대상 편의 seats가 포함됩니다.
    
    반환: X (n_samples, seq_len, 2), y (n_samples,)
    """
    scaled_data = scaler.transform_df(df)
    wait_min_scaled = scaled_data[:, 0]
    seats_scaled = scaled_data[:, 1]
    
    # 정답(Target)은 오차 계산(MAE)을 위해 정규화하지 않은 실제 분(min) 값 사용
    actual_waits = df['wait_min'].values
    
    X, y = [], []
    for i in range(len(df) - seq_len):
        seq = []
        for j in range(i, i + seq_len):
            current_wait = wait_min_scaled[j]
            next_seats = seats_scaled[j + 1]  # 다음 편의 좌석 수를 가져옴
            seq.append([current_wait, next_seats])
        
        X.append(seq)
        y.append(actual_waits[i + seq_len])  # 시퀀스 직후 예측 대상 편의 실제 대기시간
        
    return np.array(X), np.array(y)


def train_test_split_chrono(X: np.ndarray, y: np.ndarray, test_ratio: float = 0.2):
    """시계열 특성을 유지하기 위해 데이터를 섞지 않고 앞뒤로만 분리합니다."""
    split_idx = int(len(X) * (1 - test_ratio))
    return X[:split_idx], y[:split_idx], X[split_idx:], y[split_idx:]