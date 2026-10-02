"""
드리프트 시나리오 주입 — 기획서 ⑥ 시연 순서 4~6.

시나리오 CSV(data/*_2w.csv)를 서버에 보내 드리프트 판정이 기대대로 나오는지 본다.
    1) 시나리오 CSV 를 /data/upload 로 올린다 — 재학습이 쓸 "새 기간 데이터"가 된다
    2) 41편(직전 20편 + 판정 창 21편)씩, 21편 간격으로 잘라 /predict/batch-test 에 보낸다
       → 배치 하나에 예측 21회, 판정 1회 (k번째 배치는 k*21+20번째 편부터 21편을 예측)
    3) 배치마다 drift_check(status, MAE, 임계값, 연속 횟수, 사건 태그)를 출력한다

사전 준비: 서버가 떠 있어야 한다 (예: MODEL_SOURCE=mlflow uvicorn serving_app.main:app --port 8077)
실행:
    python scripts/simulate_drift.py                    # 시연 순서: 정상 1회 → 컨베이어 고장 2회 → 인력 부족 2회
    python scripts/simulate_drift.py staff_shortage 2   # 시나리오 하나, 배치 수
    python scripts/simulate_drift.py --list             # 시나리오 목록
환경 변수: API_URL (기본 http://localhost:8077)
"""
import csv
import os
import sys

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.features import SEQ_LEN  # noqa: E402
from serving_app.monitoring.drift_detector import WINDOW_SIZE  # noqa: E402

API_URL = os.getenv("API_URL", "http://localhost:8077")
BATCH_N = SEQ_LEN + WINDOW_SIZE  # 41편 → 예측 21회 → 판정 1회

# 시나리오 → (CSV, 기대 판정) — 기획서 "시나리오와 파일 구성"
SCENARIOS = {
    "normal": ("data/normal_2w.csv", "ok"),
    "bhs_failure": ("data/bhs_failure_2w.csv", "ok → alert_only (재학습 없음)"),
    "staff_shortage": ("data/staff_shortage_2w.csv", "warn → retrain_triggered"),
    "expansion": ("data/expansion_2w.csv", "warn → retrain_triggered"),
    "terminal_open": ("data/terminal_open_4w.csv", "alert_only (태그 구간) → 이후 재학습"),
    "process_change": ("data/process_change_2w.csv", "warn → retrain_triggered (게이트 불합격 가능)"),
}

# 시연 순서 (기획서 ⑥ 4~6)
DEMO = [("normal", 1), ("bhs_failure", 2), ("staff_shortage", 2)]


def load_flights(csv_path: str) -> list[dict]:
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    key = "landingDatetime" if "landingDatetime" in rows[0] else "LandingDatetime"
    rows.sort(key=lambda r: r[key])
    return [{"wait_min": float(r["wait_min"]), "seats": int(r["seats"]), "event_tag": r.get("event_tag") or ""} for r in rows]


def upload(csv_path: str) -> None:
    with open(csv_path, "rb") as f:
        resp = requests.post(f"{API_URL}/data/upload", files={"file": (os.path.basename(csv_path), f, "text/csv")}, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    print(f"  업로드: {body['filename']} ({body['rows']}행)")


def send_batch(flights: list[dict]) -> dict:
    resp = requests.post(f"{API_URL}/predict/batch-test", json={"flights": flights}, timeout=600)
    resp.raise_for_status()
    return resp.json()["drift_check"]


def describe(check: dict) -> str:
    if check.get("status") == "pending":
        return f"pending ({check.get('count')}/{check.get('window_size')})"
    parts = [f"{check['status']:<18}", f"MAE {check['mae']:>5.1f}분", f"임계값 {check['threshold']}분", f"연속 {check['consecutive']}/{check['limit']}"]
    if check.get("event_tags"):
        plain = check.get("mae_without_events")
        parts.append(f"사건 {','.join(check['event_tags'])} {check['event_count']}편" + (f" (제외 MAE {plain}분)" if plain is not None else ""))
    if check.get("promoted"):
        parts.append(f"→ 새 모델 {check.get('version', '')} 승격")
    elif check.get("retrain"):
        parts.append(f"→ 재학습 결과: {check['retrain']}")
    return " | ".join(parts)


def run(name: str, batches: int, do_upload: bool = True) -> list[dict]:
    csv_path, expected = SCENARIOS[name]
    print(f"\n[{name}] {csv_path} — 기대: {expected}")
    if do_upload:
        upload(csv_path)
    flights = load_flights(csv_path)
    results = []
    for k in range(batches):
        chunk = flights[k * WINDOW_SIZE : k * WINDOW_SIZE + BATCH_N]
        if len(chunk) < BATCH_N:
            print(f"  배치 {k + 1}: 남은 편이 {len(chunk)}편이라 멈춤")
            break
        check = send_batch(chunk)
        results.append(check)
        print(f"  배치 {k + 1}: {describe(check)}")
    return results


def main(argv: list[str]) -> None:
    if "--list" in argv:
        for name, (path, expected) in SCENARIOS.items():
            print(f"{name:<16} {path:<30} {expected}")
        return
    do_upload = "--no-upload" not in argv
    args = [a for a in argv if not a.startswith("--")]
    if args:
        name = args[0]
        if name not in SCENARIOS:
            raise SystemExit(f"모르는 시나리오: {name} (--list 로 목록 확인)")
        run(name, int(args[1]) if len(args) > 1 else 2, do_upload)
        return
    for name, batches in DEMO:
        run(name, batches, do_upload)


if __name__ == "__main__":
    main(sys.argv[1:])
