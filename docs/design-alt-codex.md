아래는 구현 워커가 그대로 따라 만들 수 있는 구현 지시서입니다. 전제: Discord DOM selector는 실제 로그인 세션에서 최종 확인 필요하므로 selector fallback과 telemetry를 코드에 넣는다.

**파일 목록**
1. `discord-inline-ko-translator.user.js`
   - Tampermonkey 단일 유저스크립트
   - Claude API 호출, DOM 감지, 캐시, UI, 설정 패널 포함
2. `glossary.json`
   - GitHub raw로 호스팅
3. `test-harness.html`
   - Discord DOM 모사
   - GM_* shim
   - fake API mode
4. `README.md`
   - 설치, API 키 설정, GitHub raw update URL 설명

**권장 결정 요약**
| 항목 | 추천안 | 근거 | 기각안 |
|---|---|---|---|
| DOM 감지 | `[data-list-id="chat-messages"]` 루트 MutationObserver + `li[id^="chat-messages-"]`, `[role="article"]`, `[id^="message-content-"]` 탐색 | Discord 클래스 해시 변경에 강함, 가상화 대응 가능 | 클래스명 기반 selector는 즉시 깨질 위험 |
| 텍스트 추출 | DOM walker로 semantic token 추출 | 멘션, 이모지, 링크, 코드 보존 가능 | `textContent` 단독은 토큰 경계 손실, `innerText`는 느리고 레이아웃 의존 |
| 용어집 | 기본은 “매칭된 용어만 프롬프트 주입”, 수천 개 이상/반복 채팅방은 “전체 glossary system prompt + cache_control” 옵션 | 비용/토큰 안정성 우선, 확장 가능 | 매 메시지 전체 용어집 주입은 비용 폭증 |
| 사전 치환 | 기본 비활성, 고정 번역이 반드시 필요한 용어에만 placeholder 옵션 | 번역 품질 저하 방지 | 전면 placeholder는 문장 자연성 저하 |
| 과거 메시지 | IntersectionObserver로 뷰포트 진입 메시지만 자동 번역, 스크롤업 대량은 rate limit 큐 | 폭주 방지 | 보이는 모든 과거 메시지 즉시 번역은 비용/429 위험 |
| 배치 | 300ms debounce, 최대 8개/요청, 동시 1개 기본 | 채팅 지연과 비용 균형 | 1메시지 1호출은 비싸고 느림 |
| 문맥 | 직전 번역 대상 주변 N=3개 원문을 context로 제공, 번역 결과는 대상만 요구 | 짧은 게이머 채팅 품질 개선 | 전체 채널 히스토리 전송은 개인정보/토큰 과다 |

---

**유저스크립트 메타**
```js
// ==UserScript==
// @name         Discord Inline Korean Translator
// @namespace    https://github.com/<owner>/<repo>
// @version      0.1.0
// @description  Inline Korean translation for Discord web messages with glossary support.
// @match        https://discord.com/app*
// @match        https://discord.com/channels/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @connect      api.anthropic.com
// @connect      raw.githubusercontent.com
// @updateURL    https://raw.githubusercontent.com/<owner>/<repo>/main/discord-inline-ko-translator.user.js
// @downloadURL  https://raw.githubusercontent.com/<owner>/<repo>/main/discord-inline-ko-translator.user.js
// ==/UserScript==
```

**상수 기본값**
```js
const DEFAULTS = {
  enabled: true,
  targetLang: "ko",
  model: "claude-sonnet-4-5", // 설정에서 변경 가능
  glossaryUrl: "https://raw.githubusercontent.com/<owner>/<repo>/main/glossary.json",
  debounceMs: 300,
  batchMaxMessages: 8,
  maxConcurrentRequests: 1,
  retryMax: 3,
  cacheMaxEntries: 1500,
  cacheTtlMs: 1000 * 60 * 60 * 24 * 14,
  viewportRootMargin: "600px 0px",
  contextBefore: 3,
  maxMessageChars: 3500,
  autoTranslateHistory: "viewport", // off | viewport
  glossaryMode: "matched", // matched | fullCached | hybrid
  hotkey: "Alt+T"
};
```

---

