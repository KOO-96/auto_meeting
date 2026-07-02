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

## 🔜 남은 백로그 (다음 후보)

### 기능/파이프라인
- [ ] 화자 분리(diarization): STT `segments[].speaker` 실제 채우기 + audio/screen_audio 트랙 병합(`TranscriptType`)
- [ ] 긴 오디오 청킹/부분 결과 처리(대용량 녹음 대비)
- [ ] `meeting_type`을 프론트 회의 상세/목록에 표시(현재 API에는 노출됨)
- [ ] 프롬프트 인젝션 방어 강화(메모/제목/전사 구분자·이스케이프, `title` 길이 제한)
- [ ] 토큰 기반 컨텍스트 예산(문자수 truncation → 토큰 기준)

### 인프라/운영
- [ ] `/metrics` 및 readiness/liveness 분리 고도화, 워커 관측성(Sentry 등)
- [ ] CORS를 환경설정 기반으로(현재 localhost 하드코딩)
- [ ] 업로드 스트리밍 처리 + 콘텐츠 스니핑(현재 확장자 검증 + 전체 메모리 적재)
- [ ] 다운로드 시 `Content-Disposition: attachment`(반사 MIME 완화)
- [ ] 구조화 로깅을 워커 파이프라인 전 구간으로 확장

### 프론트엔드
- [ ] 강제 비밀번호 변경 UI 연결(백엔드 `must_change_password`/change-password 소비)
- [ ] `apiBaseUrl` 메모이제이션(요청마다 IPC+디스크 조회 제거), fetch 타임아웃/취소
- [ ] `saveMemos`의 전역 `syncedMemoClientIds` 정리(메모리 누수/부분 실패 처리)
- [ ] 에러/로딩 상태 정리(성공 스타일로 오류 표시되는 배너 등), React key 개선
- [ ] `getDisplayMedia` 전환 검토(deprecated `chromeMediaSource` 대체)

### 테스트/품질
- [ ] 프론트 유닛/통합 테스트 도입(현재 없음)
- [ ] 워커 파이프라인 부분 실패/재시도 경로 테스트 확대

---

## 운영 참고

- **마이그레이션**: `0001_initial`이 `create_all`에서 실 DDL로 교체됨. 옛 마이그레이션을 이미 적용한 개발 DB는 새 컬럼/인덱스 미반영 → `docker compose down -v`로 볼륨 재생성 필요(신규 배포/테스트 DB는 영향 없음).
- **STT**: `STT_BASE_URL`(Whisper 호환) 설정 시 실제 전사, 비우면 mock.
- **화면→VLM**: 워커 환경에 `ffmpeg` 필요(없으면 자동 skip).
- **필수 환경변수**: `JWT_SECRET_KEY`(빈 값/placeholder 시 기동 거부). `.env.example` 참고.
