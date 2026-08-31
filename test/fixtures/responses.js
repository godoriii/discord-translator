// test/fixtures/responses.js
// Sample raw Anthropic /v1/messages response payloads.
// The userscript's own MockApi (driven by cfg.mockApi) handles the live
// batch-queue mock flows (ok/ratelimit/error500/badjson/partial/scramble/
// authfail/slow) with zero real network calls — see discord-inline-translate.user.js.
// These fixtures are for exercising Api.parseResponse() directly against
// known-shape raw API responses (fence stripping, substring recovery, etc).
(function (global) {
  'use strict';

  function textResponse(text, extra) {
    return Object.assign({
      id: 'msg_fake',
      type: 'message',
      role: 'assistant',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: text }],
      usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    }, extra || {});
  }

  global.ResponseFixtures = {
    valid: textResponse(JSON.stringify({
      translations: [{ i: 0, ko: '살상 명령 지금 써', src: 'en', skip: false }]
    })),

    fenced: textResponse('```json\n' + JSON.stringify({
      translations: [{ i: 0, ko: '지금 가자', src: 'en', skip: false }]
    }) + '\n```'),

    withPrefix: textResponse('Sure, here is the JSON:\n' + JSON.stringify({
      translations: [{ i: 0, ko: '오케이', src: 'en', skip: false }]
    }) + '\nHope that helps!'),

    malformed: textResponse('{not valid json at all'),

    wrongShape: textResponse(JSON.stringify({ result: 'oops' })),

    partial: textResponse(JSON.stringify({
      translations: [{ i: 0, ko: '첫번째', src: 'en', skip: false }]
      // i:1 intentionally missing
    })),

    scrambled: textResponse(JSON.stringify({
      translations: [
        { i: 2, ko: '세번째', src: 'en', skip: false },
        { i: 0, ko: '첫번째', src: 'en', skip: false },
        { i: 1, ko: '두번째', src: 'en', skip: false }
      ]
    })),

    refusal: textResponse('', { stop_reason: 'refusal', content: [] }),

    maxTokens: textResponse('{"translations":[{"i":0,"ko":"잘려', { stop_reason: 'max_tokens' }),

    cacheHit: textResponse(JSON.stringify({
      translations: [{ i: 0, ko: '캐시 히트', src: 'en', skip: false }]
    }), { usage: { input_tokens: 50, output_tokens: 15, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 } })
  };
})(window);