**GM Storage 키**
| 키 | 타입 | 설명 |
|---|---|---|
| `dit.settings` | object | 사용자 설정 |
| `dit.apiKey` | string | Claude API 키 |
| `dit.cache.v1` | object | 번역 캐시 |
| `dit.glossary.local` | array | 로컬 추가/오버라이드 용어 |
| `dit.glossary.meta` | object | lastFetch, etag 유사 정보 |
| `dit.stats` | object | 요청 수, 실패 수, 마지막 오류 |

캐시 key:
```js
cacheKey = `${messageId}:${contentHash}:${targetLang}:${model}:${glossaryHash}`;
```

---

**glossary.json 구조**
```json
{
  "version": 1,
  "updatedAt": "2026-08-31",
  "terms": [
    {
      "source": "Kill Command",
      "target": "살상 명령",
      "status": "confirmed",
      "tags": ["wow", "hunter"]
    },
    {
      "source": "The Venomous Abyss",
      "target": "맹독 심연",
      "status": "tentative",
      "tags": ["wow", "zone"]
    }
  ]
}
```

`status: "tentative"`는 번역문에서 해당 한국어 용어 첫 등장 뒤에 `†`를 붙이도록 프롬프트에 지시한다. 예: `맹독 심연†`.

로컬 glossary는 같은 `source`를 기준으로 원격 항목을 덮어쓴다.

---

**코드 구조**
```js
const App = {
  init(),
  start(),
  stop(),
  rescan(reason)
};

const Settings = {
  load(),
  save(partial),
  get(),
  openPanel(),
  validate()
};

const Glossary = {
  loadRemote(),
  loadLocal(),
  merge(remote, local),
  buildIndex(terms),
  matchTerms(text),
  getPromptTerms(texts),
  getHash()
};

const DiscordDom = {
  findChatRoot(),
  observeChatRoot(),
  collectExistingMessages(),
  getMessageElementFromMutation(node),
  parseMessageElement(articleOrLi),
  extractContent(contentNode),
  getMessageId(el),
  getChannelId(),
  insertTranslation(messageEl, state),
  updateTranslation(messageEl, state),
  removeOrphanTranslations()
};

const Tokenizer = {
  walk(node),
  toTranslatableText(tokens),
  restorePreservedTokens(translated, tokens),
  shouldSkip(tokens, plainText)
};

const Queue = {
  enqueue(messageRecord, priority),
  scheduleFlush(),
  flush(),
  buildBatch(items),
  handleBatchResult(items, result),
  retry(item, error)
};

const ClaudeClient = {
  translateBatch(batch, options),
  buildSystemPrompt(glossaryTerms, options),
  buildUserPayload(batch, context),
  parseResponse(text)
};

const Cache = {
  load(),
  get(key),
  set(key, value),
  prune(),
  save()
};

const UI = {
  addStyles(),
  registerMenu(),
  bindHotkey(),
  renderSettingsPanel(),
  renderInlineLoading(messageEl),
  renderInlineSuccess(messageEl, translation),
  renderInlineError(messageEl, error),
  renderRetryButton(messageEl, messageRecord)
};

const Harness = {
  enabled(),
  installGmShim(),
  fakeApiResponse(request)
};
```

---

**MessageRecord 데이터 구조**
```js
{
  messageId: "123456789",
  channelId: "987654321",
  contentHash: "sha256-short",
  element: HTMLElement,
  contentNode: HTMLElement,
  plainText: "Kill Command now",
  tokens: [
    { type: "text", value: "Kill Command now" },
    { type: "mention", raw: "@user", placeholder: "__MENTION_0__" },
    { type: "code", raw: "`foo`", placeholder: "__CODE_0__" }
  ],
  matchedGlossary: [],
  contextBefore: [],
  createdAt: Date.now(),
  status: "queued" // queued | loading | done | error | skipped
}
```

---

**DOM 감지 전략**
1. `findChatRoot()` 순서:
   - `[data-list-id="chat-messages"]`
   - `ol[data-list-id="chat-messages"]`
   - `main [role="list"]`
   - fallback: `document.body`, 단 이 경우 observer 필터 엄격 적용

2. 메시지 후보:
   - `li[id^="chat-messages-"]`
   - `[role="article"]`
   - 내부에 `[id^="message-content-"]`가 있는 element

