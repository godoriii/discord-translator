# 실제 웹 디스코드 DOM 관측 결과 (2026-08-31, 로그인 세션에서 직접 확인)

- 채팅 루트: `ol[data-list-id="chat-messages"][role="list"]` (class scrollerInner_*). 부모 체인: `div.scrollerContent_* > div.scroller_* > div.messagesWrapper_* > main.chatContent_* > div.content_*`. 채널 전환 시 이 OL이 교체될 수 있으므로 `main` 또는 document.body 레벨에서 OL 등장을 감지해 재바인딩해야 함.
- 메시지 항목: `li[id="chat-messages-<channelId>-<messageId>"]` (class messageListItem_*). id에서 channelId/messageId 파싱 가능(`chat-messages-(\d+)-(\d+)`).
- 항목 내부: `li > div[role="article"][data-list-item-id="chat-messages___chat-messages-<C>-<M>"]` (class message_* cozyMessage_* [groupStart_*] wrapper_*). `groupStart_*`는 같은 사용자의 연속 메시지 중 첫 번째에만 붙음. 연속(grouped) 메시지에는 `h3` 헤더/아바타가 없음.
- article 자식: `div.contents_*` (아바타 img.avatar_*, `h3.header_*` (span#message-username-<M>, time#message-timestamp-<M>), `div#message-content-<M>.markup_*.messageContent_*`) 와 형제로 `div#message-accessories-<M>` (임베드/첨부).
- 본문 노드: `div[id^="message-content-"]`. 내부에 나타나는 요소:
  - `span.edited_*` (내부 `time` + `span.hiddenVisually_*`) = "(수정됨)" 표시 → 번역 대상에서 제외해야 함(텍스트 추출 시 제거).
  - `span.wrapper_* interactive_*` = 멘션(@user/#channel/@role) → 보존.
  - `a.anchor_*` = 링크 → 보존.
  - `span.timestamp_*` = 디스코드 타임스탬프 마크업 → 보존.
  - 일반 텍스트는 `span`(클래스 없음) 또는 텍스트 노드.
  - (이번 샘플에 없었지만 디스코드 표준) `img.emoji` (alt에 :name:), `code.inline`, `pre > code`, `span.spoilerText_*`, `blockquote`, `strong/em/u/s`, `span.timestamp`.
- 임베드: `div[id^="message-accessories-"]` 아래 `article[class*="embed"]`, 내부 `[class*="embedTitle"]`, `[class*="embedDescription"]`, `[class*="embedField"]`, `[class*="embedFooter"]`. (이번 샘플의 임베드는 이미지 위주라 텍스트 임베드는 미확인 — v1은 messageContent 우선, 임베드는 선택 처리.)
- 클래스명은 모두 `이름_해시` 형태로 해시가 바뀌므로 `[class*="edited_"]`, `[class*="spoilerText"]` 같은 부분일치만 허용하고, id/role/data-* 속성을 1차 셀렉터로 사용.
- 가상화: 스크롤 시 li가 언마운트/재마운트됨. 같은 messageId가 다시 나타나면 캐시로 즉시 복원.
- 편집 감지: message-content 서브트리 변경(childList/characterData) + 텍스트 해시 비교. `span.edited_*` 추가만으로도 mutation이 발생하므로 해시는 edited 마커를 제외한 텍스트로 계산해야 재번역 낭비가 없음.
