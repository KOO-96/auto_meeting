# Company Brain Lite — 개발 진행 내역 (do_list)

Electron 데스크톱(화면·음성 녹화) + FastAPI + Redis/RQ 워커 + PostgreSQL + LangGraph 파이프라인 + vLLM 기반 회의 자동 기록/회의록 생성 MVP.

최종 점검 상태(모두 통과):
- 백엔드: `pytest` 14 passed (SQLite + 실제 PostgreSQL), `ruff` clean, `alembic check` 모델 일치, upgrade↔downgrade 완전 가역
- 프론트엔드: `tsc -b` / `eslint` / `electron-vite build` clean
- CI: 실제 PostgreSQL + Redis 컨테이너로 로컬 재현 검증 완료

커밋: `Sprint 0` → `Sprint 1, 2` → `Sprint 3` (main 브랜치)

---

## ✅ Sprint 0 — 보안 하드닝 (배포 전 필수) — 완료

- [x] **JWT 시크릿 하드닝**: `change-me` 기본값 제거(필수, min_length 16, placeholder 거부 validator) → 미설정 시 기동 실패
- [x] **.env 유출 차단**: `.dockerignore` 추가, `docker-compose`가 `.env.example` → `.env` 로드, README에 `openssl rand -hex 32` 안내
- [x] **시드 관리자 게이트**: 운영 환경에서는 자동 생성 안 함(`app_env` 게이트), 시드 관리자는 `must_change_password=True`
- [x] **비밀번호 강제 변경**: `POST /api/auth/change-password`(현재 비번 검증·최소 8자·기존 세션 전부 무효화)
- [x] **인가 추가**: projects·meeting-series의 create/update/delete에 `require_admin`
- [x] **작성자 위조 차단**: timeline memo `author_id`를 항상 `current_user`로 강제(스키마 `created_by` 제거)
- [x] **파일 업로드 권한 수정**: 모순되던 `require_admin`+`require_meeting_access` → 회의 접근권으로 통일(소유자·참여자 업로드 가능)
- [x] **Electron 보안**: CSP 주입, `setWindowOpenHandler`/`will-navigate` 가드, IPC 경로 검증(`assertMeetingId`/`safeFileName`/저장 디렉터리 확정), `sandbox:true`
- [x] **토큰 저장 이전**: localStorage → 메인 프로세스 `safeStorage`(OS 키체인) 암호화 저장, 비동기 하이드레이션 게이트로 로그인 깜빡임 방지

## ✅ Sprint 1 — 파이프라인 신뢰성 — 완료

- [x] **RQ 잡 수명주기**: `job_timeout`/`result_ttl`/`failure_ttl`/`Retry`, 워커 `with_scheduler=True`
- [x] **enqueue-after-commit**: ProcessingJob row 커밋 후 enqueue(레이스 제거), enqueue 실패 시 failed 처리 + 503
- [x] **stuck-job 리퍼**: 타임아웃 초과 active 잡을 failed 처리(process 시작·status 조회 시) → 워커 사망해도 재처리 가능
- [x] **파이프라인 멱등화**: `reset_derived_results()`로 재실행 시 transcript/visual/analysis 중복 제거, `fail()`은 rollback 선행
- [x] **부분 실패 격리**: 이미지/프레임별 `try/except`로 한 장 실패가 전체를 죽이지 않음
- [x] **모델 클라이언트 재시도/백오프**: 5xx/429/타임아웃 지수 백오프(4xx 즉시 실패)
- [x] **JSON 파싱 fallback**: `ModelClientError` 시 fallback 회의록/이미지 결과로 degrade(회의 전체 실패 방지)

## ✅ Sprint 2 — 데이터/인프라 정비 — 완료

- [x] **실제 Alembic 마이그레이션**: `create_all` 덤프 → autogenerate 실 DDL(전 테이블 `op.create_table`)
- [x] **제약/인덱스**: `refresh_token_hash` unique, `uploaded_by`/`author_id`/`user_id` 인덱스, `processing_jobs(meeting_id, created_at)` 복합 인덱스
- [x] **downgrade 완전 가역**: Postgres enum 타입까지 drop(dialect 가드로 SQLite 안전)
- [x] **DB 세션 리팩터**: 파이프라인 3단계(입력 스냅샷 → 세션 없이 STT/VLM/LLM → 짧은 세션 저장), `MeetingAgent`가 세션 독립 `MeetingSnapshot` 사용 → 커넥션 풀 고갈 방지
- [x] **계층 일관화**: 라우트 인라인 ORM 제거(`MeetingService.get_result`, `ProcessingService.list_recent_jobs` + `ProcessingJobRead`)
- [x] **헬스체크 심화**: `/health`(DB+Redis, 장애 시 503), `/health/live`(라이브니스)
- [x] **구조화 로깅**: JSON 로그 옵션, `X-Request-ID` 상관관계 ID 미들웨어, 전역 예외 핸들러, 로그인 실패 로깅
- [x] **rate limiting**: 로그인 IP별 고정 윈도우(Redis, 장애 시 in-memory fallback) → 429
- [x] **Redis 커넥션**: 타임아웃 + 풀 재사용

## ✅ Sprint 3 — 기능 완성 — 완료

