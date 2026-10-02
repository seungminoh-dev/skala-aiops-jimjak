"""최근 데이터의 타깃 날짜 분할과 이벤트가 포함된 시퀀스 제외"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from data.features import SEQ_LEN, normalize_rows, sequence_samples


@dataclass
class RetrainingSplit:
    train_samples: list
    validation_samples: list
    metadata: dict


class InsufficientRetrainingData(ValueError):
    def __init__(self, message, metadata):
        super().__init__(message)
        self.metadata = metadata


def split_retraining_rows(rows, window_days=14, validation_days=3,
                          min_train_samples=32, min_validation_samples=21,
                          seq_len=SEQ_LEN):
    """CSV의 마지막 관측일 기준 최근 14개 날짜 중 마지막 3개 날짜를 검증한다.

    원본의 같은 라인 연속 기록으로 시퀀스를 먼저 만든다. 그 후 입력/타깃에
    이벤트가 있는 샘플을 제외하므로 이벤트 양쪽의 기록을 이어 붙이지 않는다.
    기간 시작 전 기록은 최초 타깃의 선행 입력으로만 사용할 수 있다.
    """
    if not 0 < validation_days < window_days:
        raise ValueError("검증 일수는 0보다 크고 재학습 기간보다 작아야 합니다.")
    if min_train_samples < 1 or min_validation_samples < 1 or seq_len < 1:
        raise ValueError("최소 샘플 수와 시퀀스 길이는 1 이상이어야 합니다.")
    rows = normalize_rows(rows)
    if not rows:
        raise InsufficientRetrainingData("재학습 데이터가 없습니다.", {
            "n_input_rows": 0, "n_rows": 0, "n_train": 0, "n_validation": 0})
    times = {id(row): datetime.strptime(row["landingDatetime"], "%Y%m%d%H%M") for row in rows}
    last_day = max(times.values()).replace(hour=0, minute=0, second=0, microsecond=0)
    end = last_day + timedelta(days=1)
    start = end - timedelta(days=window_days)
    validation_start = end - timedelta(days=validation_days)
    recent_rows = [row for row in rows if start <= times[id(row)] < end]
    train, validation = [], []
    n_candidates = n_excluded = 0
    context_ids = set()
    for history, target in sequence_samples(rows, seq_len):
        target_time = times[id(target)]
        if not start <= target_time < end:
            continue
        n_candidates += 1
        if any(str(row["event_tag"]).strip() for row in history + [target]):
            n_excluded += 1
            continue
        context_ids.update(id(row) for row in history if times[id(row)] < start)
        (train if target_time < validation_start else validation).append((history, target))

    def target_range(samples, operation):
        return operation((target["landingDatetime"] for _, target in samples), default="none")

    metadata = {
        "split_policy": "latest_observation_calendar_days",
        "event_policy": "exclude_if_history_or_target_tagged",
        "window_days": window_days, "validation_days": validation_days,
        "window_start": start.strftime("%Y%m%d%H%M"),
        "window_end_exclusive": end.strftime("%Y%m%d%H%M"),
        "validation_cutoff": validation_start.strftime("%Y%m%d%H%M"),
        "n_input_rows": len(rows), "n_rows": len(recent_rows),
        "n_observed_dates": len({times[id(row)].date() for row in recent_rows}),
        "n_context_rows": len(context_ids), "n_train": len(train), "n_validation": len(validation),
        "n_candidate_samples": n_candidates, "n_event_excluded_samples": n_excluded,
        "n_event_rows": sum(bool(str(row["event_tag"]).strip()) for row in recent_rows),
        "min_train_samples": min_train_samples, "min_validation_samples": min_validation_samples,
        "data_start": min(row["landingDatetime"] for row in recent_rows),
        "data_end": max(row["landingDatetime"] for row in recent_rows),
        "train_start": target_range(train, min), "train_end": target_range(train, max),
        "validation_start": target_range(validation, min), "validation_end": target_range(validation, max),
    }
    if len(train) < min_train_samples or len(validation) < min_validation_samples:
        raise InsufficientRetrainingData(
            f"유효 샘플 부족: 학습 {len(train)}/{min_train_samples}, 검증 {len(validation)}/{min_validation_samples}",
            metadata)
    return RetrainingSplit(train, validation, metadata)
