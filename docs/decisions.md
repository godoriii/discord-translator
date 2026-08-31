# 오케스트레이터 최종 결정 메모 (2026-08-31)
- 1차 스펙: deep-reasoner-design.md (3-tier 용어집 캐시, 재조정 스윕, id 정규식 탐지, dwell 뷰포트, 캐시키에 용어집 rev 제외)
- 2차 참고: codex-design.md (에러 분류, 하네스 실패모드 토글, 프롬프트 규칙 일부)
- 관측 사실: discord-dom-facts.md 가 DOM 관련 스펙 내용보다 우선
- 오버라이드: 모델 기본 claude-opus-5 / effort low / fallbacks default(opus·fable만) / temperature 등 샘플링 파라미터 금지 / glossary.json은 DR §3.2 스키마로 변환(confirmed:false→tentative:true) / OWNER·REPO = godoriii/discord-translator / 단축키는 e.code 기반·편집영역 무시
- 검증: node --check + 하네스 33 시나리오를 Chrome에서 실행(워커 자체 탭) + 이후 Fable이 실제 디스코드 탭에서 mock 모드 주입 스모크 테스트
- GitHub 리포 생성·푸시는 사용자 확인 후
