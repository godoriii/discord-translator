// test/inject-shim.js
//
// Standalone smoke-test shim for a REAL discord.com/ptb/canary tab.
//
// Usage: paste this file's contents into DevTools Console (or run it via an
// automation tool's JS-eval) FIRST, on an already-logged-in Discord channel
// page. Then paste the full contents of discord-inline-translate.user.js
// (everything from `// ==UserScript==` down) and eval it in the SAME
// console/context. It will boot against this shim instead of real
// Tampermonkey GM_* bindings and real network:
//
//   - GM_xmlhttpRequest / GM_getValue / GM_setValue / GM_deleteValue /
//     GM_listValues / GM_addStyle / GM_registerMenuCommand are installed on
//     window (in-memory store; nothing persists across a page reload).
//   - cfg.debug is forced true, so after boot completes you will have
//     `window.__DCXLT__` exposing {C, cfg, State, Glossary, Queue, Detect,
//     Extract, Render, Api, reconcile, ...} for manual poking in the console.
//   - cfg.mockApi is forced to 'ok' by default (same client-side mock logic
//     the test harness uses — see Api.MockApi inside the userscript itself),
//     so this never needs a real Anthropic API key and makes ZERO real
//     network calls to api.anthropic.com. Flip it back with:
//       GM_setValue('dcxlt.settings.v1', Object.assign(GM_getValue('dcxlt.settings.v1'), {mockApi:'off'}))
//     and supply a real key via GM_setValue('dcxlt.apiKey', 'sk-ant-...')
//     before re-running the userscript body if you want to hit the real API.
//
// This is for DOM-detection and rendering smoke tests against Discord's
// *real* live markup (selectors, id schemes, class-hash resilience) — not a
// substitute for test/harness.html, which drives the full 33-scenario suite
// against a synthetic fixture DOM.

(function () {
  'use strict';

  if (window.__DCXLT_SHIM_INSTALLED__) {
    console.warn('[dcxlt-shim] already installed in this page context — skipping re-install.');
    return;
  }
  window.__DCXLT_SHIM_INSTALLED__ = true;

  var gmStorage = {};
  var xhrCallCount = 0;
  var xhrLog = [];

  window.GM_getValue = function (key, def) {
    return Object.prototype.hasOwnProperty.call(gmStorage, key) ? gmStorage[key] : def;
  };
  window.GM_setValue = function (key, val) { gmStorage[key] = val; };
  window.GM_deleteValue = function (key) { delete gmStorage[key]; };
  window.GM_listValues = function () { return Object.keys(gmStorage); };
  window.GM_addStyle = function (css) {
    var st = document.createElement('style');
    st.setAttribute('data-dcxlt-shim-style', '1');
    st.textContent = css;
    document.head.appendChild(st);
    return st;
  };
  window.GM_registerMenuCommand = function (name, fn) {
    window.__DCXLT_MENU__ = window.__DCXLT_MENU__ || {};
    window.__DCXLT_MENU__[name] = fn;
    console.log('[dcxlt-shim] menu command registered: ' + name + ' — call window.__DCXLT_MENU__[' + JSON.stringify(name) + ']() to trigger it.');
    return name;
  };
  window.GM_xmlhttpRequest = function (opts) {
    xhrCallCount++;
    xhrLog.push({ url: opts && opts.url, method: opts && opts.method, ts: Date.now() });
    console.warn('[dcxlt-shim] GM_xmlhttpRequest called while shimmed (mockApi should normally intercept this before it happens):', opts && opts.url);
    setTimeout(function () {
      if (opts && opts.onerror) opts.onerror(new Error('network disabled by inject-shim.js'));
    }, 0);
  };
  window.__DCXLT_XHR_COUNT__ = function () { return xhrCallCount; };
  window.__DCXLT_XHR_LOG__ = xhrLog;

  gmStorage['dcxlt.settings.v1'] = {
    schema: 1, enabled: true, autoTranslate: true, model: 'claude-opus-5', effort: 'low', maxTokens: 4096,
    targetLang: 'ko', targetLangName: '한국어',
    glossaryUrl: 'https://raw.githubusercontent.com/godoriii/discord-translator/main/glossary.json',
    glossaryAutoRefresh: false, glossaryStrategy: 'auto', glossaryAudit: true,
    cacheTtl: '1h', translateEmbeds: true, backfillMode: 'viewport', contextMessages: 3,
    showOriginal: true, hotkeyToggle: 'Alt+KeyT', hotkeyTranslateView: 'Alt+Shift+KeyT', perChannelOff: [],
    fontScale: 0.875,
    debug: true,       // forced: exposes window.__DCXLT__ after boot
    mockApi: 'ok'      // forced: zero real network calls until you flip it
  };
  gmStorage['dcxlt.apiKey'] = 'sk-ant-shim-dummy-key';

  console.log(
    '[dcxlt-shim] installed. GM_* is shimmed, cfg.debug=true, cfg.mockApi=\'ok\' (no real network).\n' +
    'Next: paste discord-inline-translate.user.js in full and eval it. Then inspect window.__DCXLT__.'
  );
})();
