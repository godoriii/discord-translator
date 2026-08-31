# HANDOFF — 다른 기기에서 이어서 작업하기

> 최종 갱신: 2026-08-31 23:25 (회사 Mac 세션에서 인계). 집 컴퓨터에서 이어받기.

## 이 프로젝트가 무엇인가
Chrome + Tampermonkey 유저스크립트. 웹 디스코드(discord.com) 채팅 메시지를 Claude API로 한국어 인라인 번역하고, 사용자 용어집(`glossary.json`, WoW 공식 한국어 명칭)을 강제 적용한다. Windows/Mac 동일 스크립트 한 벌, GitHub raw URL로 자동 업데이트.

## 문서 읽는 순서 (새 Claude Code 세션에 "docs/ 를 읽고 이어서 해줘" 라고 하면 됨)
1. `docs/decisions.md` — 오케스트레이터 최종 결정(무엇을 왜 택했는지)
2. `docs/design-spec.md` — 1차 구현 지시서(deep-reasoner). 모듈/알고리즘/프롬프트/시나리오 33개
3. `docs/discord-dom-facts.md` — 실제 디스코드 DOM 관측치(셀렉터 근거)
4. `docs/design-alt-codex.md`, `docs/design-brief.md` — 참고

## 현재 상태
- [x] 설계 확정, DOM 실측, 용어집 45항목
- [x] 구현 (`discord-inline-translate.user.js` 2,193줄, v0.1.1)
- [x] 실제 디스코드 탭 mock 주입 스모크 테스트 — 전 항목 PASS (탐지 13/13, 렌더 위치, 플레이스홀더, edited 제외, 네트워크 0)
- [ ] 하네스 34 시나리오 헤드리스 최종 검증 (백그라운드 탭에선 스로틀링으로 28/34; headless CDP 재실행 중)
- [ ] API 키 넣고 실제 번역 확인 (키는 Tampermonkey 설정 패널에 사용자가 직접 입력)
- [x] README(한국어) 완성, GitHub 푸시
- [ ] 양쪽 PC 설치 + API 키 입력 + 실제 번역 1회 확인

## 집에서 시작하는 법
1. Chrome에 Tampermonkey 설치 → 리포의 raw URL(`https://raw.githubusercontent.com/godoriii/discord-translator/main/discord-inline-translate.user.js`)을 주소창에 열면 설치 창이 뜸.
2. Tampermonkey 메뉴 → "설정" → Anthropic API 키 입력, 모델 선택(기본 claude-opus-5).
3. discord.com 채널에 들어가면 영어 메시지 아래 번역이 붙음. Alt+T로 전체 토글.
4. 개발을 이어가려면 `git clone`, Claude Code 실행 후 "docs/HANDOFF.md 부터 읽고 남은 체크리스트 진행" 지시.

## 검증 방법
- `node --check discord-inline-translate.user.js`
- `test/harness.html` 을 Chrome에서 `file://` 로 열고 콘솔에서 `await __DCXLT_TEST__.runAll()` → 33개 PASS 확인 (mock API, 네트워크 0건)
- 실제 페이지 스모크: DevTools 콘솔에서 `test/inject-shim.js` 내용 실행 → 이어서 유저스크립트 본문 실행 → `window.__DCXLT__` 로 탐지 수 확인


## ⚠️ 집에서 가장 먼저 할 일 — 하네스 전체 실행 검증 (미완)
현재 **유저스크립트 자체는 실제 discord.com에서 스모크 테스트 전 항목 PASS**라 실사용은 문제없다.
막힌 것은 **자동 테스트 하네스(test/harness.html)의 34개 시나리오 클린 1회 통과**뿐이다.

관측된 증상:
- 백그라운드(hidden) 탭에서 돌리면 브라우저 타이머 스로틀링으로 28/34까지만(타이밍 의존 6개가 흔들림).
- headless Chrome `--virtual-time-budget` 로 돌리면 **끝나지 않고 렌더러 CPU 100% 고정**.
  - 원인 절반 확인: 유저스크립트가 영구 `setInterval` 2개를 건다 — `discord-inline-translate.user.js:2127`(reconcile), `:2129`(Queue.tick,100). 대기 타이머가 항상 있어 virtual time이 예산에 못 도달 → 무한 fast-forward.
- headless(가상시간 아님, 실시간 타이머)로 CDP 구동해도 렌더러 CPU 100% 고정이 재현됨 → **동기 무한 루프가 따로 있을 가능성**. 아직 위치 못 찾음. 확인해서 정상으로 보인 곳: `Glossary.match`(i 항상 전진), `rehydrate`(전역 regex lastIndex 전진), `_authorFor`(hops<15 bounded). 남은 의심: 시나리오 2("200ms 간격 5개 유입/디바운스 병합") 진입 후 멈춘 정황.

권장 진행 순서(집에서):
1. **포그라운드 보이는 일반 Chrome 탭**에서 검증하는 게 정석 — 하네스는 그 환경 기준으로 만들어짐. 로컬 서버 띄우고(`cd ~/discord-translator && python3 -m http.server 8765`) `http://127.0.0.1:8765/test/harness.html` 를 **활성 탭**으로 연 뒤 콘솔에서 `await __DCXLT_TEST__.runAll()`. (autorun은 `...?autorun=1`)
2. 그래도 특정 시나리오에서 CPU가 물리면, 시나리오별 워치독을 넣어 **어느 시나리오가 스핀하는지 이분 탐색**으로 특정 → 해당 코드 경로의 동기 루프 수정.
3. headless/CI로도 돌리고 싶으면: 하네스에 **가짜 타이머(setTimeout/setInterval 오버라이드 + 수동 시간 전진)** 를 넣거나, 유저스크립트 부트가 테스트 모드일 때 영구 setInterval을 걸지 않도록 훅 추가. (`--virtual-time-budget` 는 영구 setInterval과 상극이므로 지양)
4. 34개 전부 PASS 되면 `@version` 을 0.1.2로 올리고 커밋·푸시.

진단에 쓴 도구는 회사 머신 임시폴더에 있었고 리포에는 없음. 필요하면 새로 만들면 된다(CDP 러너 등).

## 진행 로그
- 18:40 GitHub 공개 리포 생성·초기 스냅샷 푸시 (사용자 승인)
- 19:10 구현 워커 1차 완료: 유저스크립트 2,135줄, 하네스 34 시나리오 중 28 PASS(나머지는 백그라운드 탭 타이머 스로틀링 영향으로 판단) → 헤드리스 가상시간 재검증 지시
- 19:20 README 한국어 재작성 완료
- 19:00~19:55 사이 Mac이 절전에 들어가 스모크 테스트 에이전트 중단 → caffeinate 재가동 후 재시도 중
- 23:15 v0.1.1 푸시(실디스코드 스모크 PASS 버전). 하네스 헤드리스 검증은 진행 중 — 결과 나오면 이 파일 갱신
- 23:25 회사 머신에서 인계. 하네스 전체통과 미완(위 ⚠️ 절 참조). 유저스크립트 실디스코드 스모크는 PASS. 폭주하던 headless/탭 렌더러는 전부 종료해 CPU 정리 완료.
