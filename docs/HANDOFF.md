# HANDOFF — 다른 기기에서 이어서 작업하기

> 최종 갱신: 2026-09-02. v0.4.0 — 메시지별 `[▶ 번역]` 버튼 + 수동 모드 기본화(기존 `autoTranslate` 은퇴, `translateMode` 신설), 위젯을 **⚡ 전체 번역**(1회성 일괄 큐잉, 임베드 포함)으로 전환. 시나리오 49-54 추가, 하네스 55/55 클린 통과.

## 이 프로젝트가 무엇인가
Chrome + Tampermonkey 유저스크립트. 웹 디스코드(discord.com) 채팅 메시지를 Claude API로 한국어 인라인 번역하고, 사용자 용어집(`glossary.json`, WoW 공식 한국어 명칭)을 강제 적용한다. Windows/Mac 동일 스크립트 한 벌, GitHub raw URL로 자동 업데이트.

## 문서 읽는 순서 (새 Claude Code 세션에 "docs/ 를 읽고 이어서 해줘" 라고 하면 됨)
1. `docs/decisions.md` — 오케스트레이터 최종 결정(무엇을 왜 택했는지)
2. `docs/design-spec.md` — 1차 구현 지시서(deep-reasoner). 모듈/알고리즘/프롬프트/시나리오 33개
3. `docs/discord-dom-facts.md` — 실제 디스코드 DOM 관측치(셀렉터 근거)
4. `docs/design-alt-codex.md`, `docs/design-brief.md` — 참고

## 현재 상태
- [x] 설계 확정, DOM 실측, 용어집 45항목
- [x] 구현 (`discord-inline-translate.user.js`, v0.2.2)
- [x] 실제 디스코드 탭 mock 주입 스모크 테스트 — 전 항목 PASS (v0.1.1 기준; 이후 변경은 큐 실패경로/mock/설정 패널 한정이라 영향 없음, 그래도 설치 후 1회 재확인 권장)
- [x] **하네스 42 시나리오 헤드리스 최종 검증 — 43/43 PASS(네트워크 어서션 포함), 네트워크 0건** (2026-09-01, 아래 "검증 방법" 참조)
- [x] README(한국어) 완성, GitHub 푸시
- [x] API 키 넣고 실제 번역 확인 (키는 Tampermonkey 설정 패널에 사용자가 직접 입력) — 2026-09-01 사용자 확인
- [x] 양쪽 PC 설치 + API 키 입력 + 실제 번역 1회 확인 — 2026-09-01 사용자 확인

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
  `DCXLT_SUMMARY pass=55 fail=0 skipped=0 xhr=0` 이 나와야 한다 (54 시나리오 + 네트워크 어서션 = 55). (완주 후 크롬은 직접 kill)
  - 참고: `--virtual-time-budget`은 영구 setInterval과 상극이라 여전히 금지. 위처럼 실시간 타이머 + 스로틀링 비활성 플래그로 돌린다.
  - 하네스 디버그 파라미터: `&only=3,17,28`(부분 실행), `&spy=1`(큐 이벤트 `DCXLT_TRACE` 콘솔 트레이스), 완주 시 `DCXLT_RESULTS <json>` 콘솔 라인으로 시나리오별 결과 수집 가능.
- 포그라운드 브라우저에서 보고 싶으면: `http://127.0.0.1:8899/test/harness.html` 을 **화면에 보이는 탭**으로 열고 `await __DCXLT_TEST__.runAll()`. (hidden 탭은 타이머 스로틀링 때문에 타이밍 시나리오가 가짜로 실패한다 — 이전 세션의 "백그라운드 28/34"가 그것)
- 실제 페이지 스모크: DevTools 콘솔에서 `test/inject-shim.js` 내용 실행 → 이어서 유저스크립트 본문 실행 → `window.__DCXLT__` 로 탐지 수 확인

## 남은 개선 아이디어 (선택)
- ~~max_tokens 다항목 배치를 태우는 mock 모드 + 시나리오 추가 (현재 스위트는 이 경로를 다항목으로 커버하지 않음 — Opus 분석 지적)~~ → 완료(시나리오 37·38, mock 모드 maxtokens/maxtokens_always)
- ~~`_bisect` 직접 전송 동시성 초과~~ → v0.2.1에서 해결. 실측 결과 진짜 문제는 초과(실제 최대 MAX_CONCURRENT×BATCH_MAX_ITEMS=16, 문서엔 8로 오기)가 아니라 **max_tokens(200) ↔ 429 교대 시 되병합 무한루프**였다(아래 v0.2.1 참조).

