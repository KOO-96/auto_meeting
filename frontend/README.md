# Company Brain Lite Frontend

Electron 기반 데스크톱 회의 기록 앱입니다. 회의 생성, 전체 화면 녹화, 마이크 포함 녹화, 음성 단독 녹음, timestamp 메모, 첨부 파일 복사, 로컬 metadata/log 저장, 처리 상태 조회, 회의록 상세/Export UI를 제공합니다.

## Version

버전 관리는 workspace root의 `.mise.toml`을 기준으로 합니다.

현재 환경에 `mise`가 없다면 먼저 설치합니다.

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

```bash
cd auto_meeting
mise install
cd frontend
npm install
```

현재 고정 버전:

```text
node 24.14.0
```

## Development

Frontend는 Backend API와 연동됩니다. 먼저 Backend를 실행한 뒤 Electron 앱을 시작하세요.

```bash
cd auto_meeting/backend
docker compose up --build
```

```bash
cd auto_meeting/frontend
npm run dev
```

기본 로그인:

```text
email: admin@company.local
password: password
```

Backend API URL은 앱 설정 화면에서 변경할 수 있으며 기본값은 `http://localhost:8000`입니다.

## Build

```bash
npm run lint
npm run build
```

패키징:

```bash
npm run dist
```

## Local Storage Policy

원본 자료는 자동 업로드하지 않습니다. 기본 저장 위치는 다음과 같습니다.

```text
~/CompanyBrain/
├── meetings/{meeting_id}/
│   ├── screen/screen.webm
│   ├── audio/audio.webm
│   ├── attachments/
│   ├── memos/timeline_memos.json
│   ├── metadata/meeting_session.json
│   ├── logs/meeting.log
│   └── exports/
└── logs/
```

기본 저장 경로와 Backend API URL은 앱 설정 화면에서 변경할 수 있습니다.

## Implemented MVP Surface

- Electron Main / Preload / Renderer 분리
- Renderer에서 `fs`, `path`, `child_process` 직접 사용 금지
- 로그인/로그아웃
- 회의 생성, 참석자 검색/추가, 참여자만 열람 설정
- 참여자만 열람 회의 상세 접근 제어
- 전체 화면 녹화 및 마이크 음성 포함
- 시스템 사운드 미포함
- 음성 녹음 단독 시작/일시정지/재개/중지
- 메모 timestamp 저장 및 즉시 JSON 저장
- 첨부 파일 선택 및 회의 폴더 복사
- 회의 종료 확인 모달 및 진행 중 녹화/녹음 자동 종료
- `meeting_session.json` 저장
- 원본 폴더/로그 폴더 열기
- 처리 상태 1/5 polling 표시
- 완료/실패 모달
- 회의록 목록/상세
- AI 결과 카드 표시
- Markdown/PDF export
- Backend 수동 업로드 파일 저장/다운로드

## macOS Permissions

녹음/녹화에는 다음 권한이 필요합니다.

- 마이크
- 화면 기록

권한이 거부되면 앱에서 시스템 설정으로 이동할 수 있는 버튼을 표시합니다.
