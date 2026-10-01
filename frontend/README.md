# 짐작 프론트엔드

인천공항 수하물 처리 시간 예측 서비스 「짐작」의 관제 화면(발표용 서비스).
데이터는 백엔드 없이 **목업 API 층**(`src/api`)에서 온다. 나중에 실제 서버로 바꿀 자리다.

**디자인은 저장소 루트의 [`DESIGN.md`](../DESIGN.md)를 따른다.** Vercel 대시보드(Geist) 디자인 언어를 짐작에 맞게 옮겼다.

## 실행

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173/#/
npm run typecheck  # tsc -b
npm run build      # vite build → frontend/dist
```

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

실제로 모델이 도는 곳은 T1-03 하나다(팀 데이터셋 `data/*.csv` 의 `line_id`). 나머지 36곳은 발표용 목업 상태다.

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
│   ├── carousel.ts          # T1-03 편 (팀 데이터셋 → data/t103.ts)
│   ├── terminal.ts          # 터미널 37곳 상태 · 알림 (목업)
│   ├── control.ts           # 자동 처리 · 사람이 볼 일
│   ├── mockServer.ts        # 시나리오 실행 · 재학습 · 게이트 · 승격 · 로그 (메모리 상태)
│   └── hooks.ts, views.ts   # 화면용 훅
├── styles/tokens.css        # Geist 토큰
└── index.css                # Tailwind v4 테마 · type-* 글자 · material-* 면 · 움직임
```

`components/app`, `components/ops|monitoring|lab|graphics`, `pages/OpsPage|MonitoringPage|LabPage`, `design/sections` 는 갈아엎기 전 화면이다. 지금 라우트에서는 쓰지 않는다(`design/mock.ts` 의 타입·목업은 `src/api` 가 아직 쓴다).

## 데모

- 데모 시각은 2026-10-01 10:30 에서 시작해 실제 시간만큼 흐른다. 헤더의 "초기화"로 처음 상태로 돌린다.
- 시나리오 화면에서 "인력 부족 장기화"를 두 번 실행하면 드리프트 2/2 → 재학습 → 게이트 통과 → v2 승격까지 이어지고, 모니터링·모델·Overview 에 함께 반영된다.