## v0.2.0 — 커스텀 프로바이더 (2026-09-01)

Anthropic 외에 **OpenAI 호환 chat/completions API 전부**(Gemini/OpenRouter/Groq/Ollama/OpenAI …)를 설정 패널에서 연결 가능. 내부 표현은 Anthropic 형식 그대로 두고 `Api._toOpenAI`/`_fromOpenAI` 순수 변환 함수로 전송/수신만 어댑팅 — mock·파서·큐 로직 무변경. 프리셋 4종(설정 → 일반 → 프로바이더), 커스텀 키는 `dcxlt.customApiKey`에 별도 저장, `@connect`에 주요 도메인 추가(그 외 도메인은 TM이 첫 요청 때 물어봄). 하네스 시나리오 34·35가 변환 함수를 검증.

## v0.2.1 — _bisect 세마포어 + 되병합 차단 (2026-09-01)

되병합 무한루프 실측: (1) `onResponse`가 상태 200이면 무조건(비커밋 max_tokens 포함) `consecutiveRateLimits`를 0으로 리셋해 서킷브레이커(`>=3`)가 영원히 못 걸렸고, (2) 429 분기의 `_requeueSameBatch`엔 재시도 상한이 없었으며, (3) 되큐된 조각을 `tick`의 패커가 `BATCH_MAX_ITEMS`(8)까지 그대로 재병합해 방금 실패한 배치를 그대로 재구성 — 8개 배치가 max_tokens(200)↔429를 교대하며 초당 ~3회 무계 재시도(livelock)로 수렴했다(시나리오 39로 재현).

수정: `_bisect`가 조각을 `currentConcurrency` 세마포어로 게이팅해 직접 전송(`_armPump`로 재무장하고 타이머는 `retryTimers`에 추적), 조각마다 `maxBatch` 상한을 태깅해 패커가 이를 존중(어떤 재큐 경로를 거쳐도 실패한 배치를 재구성 못 함), `consecutiveRateLimits`는 실제로 번역을 커밋하는 응답에서만 리셋, 전송 대기 중인 조각(`_pendingParts`)을 `Queue.has`/`tick`/`_stopAll`에 노출.

실측 효과: 피크 in-flight 8→2(단일 이분할), 16→2(MAX_CONCURRENT×BATCH_MAX_ITEMS 최악 조합); 이분할 사다리 요청 수는 그대로 2N−1; livelock(33+ 전송/11초 관측)이 ≤8회 호출 후 60초 서킷브레이커 일시정지로 수렴.

트레이드오프: 세마포어로 조각 전송이 순차화되어 max_tokens 복구 체감 지연이 약 2배로 늘지만, 요청 수 자체는 불변.

Codex/Opus 교차 검증: Codex는 "피크가 BATCH_MAX_ITEMS=8로 유계이니 현상 유지 + 좀비 타이머만 추적" 의견이었고, Opus(deep-reasoner)는 실측 재현으로 되병합 무한루프를 지적 — 재현 결과를 근거로 Opus 쪽 수정을 채택.

참고(후속 과제): `Queue.dropChannel`이 `_pendingParts`를 필터링하지 않는다(채널 전환 시 대기 중인 조각이 남을 수 있음, pre-existing 이슈).

## v0.2.2 — 첫 사용 함정 제거 (2026-09-01)

실사용 증상: API 키를 넣기 전에 이미 열려 있던 디스코드 탭이 빈 키로 요청을 보내 401을 받았고, 인증 실패 핸들러가 `cfg.enabled=false`를 `Store.saveSettings`로 영구 저장한 뒤 큐를 전면 정지시켰다. 이후 설정 패널에서 키를 제대로 입력해도 다시 켜지는 경로가 전혀 없어 스크립트가 로그도 칩도 없이 영구히 무음 상태가 됐다(근본 원인).

