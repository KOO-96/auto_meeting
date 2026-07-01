# Company Brain Lite 실행 / 실제 서비스 테스트

Electron Frontend, FastAPI Backend, Redis/RQ Worker, PostgreSQL, vLLM 모델 서버를 붙여 MVP 흐름을 테스트하는 방법입니다.

## 1. 사전 준비

- Docker Desktop 실행
- vLLM 모델 서버 실행
  - 예시: `http://localhost:8001/v1`
  - model id: `test-9b-llm`
- `mise` 설치

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

## 2. Runtime 설치

```bash
cd auto_meeting
mise install
```

설치 버전은 [.mise.toml](.mise.toml)을 기준으로 합니다.

```text
node 24.14.0
python 3.11
```

## 3. Backend 실행

```bash
cd auto_meeting/backend
cp .env.example .env
# Generate a strong JWT secret and write it into .env (required — startup fails otherwise)
printf 'JWT_SECRET_KEY=%s\n' "$(openssl rand -hex 32)" >> .env
docker compose up --build
```

> `docker compose`는 이제 `.env`를 로드합니다(`.env.example`이 아님). `JWT_SECRET_KEY`가 비어 있거나 `change-me` 같은 placeholder이면 백엔드가 기동을 거부합니다.

Backend health check:

```bash
curl http://localhost:8000/health
```

vLLM 모델 확인:

```bash
curl http://localhost:8001/v1/models
```

## 4. Frontend 실행

새 터미널에서 실행합니다.

```bash
cd auto_meeting/frontend
npm install
npm run dev
```

브라우저에서 `localhost` 주소만 직접 열면 Electron preload API가 없어서 로컬 폴더 생성, 첨부 파일 복사, 화면 녹화가 동작하지 않습니다. 반드시 `npm run dev`로 열린 Electron 창에서 테스트합니다.

기본 로그인:

```text
email: admin@company.local
password: password
```

앱 설정 화면에서 Backend API URL이 `http://localhost:8000`인지 확인합니다.

Electron 창을 닫은 뒤 다시 켜려면 같은 명령을 다시 실행합니다.

```bash
cd auto_meeting/frontend
npm run dev
```

Backend Docker Compose는 별도 터미널에서 계속 떠 있어도 됩니다.

## 4.1 macOS 녹음/녹화 권한

개발 모드에서는 macOS 권한 목록에 앱이 `Company Brain Lite`가 아니라 `Electron`, `Visual Studio Code`, `Terminal`, `iTerm` 중 하나로 표시될 수 있습니다.

화면 기록 목록이 비어 있으면 앱의 `앱 위치 열기` 버튼으로 Finder에서 개발용 `Electron.app` 위치를 연 뒤, 시스템 설정의 `+` 버튼으로 해당 앱을 직접 추가합니다.

다음 위치에서 표시되는 실행 항목을 허용합니다.

```text
시스템 설정 > 개인정보 보호 및 보안 > 마이크
시스템 설정 > 개인정보 보호 및 보안 > 화면 기록
```

권한을 바꾼 뒤에는 Electron 창을 닫고 `npm run dev`를 다시 실행합니다.

## 4.2 강제 종료된 회의 정리

앱 강제 종료 후 `recording` 상태로 남은 회의는 회의록 목록에서 정리합니다.

```text
회의록 목록 > 필터: 기록 중 > 계속 또는 삭제
```

`계속`은 회의 진행 화면으로 다시 들어가고, `삭제`는 해당 회의 metadata를 제거합니다.

## 5. 실제 테스트 흐름

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

현재 Qwen3.5-9B vLLM은 LLM/VLM 용도로 연결되어 있습니다. STT는 pluggable 구조로, `STT_BASE_URL`(OpenAI 호환 `/audio/transcriptions`)을 설정하면 실제 전사를 사용하고, 비워 두면 mock/developing 전사로 동작합니다. 화면 녹화는 `ffmpeg`가 설치되어 있으면 프레임을 샘플링해 VLM으로 분석합니다(없으면 자동 skip).

Worker는 LangGraph `StateGraph` 기반 Agent pipeline으로 `입력 수집 -> STT mock -> 이미지/VLM 조건 분기 -> 타임라인 정렬 -> 회의록 생성 -> 검증 저장` 순서를 수행합니다.

## 6. 종료 / 정리

Backend 종료:

```bash
cd auto_meeting/backend
docker compose down
```

테스트 DB/볼륨까지 초기화:

```bash
docker compose down -v
```
