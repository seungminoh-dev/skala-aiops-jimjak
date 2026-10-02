"""수하물 예측 요청·응답 계약과 Swagger에서 실행할 수 있는 예시."""
from pydantic import BaseModel, ConfigDict, Field

from data.features import SEQ_LEN
from serving_app.monitoring.drift_detector import WINDOW_SIZE

# 설명용 데이터이며 성능 측정 결과가 아니다. 생략 기호 없이 바로 호출할 수 있다.
PREDICT_EXAMPLE = {"sequence": [
    {"wait_min": 32 + i % 5, "next_seats": 189 if i % 2 == 0 else 280}
    for i in range(SEQ_LEN)
]}
BATCH_EXAMPLE = {"flights": [
    {"wait_min": 32 + i % 5, "seats": 189 if i % 2 == 0 else 280, "event_tag": ""}
    for i in range(SEQ_LEN + WINDOW_SIZE)
]}


def response_example(description: str, example):
    """실제 반환 구조를 문서화하며 런타임 응답은 변경하지 않는다."""
    return {"description": description, "content": {"application/json": {"example": example}}}


class FlightPoint(BaseModel):
    wait_min: float = Field(..., gt=0, description="해당 항공편의 처리시간: 착륙부터 마지막 수하물 도착까지(분)")
    next_seats: int = Field(..., gt=0, description="바로 다음 편의 좌석 수 (마지막 칸은 예측할 편의 좌석 수)")


class PredictRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [PREDICT_EXAMPLE]})
    sequence: list[FlightPoint] = Field(
        ...,
        min_length=SEQ_LEN,
        max_length=SEQ_LEN,
        description=f"같은 라인의 직전 {SEQ_LEN}편, 오래된 편 -> 최근 편 순서",
    )


class PredictResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [
        {"predicted_wait_min": 37.1, "over_threshold": False, "model_version": "v1"}
    ]})
    predicted_wait_min: float = Field(description="예측 처리시간(분), 소수점 첫째 자리까지 반환")
    over_threshold: bool = Field(description="반올림 전 예측 처리시간이 운영 기준 50분을 초과하면 true")
    model_version: str = Field(description="실제로 예측에 사용한 모델 버전(예: v1)")


class BatchFlight(BaseModel):
    wait_min: float = Field(..., gt=0, description="정답 처리시간(분). 오차 판정을 위한 완료 기록")
    seats: int = Field(..., gt=0, description="해당 항공편의 좌석 수")
    event_tag: str = Field("", description="정상은 빈 문자열. 이벤트 예: bhs_failure, terminal_open")


class BatchTestRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [BATCH_EXAMPLE]})
    # Day3 드리프트 시뮬레이션에서 사용 (scripts/simulate_drift.py 참고)
    # 시나리오 CSV의 연속된 편 기록을 SEQ_LEN + WINDOW_SIZE(41)편 이상 보내면, 서버가 내부적으로
    # 슬라이딩 윈도우로 잘라 여러 편을 연속 예측한다.
    flights: list[BatchFlight] = Field(..., min_length=SEQ_LEN + WINDOW_SIZE,
        description="같은 운영 라인의 연속된 완료 기록, 오래된 항공편부터 정렬. 최소 41편(입력 20편 + 평가 21편)")


class BatchTestResponse(BaseModel):
    predictions: list[float] = Field(description="각 검증 대상의 예측 처리시간(분). 개수는 입력 편수 − 시퀀스 길이")
    drift_check: dict = Field(description="드리프트 판정과 재학습 결과. status: pending / ok / warn / alert_only / retrain_triggered. promoted가 실제 승격 여부")