수정 4가지: (1) `Api.configured()` 가드를 `reconcile()`/`Viewport.translateVisibleNow()`/`Queue.retry()` 앞에 달아 키(또는 커스텀 프로바이더는 Base URL)가 없으면 애초에 요청을 큐에 넣지 않고 `UI.promptForKey()`로 안내, (2) 인증 실패 시 `disabledReason:'auth'`를 남기고 `UI.reenableAfterAuth()`가 새 키/커스텀 키/Base URL 저장 시 자동으로 `enabled:true`로 되돌림(끊긴 채로 남아있던 메시지 블록도 함께 정리해 재조정이 즉시 재시도하도록 함), (3) 설정 패널에 **연결 테스트** 버튼(`Api.testConnection`, `Api.request(body, opts)`로 키 오버라이드)과 마스킹된 저장-키 힌트 추가, (4) 패널 저장 핸들러가 키 필드를 먼저 처리해 stale한(꺼져 있던 시점에 채워진) `번역 활성화` 체크박스가 방금 일어난 자동 재활성화를 되돌리지 않도록 순서 조정.

시나리오 40(키 없음 → 0건 + 안내 → 키 저장 즉시 시작), 41(401 → 자동 재활성화 → 패널 경로 회귀 방지), 42(연결 테스트 버튼) 추가. 하네스 42 시나리오, 43/43 PASS(네트워크 어서션 포함) 2회 연속.

## v0.3.0 — "매번 새로고침해야 하나" 근본 수정 + 영구 번역 기록 + 위젯 (2026-09-01)

### 근본 원인 (BUG #1, 헤드라인)

`reconcile()`의 per-node 루프가 마운트된 메시지 id를 **무조건** `seen`에 추가한 뒤, 스윕 끝에서 `State.previousSeen = seen`으로 통째로 교체했다. `decidePriority`의 `nearBottom && isNewlyMounted → priority 0`(라이브 경로)은 "방금 마운트됐다"는 자격을 **꼭 한 번의 스윕**에서만 쓸 수 있는데, 사용자가 스크롤을 올린 상태(`nearBottom=false`)에서 메시지가 마운트되면 그 스윕에서 아무것도 처리하지 못하면서도 `seen`엔 id가 기록돼 다음 스윕부턴 영원히 "새로 마운트된 게 아님" 취급을 받았다. 남은 경로는 400ms dwell + 분당 40건 백필 버킷뿐인데, 스크롤업 직후엔 그 버킷이 이미 비어 있는 경우가 흔해 메시지가 **영구히 번역되지 않고 멈췄다.** 새로고침만이 `previousSeen`을 초기화해 모든 메시지를 다시 "새로 마운트됨"으로 만드는 유일한 사용자 접근 경로였다 — 이것이 "매번 새로고침해야 번역된다"의 정체.

실측 (계측된 프로브, 수정 전/후 동일 빌드):
```
BEFORE  D after 1s scrolled-up:    enq=0 block=none previousSeen.has=true
        D after scroll-to-bottom:  enq=0 block=none            ← 영구 정체
AFTER   D after 1s scrolled-up:    enq=0 block=none previousSeen.has=false
        D after scroll-to-bottom:  enq=1 block=done
        D DONE-WITHOUT-DWELL ms=0                              ← priority 0, dwell/버킷 미사용
```

**수정**: `seen`(마운트된 전부 — 블록 GC·임베드용)과 `resolved`(이번 스윕에서 실제로 *처리*된 것만)를 분리하고, `State.previousSeen = resolved`로 바꿨다. 아무것도 하지 못한 스윕에서는 "새로 마운트됨" 자격이 다음 스윕까지 그대로 남는다.

부수 버그 2건도 같이 고쳤다: (2) Alt+T로 다시 켰을 때 `reconcile()`을 즉시 호출하지 않아 1500ms 폴링 인터벌을 기다려야 했던 것(위젯의 `⏸ 꺼짐` → 클릭 재활성화 경로에서 특히 중요해짐), (3) `Viewport.attach`가 채널 전환마다 새 `IntersectionObserver`를 만들면서 이전 것을 `disconnect()`하지 않아, 낡은 관찰자의 뒤늦은 `onLeave` 콜백이 msgId 기준으로 방금 무장한 dwell 타이머를 취소해 버리던 문제(오브젝트·타이머 누수 겸).

### 영구 번역 기록 (`History`, `dcxlt.history.v1`)

