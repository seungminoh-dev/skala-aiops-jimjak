# 짐작 프론트엔드

인천공항 수하물 처리 시간 예측 서비스 「짐작」의 관제 화면(발표용 서비스).
**T1-03 데이터는 모두 짐작 FastAPI(`serving_app`)에서 온다** — 편 기록·예측·판정·재학습·모델 버전·로그.
터미널 지도의 다른 수취대 36곳과 그곳의 알림만 발표용 더미다.

**디자인은 저장소 루트의 [`DESIGN.md`](../DESIGN.md)를 따른다.** Vercel 대시보드(Geist) 디자인 언어를 짐작에 맞게 옮겼다.

## 실행

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173/#/  — API 는 http://127.0.0.1:8000 으로 넘긴다 (vite.config.ts proxy)
API_TARGET=http://127.0.0.1:8077 npm run dev   # 서버 주소가 다르면
npm run typecheck  # tsc -b
npm run build      # vite build → frontend/dist (확인용)
npm run build:serve  # → serving_app/static (FastAPI 가 "/" 에서 서빙. 폴더를 비우고 새로 쓴다)
```

FastAPI(`serving_app/main.py`)는 API 라우터를 먼저 등록하고 `serving_app/static` 을 `/` 에 마지막으로 mount 한다.
`uvicorn serving_app.main:app` 으로 띄우면 `http://localhost:8000/` 에서 이 화면이, `/health` · `/predict` 등은 API 가 응답한다.
서버가 없으면 화면은 "연결 끊김"으로 열리고 5초마다 다시 붙는다 (T1-03 은 비어 보인다).

### 화면이 쓰는 API

| API | 화면 |
|---|---|
| `GET /health` · `/logs/latency` | 상단 바 연결 상태 · 모니터링 응답 시간 |
| `GET /scenarios/normal/file` | T1-03 편 기록 (`data/normal_2w.csv` 를 데모 날로 10일 18분 옮김) |
| `POST /predict` | T1-03 예측 — 예측 시점(ETA 1시간 전)까지 끝난 편 20편으로 |
| `GET /scenarios` · `/scenarios/{id}/file` → `POST /data/upload` → `POST /predict/batch-test` | 시나리오 실행 (`scripts/simulate_drift.py` 와 같은 흐름) |
| `GET /monitoring/status` · `POST /monitoring/reset` | 판정 기록 · 감시 창 · 데모 초기화 |
| `GET /models` · `POST /models/approve` · `POST /models/rollback` | 모델 버전 · 게이트 기록 · 승인 대기 후보 승인 · 되돌림 |
| `GET /logs/events` · `GET /data/status` | 로그 · 최근 업로드 |

Node 20 이상. HashRouter 와 `base: './'` 라서 `dist/` 를 어느 경로에 올려도 열린다.

## 화면

| 범위 | 경로 | 화면 |
|---|---|---|
| 터미널 | `#/` | Overview: 터미널 2D 지도, 확인 필요 알림, 자동 처리 |
| 터미널 | `#/carousels` | 수취대 37곳 목록 |
| 터미널 | `#/alerts` | 알림 (확인 필요 / 확인함) |
| 터미널 | `#/logs` | 전체 로그 |
| 수취대 (T1-03) | `#/t1-03` | 개요: 지금 하역 중 / 다음 편 예측, 예측 근거, 오늘 도착편 |
| 수취대 (T1-03) | `#/t1-03/scenarios` | 시나리오: 사건 실행과 AI 대응 여섯 단계 |
| 수취대 (T1-03) | `#/t1-03/monitoring` | 모니터링: 배치별 MAE, 감시 창, 판정 기록 |
| 수취대 (T1-03) | `#/t1-03/models` | 모델: Production, 버전, 게이트, 재학습 로그 |

실제로 모델이 도는 곳은 T1-03 하나다(팀 데이터셋 `data/*.csv` 의 `line_id`). 나머지 36곳은 발표용 더미 상태다.

## 폴더

```
src/
├── App.tsx, app/            # 라우트 · 앱 틀(사이드바 + 헤더 + 상단 배너)
├── pages/
│   ├── ControlPage.tsx      # 터미널 Overview
│   ├── terminal/            # 수취대 목록 · 알림 · 로그
│   └── carousel/            # 개요 · 시나리오 · 모니터링 · 모델
├── components/
│   ├── shell/               # 사이드바 · 헤더 · 담당 아바타
│   ├── terminal/            # 2D 지도 · 수취대 아이콘 · 배너 · 안내 카드
│   ├── carousel/            # 실시간 수취대 그림 · 예측 근거 그래프 · 도착편 목록 · 모델 그림 · 판정 표시
│   ├── charts/              # 선 그래프 · 추세선 (그려지는 움직임)
│   ├── common/              # 카드 · 페이지 머리 · 페이지 넘김
│   ├── mascot/              # 픽셀 마스코트
│   └── ui/                  # shadcn 부품 (Geist 모양)
├── api/
│   ├── liveServer.ts        # 서버 상태(연결·모델·판정·로그·시나리오 실행) — FastAPI 를 읽고 쓴다
│   ├── lineData.ts          # T1-03 편 기록 (서버 data/normal_2w.csv)
│   ├── livePredict.ts       # T1-03 예측 (/predict)
│   ├── carousel.ts          # T1-03 편 상태 · 예측 · 조치
│   ├── terminal.ts          # 터미널 37곳 상태 · 알림 (T1-03 밖은 발표용 더미)
│   ├── control.ts           # 자동 처리 · 사람이 볼 일 (승인 대기 포함)
│   ├── http.ts, csv.ts      # API 호출 · CSV 검사·요약
│   └── hooks.ts, views.ts   # 화면용 훅
├── styles/tokens.css        # Geist 토큰
└── index.css                # Tailwind v4 테마 · type-* 글자 · material-* 면 · 움직임
```

`components/app`, `components/ops|monitoring|lab|graphics`, `pages/OpsPage|MonitoringPage|LabPage`, `design/sections` 는 갈아엎기 전 화면이다. 지금 라우트에서는 쓰지 않는다(`design/mock.ts` 는 타입과 화면 글자·상수만 `src/api` 가 쓴다).

## 데모

- 데모 시각은 2026-10-01 10:30 에서 시작해 실제 시간만큼 흐른다. 서버 시각(로그·판정·배포)도 같은 시계로 옮겨 보인다.
- 헤더의 "초기화"는 서버의 판정 기록·감시 창을 비우고(`/monitoring/reset`) 운영 모델을 처음 버전으로 되돌린다.
- 시나리오 화면의 실행은 실제 서버에서 돈다. "정상 → 컨베이어 고장 → 인력 부족 장기화 ×2" 순서면
  정상 → 사건 경고 → 드리프트 1/2 → 재학습 → 게이트 통과 → 새 버전 승격까지 이어지고, 모니터링·모델·Overview 에 함께 반영된다.
- "처리 방식 변경"처럼 새 모델이 게이트는 못 넘었지만 지금 모델보다 나으면 승인 대기가 된다.
  Overview 확인 필요에 "새 모델 승인"이 뜨고, 모델 화면의 게이트 기록에서 사람이 승인해 적용한다.
