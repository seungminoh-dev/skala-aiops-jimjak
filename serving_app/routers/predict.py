from fastapi import APIRouter

from data.features import SEQ_LEN
from serving_app import model_loader
from serving_app.schemas import PredictRequest, PredictResponse, BatchTestRequest, BatchTestResponse, response_example
from serving_app.monitoring.retrain_trigger import check_and_trigger

router = APIRouter(tags=["예측"])

# 운영 모델이 아직 없을 때 main.py 가 503 으로 답한다 (첫 실행이면 기본 모델 학습 중, serving_app/bootstrap.py)
MODEL_NOT_READY = response_example(
    "운영 모델 미준비 (첫 실행이면 기본 모델 학습 중)",
    {"detail": "운영 모델이 아직 없어 기본 모델(v1)을 학습하고 있어요. 30초쯤 뒤에 다시 시도하세요."},
)

# Day3: 최근 예측 기록(actual/predicted)을 쌓아두는 슬라이딩 윈도우.
# monitoring/drift_detector.py의 WINDOW_SIZE(21)만큼만 유지한다.
recent_predictions: list[dict] = []

# 운영 기준: 예측값이 50분을 넘으면 인력 추가·벨트 재배정 검토
ALERT_THRESHOLD_MIN = 50


@router.post("/predict", response_model=PredictResponse, summary="다음 항공편의 수하물 처리시간 예측",
    description="같은 운영 라인의 직전 20편을 오래된 순서로 전달합니다. 각 칸은 해당 편의 처리시간과 "
                "바로 다음 편의 좌석 수이며, 마지막 칸에는 예측 대상 편의 좌석 수를 넣습니다. "
                "운영 적용 시 예측 시점에 처리가 완료된 기록을 사용해야 합니다. "
                "Lazy 모드에서는 최초 호출 시 모델을 로딩합니다.",
    responses={422: {"description": "시퀀스가 20편이 아니거나 처리시간·좌석 수가 0 이하인 경우"}, 503: MODEL_NOT_READY})
def predict(req: PredictRequest):
    model = model_loader.get_model()
    sequence = [p.model_dump() for p in req.sequence]
    predicted = model.predict_one(sequence)
    return PredictResponse(
        predicted_wait_min=round(predicted, 1),
        over_threshold=predicted > ALERT_THRESHOLD_MIN,
        model_version=model.version,
    )


@router.post("/predict/batch-test", response_model=BatchTestResponse, summary="정답 포함 배치로 드리프트 판정",
    description="최소 41편을 받아 슬라이딩 윈도우로 예측하고 마지막 21건의 오차를 판정합니다. "
                "임계값 초과가 이벤트 없이 연속 2회이면 최신 업로드 CSV로 재학습할 수 있습니다. "
                "배포 기준 통과 시 Production 승격과 서빙 모델 교체를 수행합니다. "
                "호출은 판정 상태를 변경합니다. 서버가 중복 관측을 제거하지 않으므로 "
                "같은 배치를 반복 전송해 새로운 판정 증거로 사용하지 마세요.",
    responses={422: {"description": "41편 미만이거나 처리시간·좌석 수가 0 이하인 경우"}, 503: MODEL_NOT_READY})
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