3. 중복 삽입 방지:
   - 번역 노드는 `data-dit-translation="1"` 부여
   - 원문 content node에 `data-dit-bound="<contentHash>"`
   - message id + content hash 기준으로 처리
   - 가상화 재마운트 시 캐시 hit이면 API 호출 없이 즉시 삽입

4. 편집 감지:
   - MutationObserver가 기존 message content subtree 변경을 감지
   - `contentHash`가 달라지면 기존 번역 노드 제거 후 재큐잉

5. 삭제 처리:
   - message element가 DOM에서 제거되면 별도 작업 없음
   - 캐시는 TTL까지 유지
   - orphan translation은 `removeOrphanTranslations()`에서 부모 없는 노드 정리

---

**텍스트 추출/보존 규칙**
DOM walker로 다음 토큰 생성:

| 대상 | 처리 |
|---|---|
| 일반 텍스트 | 번역 대상 |
| 멘션 `@user`, `#channel`, role mention | placeholder로 보존 |
| 링크 | URL placeholder 보존, 링크 텍스트가 URL 자체면 번역 제외 |
| 커스텀 이모지 / 이미지 이모지 | alt 또는 DOM 그대로 보존 |
| inline code | 번역 제외 |
| code block | 번역 제외 |
| spoiler | 내부 텍스트는 번역하되 spoiler wrapper 보존. 어려우면 v1에서는 전체 spoiler placeholder |
| quote | 번역 대상에 포함하되 줄 prefix 의미 보존 |
| 이모지만 | skip |
| 링크만 | skip |
| 한국어 비율 높음 | skip |

한국어 skip heuristic:
```js
function isMostlyKorean(text) {
  const letters = text.match(/[A-Za-z가-힣]/g) || [];
  const ko = text.match(/[가-힣]/g) || [];
  return letters.length > 0 && ko.length / letters.length >= 0.55;
}
```

API 호출 skip:
- 빈 문자열
- 이모지/기호만
- URL만
- 코드만
- 한국어로 판단
- `maxMessageChars` 초과 시 truncation 대신 “긴 메시지 수동 재시도” 상태 표시

---

**용어집 매칭**
추천: normalized term index.

정규화:
```js
normalize(s):
  - Unicode NFKC
  - lower case
  - smart quote normalize
  - collapse whitespace
  - trim
```

매칭 규칙:
- 긴 source 우선
- 단어 경계 사용: `(?<![A-Za-z0-9])term(?![A-Za-z0-9])`
- 다단어 용어는 공백/하이픈 변형 허용
- 소유격 허용: `term's`
- 단순 복수형 허용 옵션: `s`, `es`는 source가 단어형일 때만
- 부분일치 금지: `Command`가 `Kill Command` 내부에서 별도 중복 매칭되지 않게 span 점유 처리
- 대소문자 무시
- 원문 표기는 prompt에 함께 제공

전환 기준:
| glossary 크기 | 전략 |
|---|---|
| 0~1000개 | matched only |
| 1000~5000개 | hybrid: 매칭 용어 주입 + 선택적으로 전체 glossary cached system |
| 5000개 이상 | matched only 기본, fullCached는 사용자가 명시적으로 켠 경우만 |

사전 치환은 `forcePlaceholder: true`인 용어에만 적용:
```json
{
  "source": "Kill Command",
  "target": "살상 명령",
  "status": "confirmed",
  "forcePlaceholder": true
}
```

---

**배치/동시성**
기본 정책:
- enqueue 후 `300ms` debounce
- batch 최대 `8`개 또는 총 원문 `8000 chars`
- 동시 요청 `1`
- 429/5xx는 exponential backoff: `1s, 2s, 4s + jitter`
- 4xx 인증 오류는 즉시 중단하고 설정 패널/API 키 오류 표시

요청 user payload는 JSON 문자열:
```json
{
  "target_language": "ko",
  "messages": [
    {
      "id": "m1",
      "text": "Use Kill Command now",
      "context_before": ["pulling boss", "lust soon"],
      "glossary_terms": [
        {
          "source": "Kill Command",
          "target": "살상 명령",
          "status": "confirmed"
        }
      ]
    }
  ]
}
```

응답 요구 schema:
```json
{
  "translations": [
    {
      "id": "m1",
      "translation": "지금 살상 명령을 써.",
      "used_terms": ["Kill Command"]
    }
  ]
}
```

