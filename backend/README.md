# Company Brain Lite Backend

FastAPI 기반 Company Brain Lite Backend입니다. Electron Frontend가 저장한 회의 metadata와 관리자가 수동 업로드한 파일을 관리하고, Redis/RQ 기반 AI 처리 Job과 결과 조회, Markdown/PDF Export를 제공합니다.

## Runtime

프로젝트 루트의 `.mise.toml` 기준:

```text
python 3.11
node 24.14.0
```

현재 환경에 `mise`가 없다면 먼저 설치해야 합니다.

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
cd auto_meeting
mise install
```

## Local Setup

```bash
cd auto_meeting/backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

기본 관리자 계정:

```text
email: admin@company.local
password: password
```

## Docker Compose

Docker가 설치된 환경에서는 다음 명령으로 Backend, PostgreSQL, Redis, Worker를 실행합니다.

```bash
cd auto_meeting/backend
docker compose up --build
```

Compose는 기본으로 `.env.example`을 사용합니다. 운영 값은 `.env.example`을 `.env`로 복사해 조정하세요.

```bash
cp .env.example .env
```

## AI Model Server

Worker는 OpenAI-compatible vLLM API를 호출합니다. `.env.example`에는 로컬 예시값만 들어 있습니다. 실제 온프레미스 모델 주소는 git에 올리지 않는 `.env`에 설정합니다.

```env
AI_MODEL_BASE_URL=http://localhost:8001/v1
AI_MODEL_NAME=test-9b-llm
AI_MODEL_TIMEOUT_SECONDS=120
AI_MODEL_MAX_TOKENS=2048
AI_MODEL_TEMPERATURE=0
```

`AI_MODEL_BASE_URL`이 비어 있으면 LLM/VLM client는 안전한 fallback 결과를 사용합니다. Qwen3.5-9B는 회의록 생성과 이미지 분석에 사용하며, 음성 STT는 별도 모델이 필요하므로 현재는 mock/developing 전사 상태로 유지됩니다.

## Database

Alembic migration:

```bash
alembic upgrade head
python -m app.db.init_db
```

`init_db`는 기본 관리자 계정만 seed합니다.

## Development Server

PostgreSQL/Redis가 떠 있는 상태에서:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## Tests

테스트는 SQLite 임시 DB와 `AI_WORKER_ENABLED=false`로 실행됩니다.

```bash
pytest -q
ruff check .
```

검증된 항목:

- health check
- 로그인/refresh/logout
- 회의 생성
- 회의 시작
- 회의 종료 metadata 저장
- 개별 로컬 파일 경로를 `meeting_files.local_source_path`에 저장
- 관리자 수동 파일 업로드/다운로드
- 처리 요청
- queued 상태 중복 처리 요청 409 방지
- LangGraph 기반 Worker Agent pipeline 처리 완료
- 회의 결과 조회
- Markdown Export 생성/다운로드
- vLLM LLM/VLM endpoint 연동 smoke 검증

## Implemented API Surface

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `POST /api/auth/refresh`
- `GET/POST/PATCH/DELETE /api/participants`
- `GET/POST/PATCH/DELETE /api/projects`
- `GET/POST/PATCH/DELETE /api/meeting-series`
- `POST /api/meetings`
- `GET /api/meetings`
- `GET/PATCH/DELETE /api/meetings/{meeting_id}`
- `POST /api/meetings/{meeting_id}/start`
- `POST /api/meetings/{meeting_id}/finish`
- `POST /api/meetings/{meeting_id}/process`
- `POST /api/meetings/{meeting_id}/retry`
- `GET /api/meetings/{meeting_id}/status`
- `GET /api/meetings/{meeting_id}/result`
- `POST/GET/DELETE /api/meetings/{meeting_id}/files`
- `GET /api/meetings/{meeting_id}/files/{file_id}/download`
- `GET/POST/PATCH/DELETE /api/meetings/{meeting_id}/memos`
- `POST /api/meetings/{meeting_id}/memos/import`
- `POST/GET /api/meetings/{meeting_id}/exports`
- `GET /api/meetings/{meeting_id}/exports/{export_id}/download`
- `GET /api/search/meetings`

## Status Policy

회의 종료 후 상태는 `metadata_saved`입니다. 이는 실제 업로드 완료가 아니라 로컬 파일 경로 metadata 저장 완료를 의미합니다.

개별 로컬 파일 경로는 `meetings`가 아니라 `meeting_files.local_source_path`에 저장합니다. `meetings.local_base_path`에는 회의 폴더 루트만 저장합니다.

`queued`, `processing`, `validating` 상태에서는 중복 AI Job을 생성하지 않고 `409 Conflict`를 반환합니다.
