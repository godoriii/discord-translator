# HANDOFF — 다른 기기에서 이어서 작업하기

> 최종 갱신: 2026-09-01 밤 (집 컴퓨터 세션 → 회사 인계). v0.2.0 배포 완료. 남은 것은 실사용 셋업 트러블슈팅뿐 — 아래 "설치 트러블슈팅"과 "미해결" 절부터 볼 것.

## 이 프로젝트가 무엇인가
Chrome + Tampermonkey 유저스크립트. 웹 디스코드(discord.com) 채팅 메시지를 Claude API로 한국어 인라인 번역하고, 사용자 용어집(`glossary.json`, WoW 공식 한국어 명칭)을 강제 적용한다. Windows/Mac 동일 스크립트 한 벌, GitHub raw URL로 자동 업데이트.

## 문서 읽는 순서 (새 Claude Code 세션에 "docs/ 를 읽고 이어서 해줘" 라고 하면 됨)
1. `docs/decisions.md` — 오케스트레이터 최종 결정(무엇을 왜 택했는지)
2. `docs/design-spec.md` — 1차 구현 지시서(deep-reasoner). 모듈/알고리즘/프롬프트/시나리오 33개
3. `docs/discord-dom-facts.md` — 실제 디스코드 DOM 관측치(셀렉터 근거)
4. `docs/design-alt-codex.md`, `docs/design-brief.md` — 참고

