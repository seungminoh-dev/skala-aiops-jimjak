from fastapi import APIRouter

from data.features import SEQ_LEN
from serving_app import model_loader
from serving_app.schemas import PredictRequest, PredictResponse, BatchTestRequest, BatchTestResponse
from serving_app.monitoring.retrain_trigger import check_and_trigger

router = APIRouter()

# Day3: 최근 예측 기록(actual/predicted)을 쌓아두는 슬라이딩 윈도우.
# monitoring/drift_detector.py의 WINDOW_SIZE(21)만큼만 유지한다.
recent_predictions: list[dict] = []

# 운영 기준: 예측값이 50분을 넘으면 인력 추가·벨트 재배정 검토
ALERT_THRESHOLD_MIN = 50


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    model = model_loader.get_model()
    sequence = [p.model_dump() for p in req.sequence]
    predicted = model.predict_one(sequence)
    return PredictResponse(
        predicted_wait_min=round(predicted, 1),
        over_threshold=predicted > ALERT_THRESHOLD_MIN,
        model_version=model.version,
    )


@router.post("/predict/batch-test", response_model=BatchTestResponse)
def batch_test(req: BatchTestRequest):
    """
    Day3 드리프트 감지 시뮬레이션 엔드포인트.

    scripts/simulate_drift.py 나 대시보드가 시나리오 CSV의 연속된 편 기록(41편 이상)을
    이 엔드포인트로 전송합니다. 20편씩 슬라이딩 윈도우로 잘라 다음 편을 예측하고,
    (predicted, actual, event_tag)를 recent_predictions 에 쌓아 드리프트를 판정합니다.
    """
    model = model_loader.get_model()
    flights = [f.model_dump() for f in req.flights]
    predictions: list[float] = []

    for i in range(len(flights) - SEQ_LEN):
        # 칸 k = (k편의 wait_min, k+1편의 seats) - 마지막 칸에 예측할 편의 좌석 수가 들어가고,
        # 예측할 편의 wait_min(정답)은 어느 칸에도 들어가지 않는다
        sequence = [
            {"wait_min": flights[k]["wait_min"], "next_seats": flights[k + 1]["seats"]}
            for k in range(i, i + SEQ_LEN)
        ]
        target = flights[i + SEQ_LEN]
        pred = model.predict_one(sequence)
        predictions.append(pred)
        recent_predictions.append({"predicted": pred, "actual": target["wait_min"], "event_tag": target["event_tag"]})
    recent_predictions[:] = recent_predictions[-21:]  # WINDOW_SIZE 유지

    drift_check = check_and_trigger(recent_predictions)
    if drift_check.get("promoted"):
        # 재학습으로 새 버전이 Production이 되면 서빙 모델도 바꾸고, 이전 모델이 낸 판정 기록은 비운다
        model_loader.reload_model()
        recent_predictions.clear()
    return BatchTestResponse(predictions=predictions, drift_check=drift_check)
