# 짐작 — 항공 수하물 처리 시간 예측 AIOps

짐작은 비행기가 착륙한 뒤 **마지막 짐이 수취대에 나오기까지 걸리는 시간**을 편마다 미리 알려 주는 서비스입니다.
지상조업사와 공항 운영센터는 이 예측을 보고 인력과 벨트를 미리 배치합니다.

예측은 운영 중에 틀리기 시작합니다. 인력이 줄거나, 처리 방식이 바뀌거나, 컨베이어가 멈추면 그렇습니다.
그래서 짐작은 예측만 하지 않습니다. 예측이 어긋나는 것을 스스로 알아채고, 일시적인 사건인지 구분하고,
다시 학습한 뒤, 검증을 통과한 모델만 바꿔 끼웁니다. 기준에는 못 미치지만 지금보다 나은 모델은 사람의 승인을 받습니다.

이 저장소는 그 프로토타입입니다. 인천공항 **T1 3번 수취대(T1-03)** 한 곳에서 실제 모델이 돌고,
터미널 지도의 나머지 36곳은 발표용 화면입니다.

| 단계 | 짐작이 하는 일 |
|---|---|
| 예측 | 직전 20편 기록으로 다음 편의 처리 시간을 예측 (LSTM). 도착 예정 1시간 전에 발행 |
| 서빙 | FastAPI, 포트 **8077**. Lazy/Eager 로딩 |
| 모델 관리 | MLflow 레지스트리(sqlite)에 버전 기록. 배포 기준(게이트)을 통과한 버전만 운영 |
| 감시 | 최근 21편 예측의 MAE를 임계값 5분과 비교 |
| 대응 | 사건 때문이면 알림만 / 사건 없이 2번 연속이면 재학습 → 게이트 → 자동 교체 / 지금보다 나은 불합격 후보는 승인 대기 |
| 화면 | 관제 대시보드 — 시나리오 실행, 모니터링, 모델 승인·되돌림, 로그 |

## 실행