파싱 실패 복구:
1. ```json fence 제거
2. 첫 `{`부터 마지막 `}`까지 substring parse
3. 실패 시 batch를 반으로 나눠 재시도
4. 단건도 실패하면 inline error + retry button

부분 실패:
- 응답에 없는 id는 재시도
- id 불일치 응답은 폐기
- 순서는 믿지 않고 id로 매핑

---

**스크롤업 과거 메시지 정책**
추천: `IntersectionObserver`.

동작:
- 새로 발견한 메시지를 바로 번역하지 않고 observer 등록
- viewport 진입 또는 rootMargin `600px` 이내 접근 시 큐잉
- 현재 화면에 보이는 메시지는 우선순위 high
- 오래된 메시지 대량 발견 시 초당 enqueue 상한 적용
- 설정:
  - `autoTranslateHistory: off`: 새 메시지만
  - `viewport`: 보이는 과거 메시지만 자동
- 선택 기능: 채팅 상단 근처에 “보이는 메시지 번역” floating mini button

자동 전부 번역은 기본값으로 쓰지 않는다. 비용 폭주와 계정 rate limit 위험이 크다.

---

**UI**
Inline translation node:
```html
<div class="dit-translation" data-dit-translation="1">
  <span class="dit-text">...</span>
</div>
```

상태:
- loading: `번역 중...`
- success: 회색 작은 글씨, 원문 바로 아래
- error: `번역 실패` + `재시도`
- skipped: 아무것도 삽입하지 않음

CSS:
```css
.dit-translation {
  margin-top: 2px;
  color: var(--text-muted, #9ca3af);
  font-size: 0.875em;
  line-height: 1.35;
  white-space: pre-wrap;
}
.dit-translation.dit-error {
  color: #f87171;
}
.dit-retry {
  margin-left: 6px;
  cursor: pointer;
}
```

단축키:
- `Alt+T`: 전체 on/off
- 상태 변경 시 현재 채널 rescan

Tampermonkey menu:
- 설정 열기
- 번역 on/off
- 현재 채널 다시 스캔
- 캐시 비우기
- 용어집 새로고침

설정 패널 항목:
- API key
- model
- target language
- glossary URL
- local glossary JSON textarea
- glossary mode
- auto translate history
- batch size
- concurrency
- cache clear button
- test API button

---

**프롬프트 전문**
System prompt:
```text
You are a Korean translator for Discord gaming chat.

Translate user-visible chat messages into natural Korean while preserving the original meaning, tone, and brevity. The audience is Korean gamers. Use concise Korean suitable for live chat.

Hard rules:
1. Return only valid JSON matching the requested schema. Do not include markdown fences or commentary.
2. Preserve placeholders exactly as written, including tokens such as __MENTION_0__, __URL_0__, __EMOJI_0__, __CODE_0__, and __SPOILER_0__.
3. Do not translate URLs, usernames, channel names, custom emoji names, inline code, code blocks, commands, file paths, or IDs.
4. Preserve line breaks when they carry meaning.
5. Apply the glossary exactly. If a glossary source term appears in the message, use the glossary target term.
6. If a glossary term has status "tentative", append † immediately after the Korean target term on first use in that message.
7. Do not add explanations, footnotes, or extra notes.
8. If the message is already Korean, return it unchanged.
9. Keep profanity/intensity comparable to the original without over-sanitizing.
10. For ambiguous short gaming chat, prefer natural in-game Korean phrasing over literal translation.

Output schema:
{
  "translations": [
    {
      "id": "string",
      "translation": "string",
      "used_terms": ["string"]
    }
  ]
}
```

User prompt:
```text
Translate the following Discord messages to Korean.

Use context_before only for context. Do not translate context_before as output.
Return one translation for each item in messages. Match by id, not by order.

Payload:
<JSON payload>
```

`fullCached` 모드에서는 system prompt 뒤에 glossary 전체를 별도 system content로 붙이고 `cache_control: ephemeral`을 설정한다. 정확한 Claude API body 필드는 구현 시 별도 제공값을 따른다.

---

**ClaudeClient 함수**
```js
async function translateBatch(batch, options) {
  // options: apiKey, model, targetLang, glossaryMode, glossaryTerms
  // returns Map<messageId, { translation, usedTerms }>
}
```

필수 처리:
- API key 없으면 요청하지 않고 설정 열기 유도
- timeout 30s
- JSON parse recovery
- status code별 오류 분류:
  - 401/403: auth
  - 429: rate_limit
  - 500~599: server
  - network/timeout: network
  - parse: parse

---

**엣지케이스 처리 표**
| 케이스 | 처리 |
|---|---|
| Discord selector 변경 | fallback selector + 설정 패널에 “메시지 루트 못 찾음” 표시 |
| 메시지 재마운트 | cache key hit 시 즉시 렌더 |
| 메시지 편집 | contentHash 변경 감지 후 재번역 |
| 메시지 삭제 | DOM 제거와 함께 번역 노드도 제거됨 |
| API 키 없음 | inline error 대신 설정 패널 안내 |
| API 키 만료 | 큐 정지, 메뉴/패널에 auth error |
| 429 | backoff 후 재시도, 큐 유지 |
| 5xx | backoff 후 재시도 |
| JSON 응답 깨짐 | fence 제거, substring parse, batch split |
| 번역 순서 뒤섞임 | id 매핑 |
| 한국어 오판 | 메시지별 retry/force translate 버튼 선택 구현 가능 |
| 코드블록만 | skip |
| 링크만 | skip |
| 이모지만 | skip |
| 매우 긴 메시지 | 자동 skip + 수동 재시도 버튼 |
| glossary fetch 실패 | 마지막 성공 glossary 사용, 없으면 glossary 없이 동작 |
| 로컬 glossary JSON 오류 | 원격 glossary만 사용, 패널에 오류 표시 |
| 채널 전환 | root 재탐색, observer 재설정, visible messages scan |
| 임베드/첨부 캡션 | v1은 일반 message content 우선, embed는 selector 발견 시 별도 parser 추가 |

---

**테스트 하네스**
`test-harness.html` 요구사항:
- Discord 유사 구조:
```html
<ol data-list-id="chat-messages">
  <li id="chat-messages-1-100">
    <div role="article">
      <div id="message-content-100">Use Kill Command now</div>
    </div>
  </li>
</ol>
```

GM shim:
```js
window.GM_getValue = ...
window.GM_setValue = ...
window.GM_xmlhttpRequest = fakeApi
window.GM_registerMenuCommand = ...
window.GM_addStyle = ...
```

Fake API:
- request payload를 읽고 `translations` JSON 반환
- glossary term 있으면 target 적용
- failure mode toggle:
  - 429 once
  - 500 once
  - malformed JSON
  - missing id
  - delayed response

시나리오 목록:
1. 신규 영어 메시지 유입 → loading → inline 번역
2. 여러 메시지 5개 빠르게 유입 → batch 1회
3. 한국어 메시지 → API 호출 없음
4. 이모지만/링크만 → API 호출 없음
5. 멘션/URL/inline code 포함 → placeholder 보존
6. `Kill Command` glossary 적용
7. tentative 용어 → `†` 표시
8. 가상화 재마운트 → 캐시로 즉시 복원
9. 메시지 편집 → contentHash 변경 후 재번역
10. 채널 전환 → observer 재설정
11. 429 → backoff 후 성공
12. malformed JSON → batch split 또는 error
13. retry button → 단건 재요청
14. 캐시 상한 초과 → prune 확인

---

**구현 순서**
1. GM storage/settings/cache/glossary 로더 작성
2. DOM root 탐색 + MutationObserver + IntersectionObserver 작성
3. Tokenizer와 skip heuristic 작성
4. Queue와 fake ClaudeClient로 end-to-end 연결
5. 실제 GM_xmlhttpRequest ClaudeClient 연결
6. Inline UI와 settings panel 작성
7. test-harness 시나리오 버튼 추가
8. GitHub raw URL 메타 갱신
9. 실제 Discord에서 selector smoke test 후 fallback 조정

이 설계의 핵심은 “DOM은 느슨하게 찾고, 메시지는 id/hash로 엄격하게 관리하며, API는 viewport와 batch 큐로 통제한다”는 것이다. 용어집은 처음부터 수천 개를 견디도록 매칭 주입을 기본값으로 두고, full prompt caching은 사용자가 비용/품질 트레이드오프를 알고 켤 수 있는 옵션으로 둔다.