TCache는 `msgId|hash|targetLang|model`로 키가 잡혀 있어 모델을 바꾸거나 LRU에서 밀리면 번역이 통째로 고아가 된다. `History`는 `id|hash`만으로 키를 잡아 모델/언어와 무관하게 살아남는 별도 저장소다. `Queue._commit`에서 커밋될 때마다(skip 제외) 함께 적재되고, `reconcile`/`reconcileEmbeds`/`Viewport.translateVisibleNow`가 TCache 미스 시 `historyRestore()`로 즉시 폴백 렌더한 뒤 현재 모델 키로 TCache를 다시 데운다 — 새로고침·모델 변경·캐시 축출 어느 쪽에서도 번역이 사라지지 않는 이유다.

`ko`는 `{{n}}` 마커를 유지한 원형 그대로 저장한다(렌더용). `Extract.rehydrate`가 매칭 안 되는 `{{n}}` 토큰을 조용히 지워버리기 때문에, 마커와 짝을 이루는 `placeholders` 배열(`ph`, 항목당 최대 12개, `raw`는 400B 넘으면 버리고 `label`만 남김)을 같이 저장하지 않으면 복원된 번역에서 멘션·링크·이모지·코드가 전부 사라진다. `gv`/`gt`(용어집 rev·매칭 목록)도 원본 그대로 저장해 `historyRestore`가 `glossaryRecheck`를 예전과 동일하게 재현할 수 있게 했다 — 현재 rev를 찍어버리면 용어집 변경 재번역이 조용히 죽는다. 항목 수 2000 / 3MB 상한을 `flush()` 한 번의 O(n) 패스로 강제(TCache의 O(n²) 초과-바이트 while 루프보다 낫다), `pagehide`를 `beforeunload` 옆에 추가해 배치 flush 창이 열린 채 언로드되는 경로를 막았다.

### 플로팅 위젯 + 번역 기록 오버레이

우측 하단 알약 버튼(`#dcxlt-widget-host`, v0.4.0부터 `⚡ 전체 번역`/배지/모드 칩(`수동`/`자동`)/`☰`/`⚙`, 꺼짐일 때 `⏸ 꺼짐`)이 항상 떠서 화면의 메시지를 스크롤·dwell·백필 예산과 무관하게 즉시 번역한다. `reconcile`이 아니라 `setInterval(Widget.ensure, 2000)`으로 독립 유지되는 이유: `reconcile`은 `cfg.enabled=false`면 즉시 return하는데, 위젯은 바로 그 순간 `⏸ 꺼짐`을 보여줘야 한다. 클릭이 포커스를 뺏지 않도록 `tabindex="-1"` + `mousedown` `preventDefault`.

`#dcxlt-history-host`(별도 shadow host, 설정 패널의 560px 모달과 분리 — 표 형태엔 내부 스크롤 영역이 필요하고 설정 호스트를 건드리면 시나리오 42가 검증하는 shadow 구조가 흔들린다)는 날짜→채널로 그룹핑된 기록을 검색/채널 필터/복사·이동·삭제/`.txt`·`.json` 내보내기(`Blob`+`<a download>`, 하네스가 스텁할 수 있도록 `_download()`로 분리)/2단계 `기록 지우기`(`window.confirm` 미사용 — 하네스·디스코드 이벤트 루프를 막기 때문)로 보여준다. 메뉴 **번역 기록**, 단축키 **Alt+H**, 위젯 **☰**로 연다.

### 시나리오 43-46

43(기록 적재·중복 교체·2000건 FIFO 상한), 44(캐시 비우기/모델 변경 후 기록 폴백 렌더로 즉시 복원, API 재호출 없음), 45(오버레이 열기/검색/채널 필터/내보내기/개별 삭제/2단계 전체 지우기, 캐시 비우기와 분리 확인), 46((A) 스크롤업 중 도착 → 하단 복귀 시 즉시 번역되는 Part1 회귀 확인, (B) 위젯 버튼으로 백필 제약 무시 즉시 번역, (C) 꺼짐 표시/재활성화, (D) `showWidget` 토글, (E) Alt+T 재활성화 즉시 reconcile). 하네스 46 시나리오, 47/47 PASS(네트워크 어서션 포함) 2회 연속.

## v0.3.1 — 기록 캐시 백필 + 자동완성 API 키 오염 방지 (2026-09-01)