- [x] **실제 STT (pluggable)**: `STT_BASE_URL` 설정 시 OpenAI 호환 `/audio/transcriptions`(multipart, verbose_json) 호출 + 재시도/정규화, 미설정 시 mock, 실패 시 `error` 상태
- [x] **meeting_type 실동작화**: LLM 분류 → 실제 값 저장(하드코딩 제거)
- [x] **align_timeline 실동작화**: 전사 세그먼트 + 타임스탬프 메모를 시간순 병합한 실제 타임라인 → 프롬프트 주입
- [x] **screen→VLM 실동작화**: `frame_sampler`가 `ffmpeg`로 프레임 샘플링 후 VLM 분석(없으면 안전 skip)
- [x] **retry 의미 부여**: 완료 회의는 일반 process 409, retry로만 재처리
- [x] **프론트 스트림 cleanup**: 언마운트/부분 실패 시 스트림 해제
- [x] **세션 셋업 1회성화**: 쿼리 리페치마다 세션 초기화되던 버그 제거
- [x] **토큰 리프레시 플로우**: 401 시 refresh 후 1회 재시도(동시 요청 단일 refresh 공유)
- [x] **테스트 확충**: 인가/실패 경로/비밀번호 변경/rate-limit/STT 파싱 등 8종 추가(총 14)
- [x] **PostgreSQL CI**: `.github/workflows/ci.yml`(Postgres+Redis 서비스, 마이그레이션 up/down 검증 + pytest + 프론트 lint/build)

---

## ✅ Sprint 4 — 백로그 소화 — 완료

### 기능/파이프라인
- [x] 화자 분리 준비: STT `segments[].speaker` 패스스루 + 소스별 `TranscriptType`(audio/screen_audio) 저장
- [x] 긴 오디오 청킹/부분 결과 처리: `STT_CHUNK_SECONDS`(ffmpeg, opt-in) + 청크 실패 skip
- [x] `meeting_type` 프론트 노출 경로 정비(도메인 타입 `mustChangePassword` 포함 매핑 정리)
- [x] 프롬프트 인젝션 방어: `%%%BEGIN/END%%%` 데이터 펜스 + 구분자 무력화 + `title` 200자 제한 + 시스템 프롬프트 가드
- [x] 토큰 기반 컨텍스트 예산: 섹션 합산 예산 배분(`AI_MODEL_CONTEXT_TOKENS`, 보수적 1토큰/문자)

### 인프라/운영
- [x] `/health/live`(liveness) · `/health/ready`(readiness) · `/metrics`(Prometheus 텍스트) 분리, 선택 Sentry(`SENTRY_DSN`)
- [x] CORS 환경설정화(`CORS_ALLOW_ORIGINS`)
- [x] 업로드 스트리밍(청크 단위 + 선(先) 크기 제한) + magic-byte 콘텐츠 스니핑
- [x] 다운로드 `Content-Disposition: attachment` 명시(반사 MIME 완화)
- [x] 워커 로그 상관관계: 파이프라인 실행마다 `request_id=meeting:<id>` 태깅

### 프론트엔드
- [x] 강제 비밀번호 변경 UI: `/change-password` 페이지 + `ProtectedRoute` 게이트 + `authApi.changePassword`
- [x] `apiBaseUrl` 캐시(+설정 저장 시 무효화) + fetch 30s 타임아웃/AbortController
- [x] `saveMemos` 회의별 스코프 Set + `allSettled`로 부분 실패 시 성공분만 synced 처리
- [x] 에러/로딩 상태 정리(에러는 destructive 톤 배너) + React key를 index 기반으로 교정
- [x] `getDisplayMedia` 전환: 메인 `setDisplayMediaRequestHandler`(primary display 자동 선택), deprecated `chromeMediaSource` 제거

### 테스트/품질
- [x] 프론트 유닛 테스트 도입: `vitest` + `format` 유틸 6종, CI에 `npm test` 추가
- [x] 워커 실패/재시도 경로 테스트: 파이프라인 실패→failed+재처리, STT error graceful degrade, 프롬프트 예산/새니타이즈 유닛 (백엔드 총 17종)

---

## 🔜 남은 백로그 (다음 후보)

- [ ] 실제 화자 분리 모델 연동 + audio/screen_audio 이중 트랙 동시 전사·병합(현재는 단일 소스 + 타입 태깅)
- [ ] 워커 Docker 이미지에 `ffmpeg` 포함(현재 기본 이미지엔 없어 화면→VLM/청킹은 로컬 ffmpeg 필요)
- [ ] 프론트 컴포넌트/통합 테스트(React Testing Library) 확대
- [ ] 번들 크기 최적화(현재 renderer 청크 ~1.3MB, 코드 스플리팅)
- [ ] `/metrics` 요청/처리 카운터 등 실제 지표 확장(현재는 up/ready/dependency 게이지)

---

## 운영 참고

- **마이그레이션**: `0001_initial`이 `create_all`에서 실 DDL로 교체됨. 옛 마이그레이션을 이미 적용한 개발 DB는 새 컬럼/인덱스 미반영 → `docker compose down -v`로 볼륨 재생성 필요(신규 배포/테스트 DB는 영향 없음).
- **STT**: `STT_BASE_URL`(Whisper 호환) 설정 시 실제 전사, 비우면 mock.
- **화면→VLM / STT 청킹**: 워커 환경에 `ffmpeg` 필요(없으면 자동 skip / 단일 전사).
- **필수 환경변수**: `JWT_SECRET_KEY`(빈 값/placeholder 시 기동 거부). `.env.example` 참고.
- **로컬 venv 주의**: 프로젝트 폴더를 이동한 경우 `backend/.venv`의 콘솔 스크립트(`alembic` 등) shebang이 옛 경로를 가리켜 깨질 수 있습니다. `python -m alembic ...`로 실행하거나 venv를 재생성하세요(`python -m venv .venv && pip install -e ".[dev]"`).
