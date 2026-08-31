# Discord 인라인 번역 (한국어 KO)

Tampermonkey 사용자 스크립트로 Discord 웹 클라이언트에서 메시지를 Claude API로 한국어 번역. 디스코드 API나 봇을 사용하지 않으며, 브라우저 화면에만 번역을 표시합니다. **디스코드 계정으로 어떤 데이터도 전송하지 않습니다.**

- 스크립트: `discord-inline-translate.user.js`
- 용어집: `glossary.json` (GitHub에서 호스팅, 로컬 스냅샷/오버라이드 폴백)
- 테스트 하니스: `test/harness.html`
- DevTools 스모크 테스트: `test/inject-shim.js`

---

## 1. 설치

1. Chrome 또는 Chromium 기반 브라우저에 [Tampermonkey](https://www.tampermonkey.net/) 설치 (Windows/Mac 동일).
2. 주소창에 다음을 복붙하여 열기:
   ```
   https://raw.githubusercontent.com/godoriii/discord-translator/main/discord-inline-translate.user.js
   ```
3. **설치** 클릭. Tampermonkey가 스크립트를 관리하며 자동으로 업데이트를 확인합니다.
4. Discord 웹(discord.com, ptb.discord.com, canary.discord.com)을 새로고침하면 스크립트가 자동 로드됩니다.

---

## 2. API 키 설정

1. [Anthropic 콘솔](https://console.anthropic.com/)에서 API 키 발급.
2. Tampermonkey 메뉴 → **이 사이트에서 설정 열기** → **일반** 탭.
3. API 키 입력란에 붙여넣고 **저장** 클릭.
   - 키는 **브라우저 저장소**에만 보관되며, 코드나 GitHub에 절대 포함되지 않습니다.
   - **각 PC마다 한 번씩 입력**해야 합니다.
4. 모델 선택: `claude-opus-5` (기본), `claude-sonnet-5`, `claude-haiku-4-5`
   - 설정 패널이 프롬프트 캐시 크기를 표시하며, 모델별 최소 캐시 하한선(512 / 1024 / 4096 토큰) 아래면 경고 표시.

### 모델 및 비용 참고 (2026년 8월 Anthropic 공식가)

| 모델 | 입력 | 출력 |
|---|---|---|
| claude-opus-5 | $5/M | $25/M |
| claude-sonnet-5 | $2/M | $10/M |
| claude-haiku-4-5 | $1/M | $5/M |

**Prompt Cache**: 용어집은 캐시되어 캐시 읽기는 입력가의 **10%** 청구. Opus 5는 512토큰부터 캐시, Haiku 4.5는 4096토큰 미만이면 캐시 미적용.

### 커스텀 프로바이더 (v0.2.0+) — Gemini 무료 티어 등

Anthropic 대신 **OpenAI 호환 chat/completions API라면 무엇이든** 연결할 수 있습니다 (Gemini, OpenRouter, Groq, Ollama 로컬, OpenAI 등).

1. 설정 패널 → **일반** 탭 → 프로바이더에서 **커스텀 — OpenAI 호환** 선택.
2. 프리셋 버튼(Gemini / OpenRouter / Groq / Ollama)을 누르면 Base URL과 모델명이 채워집니다. 다른 API는 직접 입력 — Base URL은 `/chat/completions` 앞부분까지만 적으면 됩니다.
3. 해당 프로바이더의 API 키 입력 후 **저장**.
   - Gemini 무료 티어: [Google AI Studio](https://aistudio.google.com/apikey)에서 카드 등록 없이 키 발급. Flash 계열 모델이 분당 10회·일 250~1,500회 무료.
   - 인증 헤더가 특이한 API는 "추가 헤더(JSON)"에 직접 지정 (기본은 `Authorization: Bearer <키>`).
4. 프리셋에 없는 도메인은 첫 요청 때 Tampermonkey가 접근 허용을 물어봅니다 — 허용해 주세요.

참고: Anthropic 프롬프트 캐시 할인·`effort` 설정은 Anthropic 프로바이더에만 적용됩니다. 용어집 강제는 프롬프트 기반이라 어떤 프로바이더에서도 동일하게 동작합니다.

---

## 3. 용어집

`glossary.json`에 45개 World of Warcraft 용어(스킬, 직업, 지명, 보스, NPC, 아이템) 탑재.

**스키마:**
```json
{
  "version": 1,
  "updatedAt": "2026-08-31",
  "entries": [
    { "en": "Kill Command", "ko": "살상 명령", "cat": "skill", "pin": true },
    { "en": "Sszorak", "ko": "스조라크", "tentative": true, "cat": "boss" }
  ]
}
```

**필드:**
- `en`, `ko`: 필수
- `alt`: 추가 영어 표현 (배열)
- `tentative`: `true`면 한국어 뒤에 † 표시
- `cat`: skill / spec / place / boss / npc / item / term (정보용)
- `pin`: 항상 캐시된 시스템 프롬프트에 포함
- `cs`: 대소문자 구분 강제
- `note`: API 전송 안 되는 개인 메모
- `domain`: 정보 태그 (예: `"wow"`)

### 용어집 편집

**원격(공유)**: 이 리포의 `glossary.json`을 수정하고 `main`에 푸시.
- 모든 클라이언트가 재자동 받음 (6시간 TTL).
- Tampermonkey 메뉴 **용어집 새로고침** 또는 설정 **용어집** 탭 **지금 새로고침** 버튼.

**로컬(개인 오버라이드)**: 설정 → **용어집** 탭 → JSON 편집 → **로컬 저장**.
- 로컬 항목이 원격을 덮어씀 (소문자 `en` 기준).
- `"ko": null`로 설정하면 해당 항목 비활성화.

---

## 4. 단축키

| 기능 | 기본 | 설명 |
|---|---|---|
| 번역 켜기/끄기 | Alt+T | 키보드 배치 무관 (비-QWERTY도 동일). |
| 현재 화면의 모든 메시지 번역 | Alt+Shift+T | 뷰포트 지연, 백필 제약 무시; 디바운스 스킵. |

입력창(`<input>`, `<textarea>`, `contenteditable`, `role="textbox"`)에 포커스 중일 때 무시되어 타이핑 중단 안 함.

설정 → **일반** 탭에서 커스텀 가능.

---

## 5. 설정 패널 탭

- **일반**: API 키, 모델, 켜기/끄기, 자동 번역, 번역 포함, 원문 표시 토글, 단축키.
- **용어집**: 원격 URL, 수신 상태, 로컬 오버라이드 JSON 편집기.
- **셀렉터**: 카테고리별(스크롤러/행/컨텐츠/악세서리) 커스텀 선택자 (기본값 앞에 추가), **지금 테스트** 버튼으로 일치 카운트 확인.
- **진단**: 마지막 감지 결과, 용어집 통계, 오늘의 요청/토큰/캐시 통계, **진단 복사** 버튼 (API 키 제외).

---

## 6. 동작 원리 (요약)

메시지를 `id="message-content-<id>"` snowflake ID로 식별 (CSS 클래스 아님). 스로틀된 전체 DOM 스캔으로 텍스트를 추출하고, 멘션/이모지/링크/코드를 보존 자리 표시자로 변환, 용어집 매칭 후 최대 8개 메시지를 350ms 디바운스로 배치 처리. 결과는 `textContent`로만 렌더링(HTML 미사용). 설계 상세는 스크립트 내 주석 참조.

---

## 7. 테스트

### 통합 테스트

로컬 웹 서버에서 `test/harness.html` 실행:
```bash
python3 -m http.server 8000
# 브라우저: http://localhost:8000/test/harness.html
```

또는 콘솔에서 `await window.__DCXLT_TEST__.runAll()` 실행. 합성 Discord DOM + 완전히 shimmed `GM_*` + 클라이언트 측 API 모의로 실제 네트워크 호출 없음.

### 스모크 테스트

DevTools 콘솔에서 `test/inject-shim.js` 붙여넣기 후 전체 스크립트 본문 붙여넣기. 실제 discord.com 페이지에서 DOM 감지/렌더링 검증.

---

## 다른 기기에서 이어가기

개발 인계: `docs/HANDOFF.md` 참조.

---

**저장소**: https://github.com/godoriii/discord-translator