실제 디스코드 탭에서 두 가지 문제를 발견해 같은 세션에서 고쳤다.

1. **번역 기록 "0 / 0건"** — v0.3.0의 `History.append`는 `Queue._commit`(신규 번역이 API에서 도착한 순간)에서만 호출됐다. TCache 히트로 렌더된 메시지(v0.3.0 이전에 이미 번역된 메시지 포함)는 한 번도 `Queue._commit`을 거치지 않으므로 기록에 전혀 안 잡혔다 — 화면은 번역으로 가득한데 오버레이는 `0 / 0건`. **수정**: `Queue._commit`이 쓰던 엔트리 조립 로직을 `History.fromItem(item, ch, entry)`로 추출하고, `reconcile`/`reconcileEmbeds`/`Viewport.translateVisibleNow`의 TCache 히트 분기에서 `History.recordFromCache(item, ch, hit)`를 호출해 아직 기록에 없는 항목만 소급 적재한다(원래 번역 시각 `tt`는 TCache의 `ts`를 그대로 써 목록 정렬이 "방금 백필됨"으로 왜곡되지 않게 함, API 재호출 없음, 멱등). 시나리오 47.
2. **브라우저 비밀번호 자동완성이 API 키 칸을 오염** — 설정 패널의 `<input type="password" data-f="apiKey">`가 Chrome 저장 비밀번호(디스코드 로그인 비번 등)의 자동완성 타깃이 됐다. 연결 테스트를 누르면 그 값이 `x-api-key`로 전송돼 `키 거부 (401)`가 뜨는데(정작 저장된 실 키로는 번역이 잘 됨), **더 나쁘게는** 저장 버튼을 누르면 `if (key) Store.setApiKey(key)`가 멀쩡히 동작하던 키를 그 값으로 덮어써 실사용 번역까지 401로 끊기는 함정이었다. `[data-f="customApiKey"]`도 동일 위험. **수정**: 두 입력을 `type="text"` + `-webkit-text-security:disc`(시각적 마스킹 유지, Chrome이 저장된 비밀번호를 넣지 않는 타입) + `autocomplete="off"`/무작위 `name`으로 바꾸고, 패널을 열 때마다(및 300ms 뒤 한 번 더, 비동기 자동완성 대비) 입력칸을 강제로 비운다. `Api.looksLikeAnthropicKey`(`sk-ant-` 접두사)로 저장 직전·연결 테스트 직전 형식을 검증해, 형식이 안 맞으면 저장을 거부하고 안내 토스트를 띄운 뒤 칸을 비운다(커스텀 키는 공백 포함 여부만 보는 약한 검사). 시나리오 48.

## v0.4.0 — 메시지별 번역 버튼 + 수동 모드 기본화 (2026-09-02)

제품 요구사항 원문: "메세지 옆에 번역버튼을 만들어서 필요한 메세지만 번역을 하는걸로 기본 설정을 바꾸자. 기존에 있던 번역 시작버튼을 전체번역 버튼으로 용도를 바꿔줘." 결정 사항은 오케스트레이터가 사전에 확정했고(구현 지시서 기반), 구현 워커는 그대로 실행했다.

### `translateMode` 키와 마이그레이션
기존 `autoTranslate: true`(`DEFAULTS`) 자리를 `translateMode: 'manual'`로 완전히 대체했다 — `autoTranslate`는 `DEFAULTS`/설정 패널/`decidePriority`/`_fillFromCfg`/저장 패치 전부에서 은퇴시켰고 재해석 코드도 넣지 않았다. 저장소에 남은 v0.3.x 설정에는 `translateMode` 키가 아예 없으므로 `Object.assign({}, DEFAULTS, stored)` 병합만으로 자동으로 `'manual'`이 된다 — **키 부재 = manual이 곧 마이그레이션**이다. 별도 마이그레이션 스크립트는 필요 없지만, 알 수 없는 값(`'zzz'` 등) 방어를 위해 순수 함수 `Store.migrate(stored)`를 신설해 `Store.load()`가 이를 통해서만 `cfg`를 만들도록 했다. 부작용이 없어 하네스가 저장소를 건드리지 않고도 마이그레이션 자체를 검증할 수 있다(시나리오 49-A).