## 현재 상태
- [x] 설계 확정, DOM 실측, 용어집 45항목
- [x] 구현 및 배포: **v0.2.0이 main에 머지됨** (PR #1 v0.1.2 버그수정 + PR #2 커스텀 프로바이더)
- [x] 하네스 헤드리스 최종 검증 — **37/37 PASS, 네트워크 0건** (아래 "검증 방법")
- [x] README(한국어) 완성 (커스텀 프로바이더 절 포함)
- [ ] **실사용 개통 (진행 중, 아래 "미해결" 절)**: 집 Mac은 중복 설치 정리부터, 회사 PC는 신규 설치
- [ ] 실제 번역 1회 확인 (Anthropic $5 크레딧 충전됨, 401 이슈로 새 키 재발급 필요할 수 있음)

## 설치 트러블슈팅 — 실전에서 겪은 것 전부 (새 PC 설치 시 이 순서대로)
1. **Tampermonkey 실행 권한**: `chrome://extensions` → Tampermonkey 세부정보 → **"사용자 스크립트 허용" ON** (없으면 우측 상단 개발자 모드 ON) → **Chrome 완전 재시작**. 이걸 안 켜면 설치 시 "이 웹사이트에서 앱, 확장 프로그램, 사용자 스크립트 등을 추가할 수 없습니다" 배너가 뜨고, 설치돼 있어도 **페이지에 주입 자체가 안 된다** (조용히 아무 일도 안 일어남).
2. **설치는 raw URL로 딱 한 번**: `https://raw.githubusercontent.com/godoriii/discord-translator/main/discord-inline-translate.user.js`. 편집기 수동 생성본과 URL 설치본이 공존하면 **TM 배지가 2**가 되고, 복사본마다 저장소가 분리돼 **한쪽에 키를 넣어도 다른 쪽이 401 토스트를 계속 띄운다**. 대시보드에서 설정 탭에 업데이트 URL이 없는 쪽(수동본)을 삭제하고 배지 1 확인.
3. **401 이후엔 반드시 '번역 활성화' 재체크**: "API 키가 거부되었습니다"가 한 번 뜨면 스크립트가 `enabled=false`를 **영구 저장**한다. 키를 고쳐도 이 체크를 다시 안 켜면 오류 없이 조용히 아무것도 안 한다.
4. **키 입력**: 콘솔에서 발급 직후 복사 버튼으로 전체 복사. 설정창 키 칸은 항상 빈 칸으로 열리는데, 비밀번호 관리자 자동완성이 끼어들어 엉뚱한 값으로 저장되면 401이 난다 (실제로 한 번 발생한 것으로 추정 — 의심되면 새 키 발급이 가장 빠름). v0.2.0부터 저장 시 공백/줄바꿈 자동 제거.
5. **설정창 타이핑이 채팅창으로 새는 문제**는 v0.2.0에서 수정됨 — 입력이 안 되면 아직 v0.1.2라는 뜻이니 TM에서 업데이트 확인.
6. **막히면**: discord.com에서 TM 메뉴 → **"진단 복사"** → 내용을 Claude에게 붙여넣기 (Detect 상태·버전·셀렉터 매칭이 다 나옴).

## 미해결 (2026-09-01 밤 기준)
- **집 Mac**: 스크립트 주입은 확인됐으나 번역 미동작 + TM 배지 2 (중복 설치 의심). 위 트러블슈팅 2→3→4 순서로 정리하면 될 것으로 추정. Anthropic 키는 401 사건 이후 새로 발급 권장.
- **회사 PC**: v0.2.0 신규 설치 대상 (위 1번부터 순서대로).
- 참고: 이전 effort 400 오류(Haiku 선택 시 전 요청 실패)는 v0.2.0에서 수정 완료.

## 2026-09-01 세션에서 찾아 고친 것 (v0.1.2)

이전 세션의 "headless CPU 100% / 백그라운드 28/34" 미스터리는 전부 규명됐다.

1. **Queue 무한 재큐 루프 (렌더러 프리즈의 진범)** — 파싱 실패/max_tokens/fatal 응답에서 `_bisect`가 조각을 큐에 되넣으면 `tick`의 배치 패커가 즉시 같은 배치로 재병합했고, attempts까지 0으로 리셋해 탈출 조건에 영원히 못 닿았다 (브라우저 워치독 실측: `_requeueSameBatch` 7,146회 ↔ `_bisect` 7,142회 교대; Codex/Opus 교차 검증 일치). **수정**: `_bisect`가 조각을 `Queue._send`로 직접 전송(재병합 원천 차단, 이분할마다 크기 절반 → 종료 보장), attempts 리셋 제거, pausedUntil/enabled 게이트 준수.
2. **mock 동기 resolve** — 재시도 사이클이 양보 없는 microtask 체인이 되어 탭을 프리즈시켰다. **수정**: mock 응답 `setTimeout(0)` macrotask화 (실 API 경로 무변경).
3. **실패 후 자동 재큐 루프 (실서비스 과금 버그)** — `_markFailed` 1ms 뒤 reconcile이 error 블록 메시지를 도로 enqueue(→`failed` 삭제) → 지속 서버 오류 시 무한 API 재시도. **수정**: reconcile/reconcileEmbeds에 `failed` 가드 (수동 재시도 버튼 설계 의도대로).
4. **용어집 rev 재번역 로직이 죽은 코드였음** — done 블록이 마운트된 상태(일반 케이스)에서는 rev 비교 지점에 도달하기 전에 return. **수정**: `glossaryRecheck` 헬퍼로 추출해 done-블록 경로에서도 호출.
5. **좀비 backoff 타이머** — `_scheduleRetry` 타이머가 정지/리셋 후에도 발화해 stale 배치를 주입. **수정**: `State.queue.retryTimers`로 추적, `_stopAll`과 하네스 `resetState`에서 취소.
6. **하네스 픽스처 DOM 중첩이 실제와 반대** — 픽스처가 `scrollerContent > scroller` 순서로 만들어 셀렉터가 스크롤 불가능한 요소를 잡았고, `nearBottom`이 항상 true였다 (시나리오 23·28이 실디스코드에선 올바른 동작에 대해 실패). **수정**: 실측 체인(`messagesWrapper > scroller > scrollerContent > ol`)대로 재정렬 + `addMessage`에 디스코드식 하단 고정(auto-pin) 에뮬레이션.

## 검증 방법
- `node --check discord-inline-translate.user.js`
- **헤드리스 전체 검증(권장, 사람 개입 불필요)**: 리포 루트에서
  ```
  python3 -m http.server 8899 --bind 127.0.0.1 &
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
    --no-first-run --mute-audio --disable-background-timer-throttling \
    --disable-renderer-backgrounding --user-data-dir=/tmp/dcxlt-ci \
    --enable-logging=stderr --v=0 \
    "http://127.0.0.1:8899/test/harness.html?autorun=1" 2>&1 | grep DCXLT_SUMMARY
  ```
  `DCXLT_SUMMARY pass=37 fail=0 skipped=0 xhr=0` 이 나와야 한다 (v0.2.0부터 37 = 시나리오 36 + 네트워크 어서션). (완주 후 크롬은 직접 kill)
  - 참고: `--virtual-time-budget`은 영구 setInterval과 상극이라 여전히 금지. 위처럼 실시간 타이머 + 스로틀링 비활성 플래그로 돌린다.
  - 하네스 디버그 파라미터: `&only=3,17,28`(부분 실행), `&spy=1`(큐 이벤트 `DCXLT_TRACE` 콘솔 트레이스), 완주 시 `DCXLT_RESULTS <json>` 콘솔 라인으로 시나리오별 결과 수집 가능.
- 포그라운드 브라우저에서 보고 싶으면: `http://127.0.0.1:8899/test/harness.html` 을 **화면에 보이는 탭**으로 열고 `await __DCXLT_TEST__.runAll()`. (hidden 탭은 타이머 스로틀링 때문에 타이밍 시나리오가 가짜로 실패한다 — 이전 세션의 "백그라운드 28/34"가 그것)
- 실제 페이지 스모크: DevTools 콘솔에서 `test/inject-shim.js` 내용 실행 → 이어서 유저스크립트 본문 실행 → `window.__DCXLT__` 로 탐지 수 확인

## 남은 개선 아이디어 (선택)
- max_tokens 다항목 배치를 태우는 mock 모드 + 시나리오 추가 (현재 스위트는 이 경로를 다항목으로 커버하지 않음 — Opus 분석 지적)
- `_bisect` 직접 전송은 이분할 순간에 동시성 한도를 일시 초과할 수 있음(최대 BATCH_MAX_ITEMS=8, 유계). 문제되면 큐 기반 + 재병합 차단(maxBatch 태그) 방식으로 교체 검토.

## v0.2.0 — 커스텀 프로바이더 (2026-09-01)

Anthropic 외에 **OpenAI 호환 chat/completions API 전부**(Gemini/OpenRouter/Groq/Ollama/OpenAI …)를 설정 패널에서 연결 가능. 내부 표현은 Anthropic 형식 그대로 두고 `Api._toOpenAI`/`_fromOpenAI` 순수 변환 함수로 전송/수신만 어댑팅 — mock·파서·큐 로직 무변경. 프리셋 4종(설정 → 일반 → 프로바이더), 커스텀 키는 `dcxlt.customApiKey`에 별도 저장, `@connect`에 주요 도메인 추가(그 외 도메인은 TM이 첫 요청 때 물어봄). 하네스 시나리오 34·35가 변환 함수를 검증.

## 진행 로그
- 08-31 18:40 GitHub 공개 리포 생성·초기 스냅샷 푸시 (사용자 승인)
- 08-31 19:10 구현 워커 1차 완료: 하네스 34 중 28 PASS → 헤드리스 재검증 지시
- 08-31 23:15 v0.1.1 푸시(실디스코드 스모크 PASS 버전)
- 08-31 23:25 회사 머신에서 인계
- 09-01 00:00~01:30 집 세션: 프리즈 재현 → 워치독으로 무한 루프 실측 특정(시나리오 18 방아쇠) → Codex/Opus 교차 검증 → 위 6건 수정 → **헤드리스 34/34 PASS 2회 연속** → v0.1.2 (PR #1 머지·배포)
- 09-01 01:30~02:30 집 세션: v0.2.0 개발·머지·배포 (커스텀 프로바이더 + effort 400 수정 + 설정창 키 가로채기 수정 + 키 trim, 하네스 37/37). 실사용 개통 시도 중 TM 권한/중복 설치/401 이슈 연쇄 발견 → 위 트러블슈팅 절에 정리, 미해결 상태로 회사 인계
