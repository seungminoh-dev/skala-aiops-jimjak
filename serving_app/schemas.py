"""
Day1: FastAPI 요청/응답 Pydantic 스키마.

LSTM은 한 시점의 값이 아니라 최근 SEQ_LEN(20)거래일의 흐름을 입력받아야 하므로,
/predict는 단일 행이 아니라 "20거래일치 시퀀스"를 요청 본문으로 받습니다.
이 검증 로직은 Day2 "데이터/모델 검증" 실습에서 다루는 것과 같은 종류입니다 -
서빙 시점 입력 검증이 학습 시점 피처(data/features.py)와 어긋나지 않도록
길이(SEQ_LEN)와 값 범위(gt=0, ge=0)를 스키마 단에서 강제합니다.
"""
from pydantic import BaseModel, Field

from data.features import SEQ_LEN
from serving_app.monitoring.drift_detector import WINDOW_SIZE


class FlightPoint(BaseModel):
    wait_min: float = Field(..., gt=0, description="그 편의 처리 시간 (착륙 -> 마지막 짐 투입, 분)")
    next_seats: int = Field(..., gt=0, description="바로 다음 편의 좌석 수 (마지막 칸은 예측할 편의 좌석 수)")


class PredictRequest(BaseModel):
    sequence: list[FlightPoint] = Field(
        ...,
        min_length=SEQ_LEN,
        max_length=SEQ_LEN,
        description=f"같은 라인의 직전 {SEQ_LEN}편, 오래된 편 -> 최근 편 순서",
    )


class PredictResponse(BaseModel):
    predicted_wait_min: float
    over_threshold: bool
    model_version: str


class BatchFlight(BaseModel):
    wait_min: float = Field(..., gt=0)
    seats: int = Field(..., gt=0)
    event_tag: str = ""  # 평상시 빈칸, 컨베이어 고장 bhs_failure, 개장 초기 terminal_open


class BatchTestRequest(BaseModel):
    # Day3 드리프트 시뮬레이션에서 사용 (scripts/simulate_drift.py 참고)
    # 시나리오 CSV의 연속된 편 기록을 SEQ_LEN + WINDOW_SIZE(41)편 이상 보내면, 서버가 내부적으로
    # 슬라이딩 윈도우로 잘라 여러 편을 연속 예측한다.
    flights: list[BatchFlight] = Field(..., min_length=SEQ_LEN + WINDOW_SIZE)


class BatchTestResponse(BaseModel):
    predictions: list[float]
    drift_check: dict