### 버튼을 별도 요소가 아니라 `div.dcxlt`의 `data-state="manual"`로 구현한 이유
메시지당 이미 존재하는 번역 블록(`div.dcxlt[data-dcxlt-id]`)에 신규 상태 `'manual'`을 추가하고 그 안에 `<button class="dcxlt-mbtn">▶ 번역</button>`을 심어, 상태에 따라 `hidden`만 토글하는 방식을 택했다. 이유:
- **멱등 주입** — `Render.upsert`가 `blockFor(msgId)`로 기존 블록을 찾아 재사용하므로 reconcile이 몇 번 돌아도 버튼이 중복 생기지 않는다.
- **가상 리스트 재마운트 생존** — 언마운트 시 `Render.activeIds()` GC가 정리하고, 재마운트 시 다음 스윕이 done/loading 블록과 동일한 경로로 다시 그린다.
- **해시 오염 회피** — 버튼을 콘텐츠 노드(`#message-content-*`) 안에 넣으면 `Extract.walkChildren`이 버튼 텍스트까지 원문에 섞어 해시가 흔들리고 캐시가 전부 무효화된다. `div.dcxlt`는 `Extract`가 절대 워킹하지 않는 형제 요소라 안전하다.
- 죽어 있던 `state === 'skipped-manual'` 분기(호출처 0곳, 이번 기능의 초기 설계 잔재)를 `'manual'` 분기로 교체해 재사용했다.

### reconcile fast-path에서 `manual` 상태만 자동 모드일 때 통과시키는 이유
`reconcile`/`reconcileEmbeds`의 fast-path는 해시가 같은 기존 블록을 만나면 조기 return해 스윕 비용을 아낀다. 그런데 `manual` 블록은 무조건 조기 return시키면 **모드를 자동으로 바꿔도 이미 그려진 수동 버튼이 영원히 그대로 남는다**(다시는 큐잉되지 않음). 그래서 `existing.dataset.state === 'manual'`일 때만 별도 분기를 둬 `cfg.translateMode !== 'auto'`인 동안만 return하고, 자동으로 바뀐 뒤에는 아래로 흘려보내 정상 큐잉 경로를 타게 했다. 시나리오 54(D)가 정확히 이 회귀를 잡는다.

### 모드 전환 시 `State.previousSeen`을 비워야 하는 이유
수동 대기 블록도 매 스윕에서 `resolved`(→ 다음 스윕의 `previousSeen`)에 들어간다. 모드를 자동으로 바꾼 직후의 스윕이 `previousSeen`을 그대로 물려받으면, 화면의 메시지를 전부 "이미 마운트된 적 있음"으로 보고 `decidePriority`의 라이브 경로(`nearBottom && isNewlyMounted → priority 0`)를 건너뛰어 백필 대기로 강등시킨다 — 결과적으로 "모드를 전환해도 아무 일도 안 일어난 것처럼 보이는" 버그가 된다. 설정 패널 저장 핸들러(모드가 바뀐 경우)와 위젯의 모드 칩 클릭(`Widget.onModeToggle`) 양쪽에서 `State.previousSeen = new Set()`로 초기화한다.

### 수동 모드에서 `glossaryRecheck`를 끄는 트레이드오프
"수동 모드에서는 스크립트가 스스로 API를 부르지 않는다"는 불변식을 용어집 rev 조건부 재번역보다 우선시켰다. `glossaryRecheck`에 `if (cfg.translateMode !== 'auto') return;` 가드를 추가해, 수동 모드에서는 용어집이 갱신돼도 이미 번역된 메시지가 자동으로 재번역되지 않는다(README/HANDOFF에 알려진 한계로 문서화, 자동 모드는 기존 그대로 동작 — 시나리오 28).

### 하네스 설계: 기존 48개 보존 + 제품 기본값은 별도 검증
`BASE_SETTINGS`(하네스 전용 독립 리터럴)에 `translateMode: 'auto'` 한 줄만 추가해 기존 48개 시나리오를 예전과 동일한 자동 모드로 유지했다(46번의 위젯 라벨 어서션 2곳만 `⚡ 전체 번역`로 수정). 반면 "진짜 제품 기본값이 manual인가"는 하네스 기본값에 속지 않도록 시나리오 49가 `window.__DCXLT__.DEFAULTS`(신규 디버그 익스포트)와 `Store.migrate()`를 직접 호출해 검증한다.