Python 3.11 기준입니다. 저장소 루트에서 실행합니다.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn serving_app.main:app --port 8077
```

- 대시보드: http://localhost:8077/ · API 문서: http://localhost:8077/docs
- **처음 실행이면** 운영 모델이 아직 없습니다. 서버가 첫 예측 요청 때 기본 모델(v1)을 스스로 학습합니다(20~30초).
  그동안 화면 위에 "기본 모델 학습 중" 안내가 뜨고 `/predict`는 503으로 답합니다. 끝나면 예측이 바로 나옵니다.
- 미리 학습해 두려면 `python -m serving_app.initialize_model` — 학습 → 배포 기준 → MLflow 등록 → 드리프트 임계값 보정까지 합니다.
- 포트는 **8077 하나로 통일**했습니다. 로컬 uvicorn, Docker, `scripts/simulate_drift.py`(`API_URL`), `scripts/verify_serving.py`, 프론트 개발 서버 프록시가 모두 8077을 씁니다.
- 로컬 기본은 Lazy 모드입니다(모델을 첫 예측 때 불러옴). `LOADING_MODE=eager`로 띄우면 시작할 때 불러옵니다. Docker는 Eager가 기본입니다.

### Docker

```bash
docker compose -f serving_app/docker-compose.yml build
docker compose -f serving_app/docker-compose.yml run --rm init
docker compose -f serving_app/docker-compose.yml up -d serving-app
```

- http://localhost:8077/ — 컨테이너 안에서도 8077로 뜹니다. 다른 포트로 열려면 `SERVING_PORT=8090`을 앞에 붙입니다.
- `init`은 운영 모델이 없으면 학습·등록하고 임계값을 보정합니다. 이미 있으면 불러와 검증만 합니다. 건너뛰어도 서버가 첫 실행 때 스스로 학습합니다.
- MLflow DB·모델·업로드·로그·임계값은 `jimjak-state` 볼륨(`/state`)에 남습니다. `down -v`를 하면 모두 지워집니다.
- MLflow UI: `docker compose -f serving_app/docker-compose.yml up -d mlflow-ui` → http://localhost:5001
- API 검증: `docker compose -f serving_app/docker-compose.yml exec serving-app python scripts/verify_serving.py`

## 시연 순서

대시보드에서 진행합니다. 상단의 **초기화**는 판정 기록을 비우고 운영 모델을 v1로 되돌린 뒤 데모 시각을 10:30으로 맞춥니다.

1. **Overview** — 터미널 지도. 수취대 37곳의 상태와 확인이 필요한 곳을 봅니다. T1 3번을 누르면 들어갑니다.
2. **T1 3번 수취대 › 개요** — 지금 하역 중인 편, 다음 편 예측(도착 1시간 전 발행), 예측 근거(앞 20편), 오늘 도착편.
3. **시나리오** — 사건이 담긴 데이터를 넣고 AI가 어떻게 대응하는지 단계별로 봅니다. 권장 순서:
   정상 → 컨베이어 고장(알림만) → 인력 부족 장기화 2회(재학습 → v2 자동 교체) → 처리 방식 변경 2회(승인 대기)
4. **모델** — 승인 대기 후보를 승인하면 v3가 운영됩니다. 이전 버전으로 되돌릴 수도 있습니다.
5. **모니터링 · 로그** — 판정 기록, 배치별 MAE, 감시 창 21편, 응답 시간, 판단마다 남은 로그.

같은 흐름을 터미널에서 돌리려면 `python scripts/simulate_drift.py`를 실행합니다(정상 1회 → 컨베이어 고장 2회 → 인력 부족 2회).
시나리오 하나만 보내려면 `python scripts/simulate_drift.py staff_shortage 2`, 목록은 `--list`입니다.

## 예측 모델

- **입력** — 직전 20편. 칸마다 (그 편의 처리 시간, 다음 편의 좌석 수)라서 모양은 (20, 2)이고, 마지막 칸의 좌석 수는 예측할 편의 것입니다.
- **예측 시점** — 도착 예정 1시간 전. 그때까지 마지막 짐 처리가 끝난 편만 입력에 넣습니다(아직 모르는 정보가 섞이지 않게).
- **구조** — LSTM(32) → LSTM(32) → LSTM(16) → Dense(16, relu) → Dense(1). MSE 손실, Adam(1e-3), 100 epoch (`serving_app/lstm_model.py`).
- **스케일러** — 버전마다 모델과 함께 저장하고 sha256으로 확인합니다. 재학습은 스케일러를 다시 맞추지 않고 이어서 학습합니다.
- **v1 성능** — 검증 MAE 2.77분 (직전 20편 평균으로 맞히면 3.45분).
- 예측이 50분을 넘으면 `over_threshold: true` — 인력 추가나 벨트 재배정을 검토할 시점입니다.

### 배포 기준 (게이트)

새 모델은 아래를 모두 만족해야 운영(Production)으로 올라갑니다. 하나라도 못 넘으면 지금 모델이 그대로 운영됩니다.

1. 검증 MAE 5분 이하
2. 직전 20편 평균보다 MAE가 10% 이상 좋음
3. 지금 운영 모델보다 MAE가 나쁘지 않음 (첫 배포는 비교 생략)

## 드리프트 감시와 대응

| 판정 | 조건 | 대응 |
|---|---|---|
| 정상 (`ok`) | 최근 21편 MAE ≤ 임계값 | 연속 횟수를 0으로 |
| 사건 경고 (`alert_only`) | 넘었지만 창 안에 사건 표시(`event_tag`: 컨베이어 고장, 개장 초기 등)가 있음 | 알림만. 재학습하지 않고, 그 구간은 재학습 데이터에서도 뺌 |
| 주의 (`warn`) | 사건 없이 넘음 | 연속 횟수 +1 |
| 재학습 (`retrain_triggered`) | 사건 없는 초과가 2번 연속 | 재학습 → 게이트 → 통과하면 서빙 모델 자동 교체 |

- **임계값** — 정상 데이터(`data/normal_2w.csv`)에서 잰 21편 MAE의 상위 5%(p95, v1 기준 3.97분)와 배포 기준 5분 중 큰 값, 지금은 **5.0분**입니다.
  배포 기준보다 낮게 잡으면 기준을 통과한 모델도 평소 오차만으로 걸리기 때문입니다. 첫 학습·재학습 때 다시 잽니다(`serving_app/monitoring/drift_threshold.json`).
- **재학습** — 처음부터가 아니라 운영 모델에서 이어서 짧게 학습합니다(fine-tune 10 epoch, 학습률 1e-4).
  최근 14일 데이터를 쓰고 마지막 3일로 검증합니다(`data/retraining.py`).
- **승인 대기** — 게이트는 못 넘었지만 같은 검증 데이터에서 지금 모델보다 나은 후보는 대시보드 모델 화면에서 운영자가 승인합니다(`POST /models/approve`).
- **같은 데이터 보류** — 불합격한 데이터로는 다시 재학습하지 않습니다. 새 데이터가 올라오면 다시 시도합니다.
- **되돌림** — 보관된 이전 버전을 운영으로 되돌릴 수 있습니다(대시보드 또는 `python -m serving_app.model_registry rollback --version 1`).
- 모든 판단은 `logs/aiops.log`에 `[OK]` `[INFO]` `[WARN]` `[ALERT]` `[FAIL]`로 남고, 대시보드 로그 화면에서 봅니다. `/predict`가 1초를 넘으면 `[WARN]`입니다.

## 데이터

실제 운영 기록 대신 업무 규칙으로 만든 T1-03 편 기록입니다(`scripts/generate_data.py`).
처리 시간 = 고정 준비 시간 21분 + 좌석 수에 비례한 하역 시간 + 앞 편이 벨트를 쓰고 있으면 밀린 시간(최대 15분) + 잡음, 최소 20분.

| 파일 | 편 수 | 내용 | 평균 | 기대 동작 |
|---|---:|---|---:|---|
| `train_normal.csv` | 960 | 정상 운영 (8–9월) | 35.4분 | v1 학습 |
| `normal_2w.csv` | 220 | 정상 2주 — 화면의 T1 3번 편 기록, 임계값 보정에도 씀 | 35.2분 | 정상 |
| `bhs_failure_2w.csv` | 220 | 51–54번째 편 컨베이어 고장 +20~40분 (`event_tag=bhs_failure`) | 36.0분 | 사건 경고, 재학습 안 함 |
| `staff_shortage_2w.csv` | 220 | 인력 부족으로 처리 시간 1.3배 (표시 없음) | 46.7분 | 2번 연속 → 재학습 → v2 |
| `expansion_2w.csv` | 220 | 수취대 증설로 처리 시간 0.8배 | 28.2분 | 재학습 |
| `terminal_open_4w.csv` | 450 | 개장 초기 2주 혼란 +15~30분(`terminal_open`) 뒤 안정화 0.9배 | 46.1분 | 혼란 구간은 사건 경고, 안정화 뒤 재학습 |
| `process_change_2w.csv` | 220 | 처리 방식 변경 1.15배 + 변동 확대 | 41.1분 | 재학습 → 게이트 불합격 → 승인 대기 |

컬럼: `flightId, terminalId, bagCarouselId, line_id, aircraftSubtype, seats, estimatedDatetime, LandingDatetime, bagLastTime, wait_min, event_tag`
(`wait_min` = 착륙부터 마지막 짐까지 분). 대시보드나 `POST /data/upload`로 올린 CSV는 `data/uploads/`에 쌓이고, 재학습은 가장 최근 파일을 씁니다.

## API

| API | 하는 일 |
|---|---|
| `GET /health` | 서버·모델 상태. 모델이 없으면 503 (`not_ready` · 첫 실행 학습 중 `training` · 실패 `failed`) |
| `POST /predict` | 직전 20편 → 다음 편 처리 시간 (`predicted_wait_min`, `over_threshold`, `model_version`). 20편이 아니면 422 |
| `POST /predict/batch-test` | 연속된 편 41편 이상 → 슬라이딩 예측 + 드리프트 판정(`drift_check`), 필요하면 재학습 |
| `POST /data/upload` · `GET /data/status` | 학습·재학습용 CSV 올리기 · 최근 업로드 |
| `GET /monitoring/status` · `POST /monitoring/reset` | 임계값·연속 횟수·판정 기록 · 데모 초기화 |
| `GET /models` | 모델 버전, 운영 버전, 게이트 기록, 승인 대기 후보 |
| `POST /models/approve` · `POST /models/rollback` | 승인 대기 후보 승인 · 이전 버전으로 되돌림 |
| `GET /scenarios` · `GET /scenarios/{id}/file` | 시나리오 데이터 요약 · CSV 파일 |
| `GET /logs/events` · `GET /logs/latency` | 판단 로그 · `/predict` 응답 시간(p50·p95) |
| `GET /logs` · `GET /logs/{filename}` | 로그 파일 목록 · 내용 |

`POST /predict` 요청 예시 (칸 20개):

```json
{
  "sequence": [
    {"wait_min": 34, "next_seats": 189},
    {"wait_min": 41, "next_seats": 280},
    {"...": "18칸 더"}
  ]
}
```

## 화면 (frontend)

React 19 · Vite · TypeScript · Tailwind CSS v4. 빌드 결과는 `serving_app/static`에 들어 있어 서버만 띄우면 `/`에서 열립니다(Node 없이도).
화면을 고칠 때만 Node 20 이상이 필요합니다.

```bash
cd frontend
npm install
npm run dev
npm run build:serve
```

`npm run dev`는 http://localhost:5173/ 에서 열리고 API를 8077로 넘깁니다. `npm run build:serve`는 `serving_app/static`을 새로 씁니다.
디자인 원칙은 [`DESIGN.md`](DESIGN.md), 화면별 설명과 화면이 쓰는 API는 [`frontend/README.md`](frontend/README.md)에 있습니다.

## 테스트

```bash
python -m unittest discover
```

`tests/` 112개 — 설정, 피처, 배포 기준, 모델 등록·되돌림, 드리프트 판정, 재학습 트리거, 임계값 보정, 첫 실행 학습, 라우터.

Lazy와 Eager의 시작·첫 예측 시간은 `python scripts/measure_loading.py`로 잽니다(새 서버 프로세스를 띄워 측정).
측정 예: Lazy는 0.2초 만에 뜨고 첫 예측이 약 4초, Eager는 2.9초 뒤에 뜨고 첫 예측이 0.13초. 그 뒤 예측은 둘 다 p50 약 16ms입니다. Docker는 Eager가 기본입니다.

## 폴더 구조

```
skala-aiops-jimjak/
├── data/                         팀 데이터셋(*.csv), 피처·시퀀스(features.py), 재학습 데이터 분할(retraining.py), 업로드(uploads/)
├── scripts/
│   ├── generate_data.py          업무 규칙으로 데이터셋 만들기
│   ├── train_baseline_v1.py      기본 모델을 새로 학습·등록 (임계값 보정은 하지 않음)
│   ├── simulate_drift.py         시나리오 CSV를 서버로 보내 드리프트 판정 보기
│   ├── calibrate_drift_threshold.py  드리프트 임계값 다시 재기
│   ├── measure_loading.py        Lazy/Eager 시간 측정
│   └── verify_serving.py         API 동작 검증 (시연 증거)
├── serving_app/
│   ├── main.py                   FastAPI 앱 — 라우터, 로그, 정적 화면(/)
│   ├── settings.json · config.py 설정 (환경 변수가 우선)
│   ├── lstm_model.py             모델 구조
│   ├── model_loader.py           Lazy/Eager 로딩, 운영 모델 캐시
│   ├── model_registry.py         MLflow 버전 저장·불러오기·되돌림·내보내기
│   ├── train_and_register.py     처음 학습(scratch)과 재학습(fine-tune), 게이트 판정, 등록
│   ├── deployment_gate.py        배포 기준
│   ├── initialize_model.py       운영 모델 준비 (Docker init)
│   ├── bootstrap.py              첫 실행에 모델이 없으면 백그라운드 학습
│   ├── monitoring/               드리프트 판정(drift_detector), 재학습 연결(retrain_trigger), 임계값 보정(calibration)
│   ├── routers/                  predict · health · data · monitoring · models · scenarios · logs
│   ├── static/                   화면 빌드 결과
│   └── Dockerfile · docker-compose.yml
├── frontend/                     관제 대시보드 소스
├── tests/                        unittest
└── DESIGN.md                     화면 디자인 문서
```

실행하면 생기는 `mlflow.db`, `mlartifacts/`, `logs/`, `data/uploads/*`, `serving_app/models/*`는 git에 올리지 않습니다.
