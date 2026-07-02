# Company Brain Lite 실행 가이드

Electron 데스크톱 앱(화면·음성 녹화) + FastAPI 백엔드 + Redis/RQ 워커 + PostgreSQL + LangGraph 파이프라인 + vLLM 모델 서버로 구성된 회의 자동 기록/회의록 생성 MVP입니다.

이 문서는 **처음 보는 사람도 그대로 따라 하면 실행**할 수 있도록 작성되었습니다. macOS + Docker Desktop 기준입니다.

---

## 0. 구성 한눈에 보기

| 구성요소 | 실행 방식 | 포트 |
| --- | --- | --- |
| PostgreSQL | Docker (compose) | 5432 |
| Redis | Docker (compose) | 6379 |
| Backend (FastAPI) | Docker (compose) | 8000 |
| Worker (RQ) | Docker (compose) | - |
| Frontend (Electron) | 로컬 `npm run dev` | - |
| vLLM 모델 서버 | 별도 실행(선택) | 8001 |

- **Backend/DB/Worker는 Docker로 한 번에** 뜹니다.
- **Frontend는 로컬에서 Electron 창으로** 실행합니다(브라우저 X).
- vLLM(LLM/VLM)·STT 서버는 **없어도 앱은 동작**합니다(회의록은 fallback/mock으로 생성).

---

## 1. 사전 준비 (최초 1회)

