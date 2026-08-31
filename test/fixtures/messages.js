// test/fixtures/messages.js
// Fake Discord-like DOM builders, matching the structure observed in
// discord-dom-facts.md (real logged-in session, 2026-08-31):
//   ol[data-list-id="chat-messages"] > li[id="chat-messages-<ch>-<msg>"]
//     > div[role=article][data-list-item-id] > div.contents
//         > h3.header (span#message-username-<msg>, time#message-timestamp-<msg>)
//         > div#message-content-<msg>.markup.messageContent
//     ~ div#message-accessories-<msg>
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  function chatRoot() {
    return el('ol', { 'data-list-id': 'chat-messages', role: 'list', class: 'scrollerInner_abc123' });
  }

  function scrollerWrap(inner) {
    // Nesting must match the REAL observed chain (docs/discord-dom-facts.md):
    // main.chatContent > div.messagesWrapper > div.scroller (the overflow
    // container) > div.scrollerContent > ol.scrollerInner. With the old,
    // inverted order (scrollerContent OUTSIDE scroller) the userscript's
    // scroller selector `div[class*="messagesWrapper"] div[class*="scroller"]`
    // matched scrollerContent first in document order — an element whose
    // scrollHeight always equals its clientHeight — so nearBottom was
    // permanently true and every scroll-position-gated scenario (23, 28)
    // failed against behavior that is correct on real discord.com.
    var content = el('div', { class: 'scrollerContent_x1' }, [inner]);
    var scroller = el('div', { class: 'scroller_x1 scrollerBase_x1', style: 'overflow-y:auto;height:400px' }, [content]);
    var wrapper = el('div', { class: 'messagesWrapper_x1' }, [scroller]);
    var main = el('main', { class: 'chatContent_x1' }, [wrapper]);
    return main;
  }

  // Build a single message <li>. opts:
  //   channelId, msgId, author, html (inner markup for content), groupStart(bool),
  //   edited(bool), embedHtml (string of embed markup, optional)
  function mkMessage(opts) {
    opts = opts || {};
    var channelId = opts.channelId || '111111111111111111';
    var msgId = opts.msgId;
    var author = opts.author || 'Tester';
    var groupStart = opts.groupStart !== false;

    var contentDiv = el('div', {
      id: 'message-content-' + msgId,
      class: 'markup_x1 messageContent_x1'
    });
    if (opts.html !== undefined) contentDiv.innerHTML = opts.html;
    else contentDiv.textContent = opts.text || '';

    if (opts.edited) {
      var editedSpan = el('span', { class: 'edited_x1' }, [
        el('time', {}, []),
      ]);
      editedSpan.appendChild(document.createTextNode(' (수정됨)'));
      contentDiv.appendChild(editedSpan);
    }

    var childrenOfContents = [];
    if (groupStart) {
      var header = el('h3', { class: 'header_x1' }, [
        el('span', { id: 'message-username-' + msgId, class: 'username_x1', text: author }),
        el('time', { id: 'message-timestamp-' + msgId, class: 'timestamp_x1', text: '오후 3:00' })
      ]);
      childrenOfContents.push(header);
    }
    childrenOfContents.push(contentDiv);

    var contents = el('div', { class: 'contents_x1' }, childrenOfContents);
    var article = el('div', {
      role: 'article',
      'data-list-item-id': 'chat-messages___chat-messages-' + channelId + '-' + msgId,
      class: 'message_x1 cozyMessage_x1' + (groupStart ? ' groupStart_x1' : '') + ' wrapper_x1'
    }, [contents]);

    var accessories = el('div', { id: 'message-accessories-' + msgId, class: 'accessories_x1' });
    if (opts.embedHtml) accessories.innerHTML = opts.embedHtml;

    var li = el('li', {
      id: 'chat-messages-' + channelId + '-' + msgId,
      class: 'messageListItem_x1'
    }, [article, accessories]);

    return li;
  }

  function mkEmbed(opts) {
    opts = opts || {};
    var title = opts.title || '';
    var desc = opts.description || '';
    return (
      '<article class="embedFull_x1 embed_x1">' +
      (title ? '<div class="embedTitle_x1">' + title + '</div>' : '') +
      (desc ? '<div class="embedDescription_x1">' + desc + '</div>' : '') +
      '</article>'
    );
  }

  function mkMention(label) {
    return '<span class="wrapper_x1 interactive_x1" role="link">' + label + '</span>';
  }
  function mkCustomEmoji(name) {
    return '<img class="emoji_x1" alt=":' + name + ':" src="https://example.invalid/e.png">';
  }
  function mkLink(href, text) {
    return '<a class="anchor_x1" href="' + href + '" target="_blank">' + (text || href) + '</a>';
  }
  function mkInlineCode(text) {
    return '<code class="inline_x1">' + text + '</code>';
  }
  function mkCodeBlock(text) {
    return '<pre class="pre_x1"><code>' + text + '</code></pre>';
  }
  function mkSpoiler(text) {
    return '<span class="spoilerText_x1" data-spoiler="true">' + text + '</span>';
  }

  global.Fixtures = {
    el: el,
    chatRoot: chatRoot,
    scrollerWrap: scrollerWrap,
    mkMessage: mkMessage,
    mkEmbed: mkEmbed,
    mkMention: mkMention,
    mkCustomEmoji: mkCustomEmoji,
    mkLink: mkLink,
    mkInlineCode: mkInlineCode,
    mkCodeBlock: mkCodeBlock,
    mkSpoiler: mkSpoiler
  };
})(window);