### 시나리오 49-54 요약
- **49** — 제품 기본값이 `manual`임을 `DEFAULTS`/`Store.migrate`로 직접 검증 + 수동 모드에서는 마운트/뷰포트 백필 어느 경로로도 API가 0건임을 확인.
- **50** — `[▶ 번역]` 버튼이 번역 대상에만 노출되고(skip 대상엔 없음), 재조정 반복에도 멱등하며, 가상 리스트 재마운트 후에도 다시 나타남을 확인.
- **51** — 버튼 클릭이 정확히 그 메시지 1건만 큐잉함(요청 1건, 재클릭 멱등)을 확인. **추가 델타**: API 키가 사후에 지워진 상태에서 버튼을 누르면 `UI.promptForKey()`로만 이어지고 요청 0건, 블록은 `manual`로 남는 안전망 경로도 같은 시나리오에서 검증(시나리오 개수는 유지).
- **52** — 수동 모드에서도 TCache/History 히트는 클릭 없이 즉시 렌더되고 `History.recordFromCache` 백필도 그대로 동작함(API 0건)을 확인.
- **53** — 위젯 `⚡ 전체 번역`이 화면의 대상(임베드 포함)을 일괄 큐잉하는 1회성 동작이며, 클릭 이후 새로 도착한 메시지는 다시 수동 대기로 남음을 확인.
- **54** — 설정 패널 저장으로 모드가 영속되고, 위젯 모드 칩으로 왕복 전환되며, 전환 시 대기 중이던 수동 블록이 즉시 번역되고(R1 회귀 방지), 패널 재오픈이 최신 모드를 반영함을 확인.

하네스 55개(54 시나리오 + 네트워크 어서션 1) 전원 `PASS`, `DCXLT_SUMMARY pass=55 fail=0 skipped=0 xhr=0` 2회 연속.

## 진행 로그
- 08-31 18:40 GitHub 공개 리포 생성·초기 스냅샷 푸시 (사용자 승인)
- 08-31 19:10 구현 워커 1차 완료: 하네스 34 중 28 PASS → 헤드리스 재검증 지시
- 08-31 23:15 v0.1.1 푸시(실디스코드 스모크 PASS 버전)
- 08-31 23:25 회사 머신에서 인계
- 09-01 00:00~01:30 집 세션: 프리즈 재현 → 워치독으로 무한 루프 실측 특정(시나리오 18 방아쇠) → Codex/Opus 교차 검증 → 위 6건 수정 → **헤드리스 34/34 PASS 2회 연속** → v0.1.2
- 09-01 (오전) max_tokens 다항목 배치 mock 모드 2종 + 시나리오 37·38 추가, 헤드리스 39/39
- 09-01 (오전) _bisect 되병합 무한루프 재현(시나리오 39) → 세마포어+maxBatch 수정 → 헤드리스 40/40 → v0.2.1
- 09-01 사용자: 양쪽 PC 설치 + API 키 입력 + 실번역 확인 완료 → 현재 상태 체크리스트 전부 완료
- 09-01 (오후) 실사용 디버깅: 키 입력 전 로드된 탭 → 401 → enabled:false 영구화 확인 → 키 가드/자동 재활성화/연결 테스트/README 트러블슈팅 → 43/43 → v0.2.2
- 09-01 (오후) "매번 새로고침해야 한다" 제보 → 계측 프로브로 `previousSeen` 영구 강등 버그 특정 → `seen`/`resolved` 분리 수정(pre-flight 43/43 회귀 없음 확인) → 영구 번역 기록(`History`)·폴백 렌더·플로팅 위젯·번역 기록 오버레이 구현 → 시나리오 43-46 추가 → 헤드리스 47/47 PASS 2회 연속 → v0.3.0
- 09-01 (오후) 실디스코드 재확인 중 "번역 기록 0/0건"(TCache 히트 렌더가 History를 거치지 않음)과 자동완성 API 키 오염(설정 패널 `type=password`가 저장된 디스코드 비번을 채워 저장/연결 테스트를 401로 깨뜨림)을 함께 발견 → `History.fromItem`/`recordFromCache`로 캐시 히트 백필 + `Api.looksLikeAnthropicKey` 형식 검증·`type=text` 자동완성 차단 수정 → 시나리오 47-48 추가 → 헤드리스 49/49 PASS 2회 연속 → v0.3.1