### 1-1. Docker Desktop 설치 및 실행
[Docker Desktop](https://www.docker.com/products/docker-desktop/)을 설치하고 실행해 둡니다. (`docker info`가 오류 없이 나오면 준비 완료)

### 1-2. mise 설치 (Node/Python 버전 관리)
```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

### 1-3. 런타임 설치
저장소 루트에서 실행합니다. `.mise.toml`에 명시된 버전(node 24.14.0, python 3.11)을 설치합니다.
```bash
cd auto_meeting
mise install
```
> Node는 Frontend 실행에, Python은 (선택) 백엔드 로컬 테스트에 쓰입니다. 백엔드 앱 자체는 Docker로 실행되므로 로컬 Python은 없어도 앱 실행에는 지장이 없습니다.

### 1-4. (선택) vLLM 모델 서버
실제 LLM/VLM 회의록 품질을 보려면 OpenAI 호환 vLLM 서버를 띄웁니다.
- 예: `http://localhost:8001/v1`, model id `test-9b-llm`
- 설정하지 않으면 회의록은 자동으로 fallback(기본 초안)으로 생성됩니다.

---

## 2. Backend 실행 (Docker)

### 2-1. 환경변수 파일 만들기
```bash
cd auto_meeting/backend
cp .env.example .env
# JWT 시크릿 생성 후 .env에 기록 (필수 — 없으면 백엔드가 시작을 거부합니다)
printf 'JWT_SECRET_KEY=%s\n' "$(openssl rand -hex 32)" >> .env
```
> ⚠️ 변경점: `docker compose`는 이제 `.env`를 읽습니다(`.env.example` 아님). `JWT_SECRET_KEY`가 비어 있거나 `change-me` 같은 placeholder면 백엔드가 **의도적으로 기동을 거부**합니다.
>
> `.env`에서 바꾸면 유용한 값(선택):
> - `AI_MODEL_BASE_URL` — vLLM 주소(예: `http://host.docker.internal:8001/v1`). Docker 컨테이너에서 호스트에 접근하려면 `localhost` 대신 `host.docker.internal`을 사용하세요.
> - `STT_BASE_URL` — 실제 음성 전사(OpenAI 호환 `/audio/transcriptions`). 비워두면 mock.

### 2-2. 컨테이너 기동
```bash
docker compose up --build
```
이 명령 하나로 **PostgreSQL → Redis → Backend → Worker**가 순서대로 뜹니다.
- DB 스키마 마이그레이션(`alembic upgrade head`)과 시드 관리자 생성은 백엔드 컨테이너가 **자동 수행**합니다(수동 alembic 실행 불필요).

### 2-3. 정상 확인
새 터미널에서:
```bash
curl http://localhost:8000/health        # {"status":"ok","checks":{"database":"ok","redis":"ok"}}
curl http://localhost:8000/health/live   # {"status":"ok"}
```
(선택) vLLM 확인:
```bash
curl http://localhost:8001/v1/models
```

---

## 3. Frontend 실행 (Electron)

**새 터미널**에서 실행합니다. Backend compose는 그대로 띄워 둡니다.
```bash
cd auto_meeting/frontend
npm install
npm run dev
```
- ⚠️ **반드시 `npm run dev`로 열리는 Electron 창에서** 사용하세요. 브라우저에서 `localhost` 주소만 직접 열면 Electron preload API가 없어 로컬 폴더 생성·첨부 복사·화면 녹화가 동작하지 않습니다.
- 앱 `설정` 화면에서 Backend API URL이 `http://localhost:8000`인지 확인합니다.
- 창을 닫았다가 다시 켜려면 같은 `npm run dev`를 다시 실행하면 됩니다.

### 기본 로그인
```text
email: admin@company.local
password: password
```
> ⚠️ 변경점: 시드 관리자 계정은 **최초 로그인 후 비밀번호 변경이 필요한 상태**(`must_change_password=true`)로 생성됩니다. 로그인 자체는 되지만, 운영 전에는 반드시 `POST /api/auth/change-password`로 비밀번호를 바꾸세요.
> ```bash
> # 예시: 로그인해서 access_token을 받은 뒤
> curl -X POST http://localhost:8000/api/auth/change-password \
>   -H "Authorization: Bearer <ACCESS_TOKEN>" -H "Content-Type: application/json" \
>   -d '{"current_password":"password","new_password":"새비밀번호8자이상"}'
> ```
> 시드 관리자는 개발/테스트 환경(`APP_ENV`가 local/dev/test)에서만 자동 생성됩니다. 운영 환경에서는 생성되지 않습니다.

### 3-1. macOS 녹음/녹화 권한
개발 모드에서는 권한 목록에 앱이 `Company Brain Lite`가 아니라 `Electron`, `Visual Studio Code`, `Terminal`, `iTerm` 중 하나로 표시될 수 있습니다.

화면 기록 목록이 비어 있으면 앱의 `앱 위치 열기` 버튼으로 Finder에서 개발용 `Electron.app` 위치를 연 뒤, 시스템 설정의 `+` 버튼으로 직접 추가합니다.

```text
시스템 설정 > 개인정보 보호 및 보안 > 마이크
시스템 설정 > 개인정보 보호 및 보안 > 화면 기록
```
권한을 바꾼 뒤에는 Electron 창을 닫고 `npm run dev`를 다시 실행합니다.

### 3-2. 강제 종료된 회의 정리
앱 강제 종료 후 `recording` 상태로 남은 회의는 `회의록 목록 > 필터: 기록 중`에서 `계속` 또는 `삭제`로 정리합니다.

---

## 4. 실제 테스트 흐름

1. 로그인
2. 새 회의 생성
3. 회의 진행 화면 진입
4. 화면 녹화 / 음성 녹음 / 메모 / 첨부 파일 기능 확인
5. 회의 종료
6. 로컬 원본 폴더 생성 여부 확인
7. 회의 상세에서 필요한 파일을 Backend에 수동 업로드
8. `AI 처리 요청`
9. 처리 상태가 `completed`가 되는지 확인
10. 회의록 상세 결과 확인
11. Markdown / PDF export 다운로드 확인

Worker는 LangGraph `StateGraph` 파이프라인으로 `입력 수집 → STT → 이미지/화면 VLM 조건 분기 → 타임라인 정렬 → 회의록 생성 → 검증 저장`을 수행합니다.

---

## 5. AI 기능 활성화 (선택)

| 기능 | 활성화 방법 | 미설정 시 |
| --- | --- | --- |
| 회의록 생성(LLM) | `.env`의 `AI_MODEL_BASE_URL` 설정 | fallback 초안 생성 |
| 이미지 분석(VLM) | 위와 동일(같은 vLLM) | 개발중 상태로 skip |
| 음성 전사(STT) | `.env`의 `STT_BASE_URL`(OpenAI 호환 `/audio/transcriptions`) 설정 | mock/developing 전사 |
| 화면→VLM 프레임 분석 | 워커 환경에 `ffmpeg` 필요 | 자동 skip |

> 참고: 기본 Docker 워커 이미지에는 `ffmpeg`가 포함되어 있지 않아 화면→VLM은 기본적으로 skip됩니다. 활성화하려면 워커 이미지에 `ffmpeg`를 설치해야 합니다(`backend/Dockerfile`의 `apt-get install`에 `ffmpeg` 추가).

전체 설정 항목은 [`backend/.env.example`](backend/.env.example)을 참고하세요.

---

## 6. 종료 / 정리

Backend 종료:
```bash
cd auto_meeting/backend
docker compose down
```

DB/볼륨까지 초기화(스키마를 처음부터 다시 만들 때):
```bash
docker compose down -v
```
> ⚠️ 변경점: DB 마이그레이션이 실제 DDL 방식으로 바뀌었습니다. **예전 버전으로 이미 DB를 만든 적이 있다면** 새 컬럼/인덱스가 반영되지 않을 수 있으니, 위 `docker compose down -v`로 볼륨을 지우고 `docker compose up --build`로 다시 생성하세요. (처음 실행하는 경우 신경 쓰지 않아도 됩니다.)

---

## 7. (개발자용) 테스트 실행

백엔드 테스트는 로컬 Python(mise)으로 실행합니다.
```bash
cd auto_meeting/backend
python -m venv .venv && . .venv/bin/activate   # 최초 1회
pip install -e ".[dev]"                          # 최초 1회
pytest -q          # 전체 테스트 (기본 SQLite)
ruff check app tests
```
프론트엔드:
```bash
cd auto_meeting/frontend
npm run lint
npm run build      # tsc 타입체크 + electron-vite 빌드
```
CI는 `.github/workflows/ci.yml`에서 PostgreSQL + Redis 컨테이너로 백엔드/프론트엔드를 검증합니다.

---

## 8. 자주 겪는 문제

| 증상 | 원인 / 해결 |
| --- | --- |
| 백엔드 컨테이너가 바로 종료됨 | `JWT_SECRET_KEY` 미설정/placeholder. `.env`에 강한 값 생성(2-1 참고) |
| `/health`가 503 | DB 또는 Redis 미기동. `docker compose ps`로 상태 확인 |
| 로그인 후 새 컬럼 관련 오류 | 예전 스키마 잔존. `docker compose down -v` 후 재기동(6번) |
| 화면 녹화/마이크가 안 됨 | 브라우저로 연 경우(반드시 Electron 창) 또는 macOS 권한 미허용(3-1) |
| 회의록이 "기본 초안"만 나옴 | `AI_MODEL_BASE_URL` 미설정. vLLM 주소 설정(5번) |
| 컨테이너에서 vLLM(localhost) 접속 실패 | `localhost` 대신 `host.docker.internal` 사용 |
