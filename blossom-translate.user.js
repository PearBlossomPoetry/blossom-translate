// ==UserScript==
// @name         网页完美翻译（腾讯交互·划词·整页）BY：梨花诗
// @namespace    local.translate.qq
// @version      1.1.5
// @description  点击悬浮球整页翻译成中文 支持划词 自动翻译 长按展开菜单
// @author       梨花诗
// @email        moeimoe@163.com
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      transmart.qq.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(async () => {
  'use strict';

  // 配置
  const CFG = {
    target: 'zh',
    batchItems: 40,        // 每批段数
    batchChars: 4000,      // 每批字符数
    maxLenPerNode: 3000,   // 单段上限
    concurrency: 5,        // 并发数
    maxIterations: 15,     // 最多迭代轮数
    snapDelay: 1500,       // 翻完多久停靠
    api: 'https://transmart.qq.com/api/imt'
  };

  const SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|CODE|PRE|KBD|SAMP|VAR|TEXTAREA|INPUT|SELECT|OPTION|SVG|CANVAS|IFRAME|VIDEO|AUDIO|TEMPLATE|MATH)$/;
  const SKIP_CLASS = /tm-fab|tm-bar|tm-panel|tm-tip|notranslate|katex|mathjax/i;

  const DEFAULTS = { auto: true, size: 38, selection: true, pos: null };
  const STORE_KEY = 'tm_cfg_v8';

  // 状态
  let translated = false;
  let isTranslating = false;
  let pendingRoot = null;
  let translatedNodes = new WeakSet();
  let originalTextMap = new WeakMap();
  let textBackups = [];
  let phBackups = [];
  let originalTitle = null;
  let settings = Object.assign({}, DEFAULTS);
  let observer = null;
  let mutRoots = new Set();
  let mutTimer = null;
  let longPressed = false;
  let doneCount = 0;
  let snapTimer = null;
  let snapped = false;
  let snapBackup = null;

  // 译文缓存
  const cache = new Map();
  function cacheGet(t) { return cache.get(t); }
  function cacheSet(t, v) { if (cache.size > 4000) cache.clear(); cache.set(t, v); }

  // 读配置
  function loadSettings() {
    let raw = null;
    try { if (typeof GM_getValue === 'function') raw = GM_getValue(STORE_KEY, null); } catch (e) {}
    if (!raw) { try { raw = localStorage.getItem(STORE_KEY); } catch (e) {} }
    if (raw) {
      try {
        const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
        settings = Object.assign({}, DEFAULTS, o);
        delete settings.opacity;
      } catch (e) {}
    }
  }

  // 存配置
  function saveSettings() {
    const raw = JSON.stringify(settings);
    try { if (typeof GM_setValue === 'function') { GM_setValue(STORE_KEY, raw); return; } } catch (e) {}
    try { localStorage.setItem(STORE_KEY, raw); } catch (e) {}
  }

  // 注入样式
  function injectStyle() {
    if (document.getElementById('tm-style')) return;
    const s = document.createElement('style');
    s.id = 'tm-style';
    s.textContent = [
      // 悬浮球
      '.tm-fab{position:fixed;right:14px;bottom:150px;z-index:2147483647;',
      'display:flex;align-items:center;justify-content:center;box-sizing:border-box;',
      'border-radius:50%;cursor:pointer;user-select:none;-webkit-user-select:none;',
      'touch-action:none;-webkit-tap-highlight-color:transparent;',
      'font-family:-apple-system,"PingFang SC",sans-serif;font-weight:600;',
      'letter-spacing:-.3px;line-height:1;',
      'color:#fff;background:rgba(24,24,27,.78);',
      'backdrop-filter:blur(22px) saturate(180%);',
      '-webkit-backdrop-filter:blur(22px) saturate(180%);',
      'border:none;',
      'box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 8px 26px rgba(0,0,0,.36);',
      'transform:translateZ(0);',
      '-webkit-backface-visibility:hidden;',
      'will-change:transform;',
      'transition:transform .14s cubic-bezier(.2,.9,.3,1.2),opacity .28s ease,right .28s ease}',
      '.tm-fab:active{transform:translateZ(0) scale(.9)}',
      '.tm-fab[data-busy="1"]{box-shadow:inset 0 0 0 1px rgba(255,255,255,.3),0 8px 26px rgba(0,0,0,.36)}',
      '.tm-fab[data-busy="1"]::after{content:"";position:absolute;inset:0;border-radius:50%;',
      'border:1.5px solid transparent;border-top-color:#3ddc84;border-right-color:rgba(255,255,255,.75);',
      'animation:tmspin .75s linear infinite}',
      '@keyframes tmspin{to{transform:rotate(360deg)}}',

      // 胶囊提示
      '.tm-bar{position:fixed;left:50%;bottom:68px;z-index:2147483647;',
      'display:flex;align-items:center;gap:5px;box-sizing:border-box;',
      'max-width:calc(100vw - 40px);padding:6px 11px;border-radius:999px;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
      'color:#fff;font-size:11px;font-weight:500;letter-spacing:.1px;',
      'font-family:-apple-system,"PingFang SC",sans-serif;',
      'background:rgba(24,24,27,.78);backdrop-filter:blur(22px) saturate(180%);',
      '-webkit-backdrop-filter:blur(22px) saturate(180%);',
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 6px 20px rgba(0,0,0,.32);',
      'opacity:0;transform:translate(-50%,8px) scale(.96);pointer-events:none;',
      'transition:opacity .2s ease,transform .2s cubic-bezier(.2,.9,.3,1.1)}',
      '.tm-bar.show{opacity:1;transform:translate(-50%,0) scale(1)}',
      '.tm-bar .tm-dot{width:5.5px;height:5.5px;border-radius:50%;flex:0 0 auto;',
      'background:#3ddc84;box-shadow:0 0 5px rgba(61,220,132,.7)}',
      '.tm-bar.err .tm-dot{background:#ff5c5c;box-shadow:0 0 5px rgba(255,92,92,.7)}',
      '.tm-bar.busy .tm-dot{background:#ffb340;box-shadow:0 0 5px rgba(255,179,64,.7);',
      'animation:tmpulse 1s ease-in-out infinite}',
      '.tm-bar .tm-txt{overflow:hidden;text-overflow:ellipsis}',
      '@keyframes tmpulse{50%{opacity:.3}}',

      // 划词气泡
      '.tm-tip{position:fixed;z-index:2147483647;max-width:260px;box-sizing:border-box;',
      'padding:8px 12px;border-radius:13px;color:#fff;font-size:12.5px;line-height:1.6;',
      'font-family:-apple-system,"PingFang SC",sans-serif;word-break:break-word;',
      'background:rgba(24,24,27,.9);backdrop-filter:blur(22px) saturate(180%);',
      '-webkit-backdrop-filter:blur(22px) saturate(180%);',
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px rgba(0,0,0,.42);',
      'display:none;opacity:0;transform:translateY(4px);',
      'transition:opacity .18s ease,transform .18s ease}',
      '.tm-tip.show{display:block;opacity:1;transform:translateY(0)}',
      '.tm-tip .tm-tip-load{opacity:.55;font-size:11.5px}',

      // 设置面板
      '.tm-panel{position:fixed;z-index:2147483647;width:214px;padding:14px 14px 10px;',
      'border-radius:18px;color:#fff;font:12px/1.6 -apple-system,"PingFang SC",sans-serif;',
      'background:rgba(30,30,34,.62);backdrop-filter:blur(24px) saturate(180%);',
      '-webkit-backdrop-filter:blur(24px) saturate(180%);',
      'border:1px solid rgba(255,255,255,.2);box-shadow:0 14px 44px rgba(0,0,0,.46);',
      'display:none;box-sizing:border-box}',
      '.tm-panel .tm-title{font-size:12px;opacity:.62;margin-bottom:10px;letter-spacing:.5px}',
      '.tm-panel .tm-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}',
      '.tm-panel .tm-row>span{opacity:.92}',
      '.tm-panel .tm-val{opacity:.6;font-family:ui-monospace,monospace;font-size:11px}',
      '.tm-panel input[type=range]{-webkit-appearance:none;width:100%;height:3px;',
      'border-radius:2px;background:rgba(255,255,255,.26);outline:none;margin:6px 0 2px}',
      '.tm-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;',
      'width:15px;height:15px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4)}',
      '.tm-panel .tm-sw{position:relative;width:38px;height:22px;border-radius:11px;',
      'background:rgba(255,255,255,.24);transition:background .2s;flex:0 0 auto;cursor:pointer}',
      '.tm-panel .tm-sw[data-on="1"]{background:rgba(18,161,80,.85)}',
      '.tm-panel .tm-sw::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;',
      'border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)}',
      '.tm-panel .tm-sw[data-on="1"]::after{transform:translateX(16px)}',
      '.tm-panel .tm-sep{height:1px;background:rgba(255,255,255,.14);margin:4px 0 10px}',
      '.tm-panel .tm-act{display:flex;gap:8px}',
      '.tm-panel .tm-act button{flex:1;padding:7px 0;border-radius:10px;cursor:pointer;',
      'font-size:12px;color:#fff;background:rgba(255,255,255,.14);',
      'border:1px solid rgba(255,255,255,.2);font-family:inherit}',
      '.tm-panel .tm-act button:active{background:rgba(255,255,255,.26)}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  // 胶囊提示
  let bar = null;
  let barTimer = null;

  function status(msg, kind) {
    if (!document.body) return;
    if (!bar || !bar.isConnected) {
      bar = document.createElement('div');
      bar.className = 'tm-bar';
      bar.setAttribute('data-tm-skip', '1');
      const dot = document.createElement('i');
      dot.className = 'tm-dot';
      bar.appendChild(dot);
      const txt = document.createElement('span');
      txt.className = 'tm-txt';
      bar.appendChild(txt);
      document.body.appendChild(bar);
    }
    const k = kind === true ? 'err' : kind;
    bar.querySelector('.tm-txt').textContent = String(msg).replace(/\s*\n+\s*/g, ' ');
    bar.classList.toggle('err', k === 'err');
    bar.classList.toggle('busy', k === 'busy');
    void bar.offsetWidth;
    bar.classList.add('show');
    clearTimeout(barTimer);
    barTimer = setTimeout(function () {
      if (bar) bar.classList.remove('show');
    }, k === 'busy' ? 8000 : 2600);
    console.log('[译]', msg);
  }

  function hideStatus(delay) {
    clearTimeout(barTimer);
    barTimer = setTimeout(function () {
      if (bar) bar.classList.remove('show');
    }, delay || 0);
  }

 // 发请求 优先 GM 绕开 CSP
  function request(body) {
    const payload = JSON.stringify(body);
    const timeout = 25000;
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'POST',
          url: CFG.api,
          headers: { 'Content-Type': 'application/json' },
          data: payload,
          timeout: timeout,
          responseType: 'text',
          onload: function (r) {
            if (r.status >= 200 && r.status < 300) {
              try { resolve(JSON.parse(r.responseText)); }
              catch (e) { reject(new Error('返回不是 JSON')); }
            } else reject(new Error('HTTP ' + r.status));
          },
          onerror: function () { reject(new Error('网络错误')); },
          ontimeout: function () { reject(new Error('请求超时')); }
        });
      } else {
        const ctrl = new AbortController();
        const tid = setTimeout(function () { ctrl.abort(); }, timeout);
        fetch(CFG.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: ctrl.signal
        }).then(function (r) {
          clearTimeout(tid);
          return r.text().then(function (text) {
            if (!r.ok) return reject(new Error('HTTP ' + r.status));
            try { resolve(JSON.parse(text)); } catch (e) { reject(new Error('返回不是 JSON')); }
          });
        }).catch(function (e) {
          clearTimeout(tid);
          reject(e.name === 'AbortError' ? new Error('请求超时') : e);
        });
      }
    });
  }

  let clientKey = null;
  function getClientKey() {
    if (clientKey) return clientKey;
    const rand = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    clientKey = 'browser-chrome-120.0-Windows_10-' + rand + '-' + Date.now();
    return clientKey;
  }

 // 批量翻译 失败重试两次再逐条兜底
  async function translateBatch(texts, attempt) {
    attempt = attempt || 0;
    const body = {
      header: { fn: 'auto_translation', session: '', client_key: getClientKey(), user: '' },
      type: 'plain',
      model_category: 'normal',
      text_domain: 'general',
      source: { lang: 'auto', text_list: texts },
      target: { lang: CFG.target }
    };
    try {
      const j = await request(body);
      const code = j && j.header && j.header.ret_code;
      if (code && code !== 'succ') throw new Error('服务端 ' + code);
      if (!j || !Array.isArray(j.auto_translation)) throw new Error('返回结构异常');
      return j.auto_translation;
    } catch (e) {
      if (attempt < 2) {
        await new Promise(function (r) { setTimeout(r, 700 * (attempt + 1)); });
        return translateBatch(texts, attempt + 1);
      }
      if (texts.length > 1) {
        const out = [];
        for (let i = 0; i < texts.length; i++) {
          try {
            const r = await translateBatch([texts[i]], 0);
            out.push((r && r[0]) || '');
          } catch (err) { out.push(''); }
        }
        return out;
      }
      throw e;
    }
  }

  // 判断是否已经是中文
  const TARGET_TEST = /^[\u4e00-\u9fff\u3400-\u4dbf\s\d\p{P}]+$/u;
  function isTargetLang(text) {
    if (CFG.target !== 'zh') return false;
    const t = String(text).trim();
    if (t.length <= 2) return false;
    return TARGET_TEST.test(t);
  }

  // 判断节点是否跳过
  function shouldSkip(el) {
    if (!el) return true;
    if (SKIP_TAGS.test(el.tagName)) return true;
    if (el.className && typeof el.className === 'string' && SKIP_CLASS.test(el.className)) return true;
    if (el.isContentEditable) return true;
    if (el.hasAttribute && el.hasAttribute('data-tm-skip')) return true;
    return false;
  }

  // 收集文本节点
  function collectTextNodes(root) {
    const nodes = [];
    if (!root) return nodes;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const p = node.parentElement;
        if (shouldSkip(p)) return NodeFilter.FILTER_REJECT;

        const text = (node.textContent || '').trim();
        if (!text || text.length < 2) return NodeFilter.FILTER_REJECT;
        if (text.length > CFG.maxLenPerNode) return NodeFilter.FILTER_REJECT;
        if (/^\d+$/.test(text)) return NodeFilter.FILTER_REJECT;
        if (!/[\p{L}]{2,}/u.test(text)) return NodeFilter.FILTER_REJECT;
        if (isTargetLang(text)) return NodeFilter.FILTER_REJECT;
        if (translatedNodes.has(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // 收集输入框占位文字
  function collectPlaceholders(root) {
    if (!root || !root.querySelectorAll) return [];
    return Array.prototype.slice.call(root.querySelectorAll('input[placeholder],textarea[placeholder]'))
      .filter(function (el) {
        const t = (el.placeholder || '').trim();
        if (!t || t.length < 2) return false;
        if (isTargetLang(t)) return false;
        if (el.dataset && el.dataset.tmPh === '1') return false;
        return true;
      });
  }

  // 分批
  function chunk(arr) {
    const out = [];
    let cur = [], chars = 0;
    arr.forEach(function (item) {
      const len = (item.text || '').length;
      if (cur.length && (cur.length >= CFG.batchItems || chars + len > CFG.batchChars)) {
        out.push(cur); cur = []; chars = 0;
      }
      cur.push(item); chars += len;
    });
    if (cur.length) out.push(cur);
    return out;
  }

  // 并发执行
  async function runPool(tasks, limit) {
    let i = 0;
    const size = Math.min(limit, tasks.length);
    const workers = [];
    for (let k = 0; k < size; k++) {
      workers.push((async function () {
        while (i < tasks.length) {
          const idx = i++;
          try { await tasks[idx](); } catch (e) { console.warn('[译] 批次失败 ', e.message); }
        }
      })());
    }
    await Promise.all(workers);
  }

 // 替换文本 记下原文
  function replaceText(node, text) {
    if (!originalTextMap.has(node)) originalTextMap.set(node, node.textContent);
    textBackups.push({ node: node, orig: originalTextMap.get(node) });
    node.textContent = text;
  }

  // 还原全部
  function restoreAll() {
    for (let i = textBackups.length - 1; i >= 0; i--) {
      const b = textBackups[i];
      if (b && b.node && b.node.isConnected) {
        try { b.node.textContent = b.orig; } catch (e) {}
      }
    }
    textBackups = [];
    phBackups.forEach(function (b) {
      try { b.el.placeholder = b.orig; b.el.dataset.tmPh = ''; } catch (e) {}
    });
    phBackups = [];
    translatedNodes = new WeakSet();
    originalTextMap = new WeakMap();
    if (originalTitle) { try { document.title = originalTitle; } catch (e) {} }
  }

 // 翻译页面 边翻边扫 直到没有新内容
  async function translatePage(root, quiet) {
    if (isTranslating) { pendingRoot = root || document.body; return; }
    isTranslating = true;

    try {
      let cur = root || document.body;
      let iter = 0;

      do {
        pendingRoot = null;
        iter++;
        if (iter > CFG.maxIterations) { console.log('[译] 达到迭代上限'); break; }

        const nodes = collectTextNodes(cur);
        const phs = collectPlaceholders(cur);
        if (!nodes.length && !phs.length) {
          if (pendingRoot) { cur = pendingRoot; continue; }
          break;
        }

        const vh = window.innerHeight || 800;
        const items = nodes.map(function (n) {
          const el = n.parentElement;
          let vis = false;
          try { const r = el.getBoundingClientRect(); vis = r.bottom > 0 && r.top < vh; } catch (e) {}
          return { type: 'text', node: n, text: n.textContent.trim(), vis: vis };
        }).concat(phs.map(function (el) {
          let vis = false;
          try { const r = el.getBoundingClientRect(); vis = r.bottom > 0 && r.top < vh; } catch (e) {}
          return { type: 'ph', el: el, text: el.placeholder.trim(), vis: vis };
        }));

        // 屏幕内的先翻
        items.sort(function (a, b) { return (b.vis ? 1 : 0) - (a.vis ? 1 : 0); });

        const batches = chunk(items);
        const t0 = Date.now();

        await runPool(batches.map(function (batch) {
          return async function () {
            const texts = batch.map(function (it) { return it.text; });
            const out = await translateBatch(texts);
            batch.forEach(function (it, i) {
              const tr = (out[i] || '').trim();
              if (!tr || tr === it.text) return;
              cacheSet(it.text, tr);

              if (it.type === 'text') {
                if (!it.node.isConnected) return;
                replaceText(it.node, tr);
                translatedNodes.add(it.node);
              } else {
                if (!it.el.isConnected) return;
                phBackups.push({ el: it.el, orig: it.el.placeholder });
                it.el.placeholder = tr;
                it.el.dataset.tmPh = '1';
              }
              doneCount++;
            });
          };
        }), CFG.concurrency);

        if (!quiet) status('翻译中 ' + doneCount + ' 段 第 ' + iter + ' 轮', 'busy');
        console.log('[译] 第 ' + iter + ' 轮 ' + items.length + ' 项 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');

        if (pendingRoot) { cur = pendingRoot; continue; }
        break;
      } while (pendingRoot);

      translateTitle();
    } finally {
      isTranslating = false;
      if (pendingRoot) {
        const r = pendingRoot;
        pendingRoot = null;
        setTimeout(function () { if (translated) translatePage(r, true); }, 300);
      }
    }
  }

  // 翻译标题
  async function translateTitle() {
    try {
      const t = (document.title || '').trim();
      if (!t || t.length < 3) return;
      if (/[\u4e00-\u9fa5]/.test(t)) return;
      if (!originalTitle) originalTitle = t;
      const c = cacheGet(t);
      if (c) { document.title = c; return; }
      const out = await translateBatch([t]);
      if (out && out[0] && out[0] !== t) {
        cacheSet(t, out[0]);
        if (originalTitle === t) document.title = out[0];
      }
    } catch (e) {}
  }

  // 划词翻译
  let tip = null;
  let selTimer = null;
  let lastSelText = '';

  function ensureTip() {
    if (tip && tip.isConnected) return tip;
    tip = document.createElement('div');
    tip.className = 'tm-tip';
    tip.setAttribute('data-tm-skip', '1');
    document.body.appendChild(tip);
    return tip;
  }

  function hideTip() {
    if (tip) {
      tip.classList.remove('show');
      setTimeout(function () { if (tip && !tip.classList.contains('show')) tip.style.display = 'none'; }, 190);
    }
    lastSelText = '';
  }

 // 气泡定位 优先放选区下方
  function positionTip(rect) {
    if (!tip || !rect) return;
    tip.style.visibility = 'hidden';
    tip.style.display = 'block';
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    let top = rect.bottom + 10;
    if (top + h > window.innerHeight - 8) {
      top = Math.max(8, rect.top - h - 10);
    }
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.style.visibility = 'visible';
  }

  // 取选区位置
  function getSelRect() {
    try {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      let r = range.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) {
        const list = range.getClientRects();
        if (list && list.length) r = list[0];
      }
      if (!r || (!r.width && !r.height)) return null;
      return r;
    } catch (e) { return null; }
  }

  function onSelectionChange() {
    if (!settings.selection) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(async function () {
      let text = '';
      try { text = String(window.getSelection() || '').trim(); } catch (e) { text = ''; }

      if (!text || text.length < 2 || text.length > 1200) { hideTip(); return; }
      if (isTargetLang(text)) { hideTip(); return; }

      try {
        const ae = document.activeElement;
        if (ae && /^(INPUT|TEXTAREA)$/.test(ae.tagName)) return;
      } catch (e) {}

      const rect = getSelRect();
      if (!rect) return;

      ensureTip();
      if (text === lastSelText && tip.classList.contains('show')) {
        positionTip(rect);
        return;
      }
      lastSelText = text;

      const cached = cacheGet(text);
      if (cached) {
        tip.innerHTML = '';
        tip.appendChild(document.createTextNode(cached));
        tip.classList.add('show');
        positionTip(rect);
        return;
      }

      tip.innerHTML = '<span class="tm-tip-load">翻译中</span>';
      tip.classList.add('show');
      positionTip(rect);

      try {
        const out = await translateBatch([text]);
        let cur = '';
        try { cur = String(window.getSelection() || '').trim(); } catch (e) {}
        if (cur !== text) return;
        const tr = (out && out[0] || '').trim();
        if (!tr || tr === text) { hideTip(); return; }
        cacheSet(text, tr);
        tip.innerHTML = '';
        tip.appendChild(document.createTextNode(tr));
        positionTip(rect);
      } catch (e) {
        tip.innerHTML = '<span class="tm-tip-load">翻译失败</span>';
        positionTip(rect);
      }
    }, 320);
  }

  function setupSelection() {
    document.addEventListener('selectionchange', onSelectionChange);

    const dismiss = function (e) {
      if (tip && tip.contains(e.target)) return;
      hideTip();
    };
    document.addEventListener('mousedown', dismiss, true);
    document.addEventListener('touchstart', dismiss, true);
  }

  // 边缘停靠
  function clearSnapTimer() {
    if (snapTimer) { clearTimeout(snapTimer); snapTimer = null; }
  }

  // 按记住的位置摆放
  function applyPos(btn) {
    const p = settings.pos;
    if (p && isFinite(p.left) && isFinite(p.top)) {
      btn.style.left = Math.max(2, Math.min(window.innerWidth - settings.size - 2, p.left)) + 'px';
      btn.style.top = Math.max(2, Math.min(window.innerHeight - settings.size - 2, p.top)) + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    } else {
      btn.style.left = '';
      btn.style.top = '';
      btn.style.right = '14px';
      btn.style.bottom = '150px';
    }
  }

  function doSnap(btn) {
    if (!btn || snapped) return;
    if (panel && panel.style.display === 'block') return;

    const r = btn.getBoundingClientRect();
    const distLeft = r.left;
    const distRight = window.innerWidth - r.right;
    if (Math.min(distLeft, distRight) > 60) return;

    const toLeft = distLeft < distRight;
    const half = Math.round(settings.size * 0.5);

    btn.style.top = Math.round(r.top) + 'px';
    btn.style.bottom = 'auto';
    btn.style.left = toLeft ? (-half) + 'px' : 'auto';
    btn.style.right = toLeft ? 'auto' : (-half) + 'px';
    btn.style.opacity = '0.5';
    snapped = true;
  }

  function doRestore(btn) {
    clearSnapTimer();
    if (!snapped) return;
    snapped = false;
    btn.style.opacity = '1';
    applyPos(btn);
    snapBackup = null;
  }

  function scheduleSnap(btn) {
    clearSnapTimer();
    snapTimer = setTimeout(function () { doSnap(btn); }, CFG.snapDelay);
  }

  // 设置面板
  let panel = null;

  function applyFabStyle(btn) {
    btn.style.width = settings.size + 'px';
    btn.style.height = settings.size + 'px';
    btn.style.fontSize = Math.max(11, Math.round(settings.size * 0.34)) + 'px';
    if (!snapped) btn.style.opacity = '1';
  }

  function buildPanel(btn) {
    panel = document.createElement('div');
    panel.className = 'tm-panel';
    panel.setAttribute('data-tm-skip', '1');
    panel.innerHTML = [
      '<div class="tm-title">翻译设置</div>',
      '<div class="tm-row"><span>划词翻译</span><div class="tm-sw" data-k="selection"></div></div>',
      '<div class="tm-row"><span>新页面自动翻译</span><div class="tm-sw" data-k="auto"></div></div>',
      '<div class="tm-sep"></div>',
      '<div class="tm-row"><span>按钮大小</span><span class="tm-val" data-v="size"></span></div>',
      '<input type="range" data-k="size" min="30" max="78" step="1">',
      '<div class="tm-sep"></div>',
      '<div class="tm-act"><button data-act="retrans">重新翻译</button><button data-act="close">关闭</button></div>'
    ].join('');
    document.body.appendChild(panel);

    // 开关
    panel.querySelectorAll('.tm-sw').forEach(function (sw) {
      const k = sw.dataset.k;
      sw.dataset.on = settings[k] ? '1' : '0';
      sw.addEventListener('click', function (e) {
        e.stopPropagation();
        settings[k] = !settings[k];
        sw.dataset.on = settings[k] ? '1' : '0';
        applyFabStyle(btn);
        saveSettings();
        if (k === 'selection' && !settings.selection) hideTip();
      });
    });

    // 滑块
    panel.querySelectorAll('input[type=range]').forEach(function (input) {
      const k = input.dataset.k;
      input.value = settings[k];
      const label = panel.querySelector('.tm-val[data-v="' + k + '"]');
      if (label) label.textContent = settings[k] + 'px';
      input.addEventListener('input', function () {
        settings[k] = parseInt(input.value, 10);
        if (label) label.textContent = settings[k] + 'px';
        applyFabStyle(btn);
      });
      input.addEventListener('change', saveSettings);
    });

    panel.querySelector('[data-act="retrans"]').addEventListener('click', function () {
      translated = false;
      restoreAll();
      hidePanel();
      doRestore(btn);
      startTranslate(btn, false);
    });
    panel.querySelector('[data-act="close"]').addEventListener('click', hidePanel);
  }

  function showPanel(btn) {
    if (!panel || !panel.isConnected) buildPanel(btn);
    panel.style.display = 'block';
    panel.style.visibility = 'hidden';
    const pw = panel.offsetWidth || 214;
    const ph = panel.offsetHeight || 200;
    const r = btn.getBoundingClientRect();
    let left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left + r.width / 2 - pw / 2));
    let top = r.top - ph - 12;
    if (top < 8) top = Math.min(window.innerHeight - ph - 8, r.bottom + 12);
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.visibility = 'visible';
  }

  function hidePanel() { if (panel) panel.style.display = 'none'; }

  // 悬浮球
  function createFab() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tm-fab';
    btn.setAttribute('data-tm-skip', '1');
    btn.textContent = '译';
    applyFabStyle(btn);

    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false, moved = false, pressTimer = null, wasSnapped = false;
    function clearPress() { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }

    // 按下
    btn.addEventListener('pointerdown', function (e) {
      clearSnapTimer();
      wasSnapped = snapped;
      if (snapped) doRestore(btn);

      const r = btn.getBoundingClientRect();
      ox = r.left; oy = r.top;
      sx = e.clientX; sy = e.clientY;
      dragging = true; moved = false; longPressed = false;

      clearPress();
      pressTimer = setTimeout(function () {
        longPressed = true;
        if (panel && panel.style.display === 'block') hidePanel(); else showPanel(btn);
        try { if (navigator.vibrate) navigator.vibrate(25); } catch (err) {}
      }, 520);

      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    });

    // 拖动
    btn.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { moved = true; clearPress(); }
      btn.style.left = Math.max(2, Math.min(window.innerWidth - settings.size - 2, ox + dx)) + 'px';
      btn.style.top = Math.max(2, Math.min(window.innerHeight - settings.size - 2, oy + dy)) + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    });

    // 记住位置
    function savePos() {
      if (!moved) return;
      const left = parseFloat(btn.style.left);
      const top = parseFloat(btn.style.top);
      if (isFinite(left) && isFinite(top)) {
        settings.pos = { left: Math.round(left), top: Math.round(top) };
        saveSettings();
      }
    }

    btn.addEventListener('pointerup', function () { dragging = false; clearPress(); savePos(); });
    btn.addEventListener('pointercancel', function () { dragging = false; clearPress(); });

    // 点击
    btn.addEventListener('click', function () {
      if (longPressed) { longPressed = false; return; }
      if (moved) { moved = false; return; }
      if (wasSnapped) { wasSnapped = false; return; }

      if (translated) {
        const n = textBackups.length;
        translated = false;
        restoreAll();
        btn.textContent = '译';
        status('已还原 ' + n + ' 段');
        hideStatus(1600);
      } else {
        startTranslate(btn, false);
      }
    });

    document.body.appendChild(btn);
    return btn;
  }

  // 开始翻译
  async function startTranslate(btn, silent) {
    if (isTranslating || translated) return;

    const srcLang = (document.documentElement.getAttribute('lang') || '').toLowerCase().split('-')[0];
    if (srcLang === 'zh' && CFG.target === 'zh') {
      if (!silent) { status('已是中文页面 无需翻译'); hideStatus(2200); }
      else doSnap(btn);
      return;
    }

    translated = true;
    doneCount = 0;
    if (btn) { btn.dataset.busy = '1'; btn.textContent = '译'; }

    const t0 = Date.now();
    try {
      await translatePage(document.body, silent);
      if (btn) { btn.dataset.busy = '0'; btn.textContent = '原'; }
      if (!silent) {
        status('完成 ' + doneCount + ' 段 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
        hideStatus(2400);
      }

      scheduleSnap(btn);

      let round = 0;
      const timer = setInterval(function () {
        round++;
        if (!translated || round > 2) { clearInterval(timer); return; }
        translatePage(document.body, true);
      }, 1800);
    } catch (e) {
      console.warn('[译] 失败 ', e);
      status('失败 ' + e.message, 'err');
      translated = false;
      if (btn) { btn.dataset.busy = '0'; btn.textContent = '译'; }
    }
  }

  // 页面变动后补翻
  function scheduleFlush() {
    if (mutTimer) return;
    mutTimer = setTimeout(function () {
      mutTimer = null;
      if (!translated) { mutRoots.clear(); return; }

      const roots = Array.from(mutRoots);
      mutRoots.clear();
      if (!roots.length) return;

      if (roots.length > 5) translatePage(document.body, true);
      else roots.forEach(function (r) { if (r && r.isConnected) translatePage(r, true); });
    }, 220);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function (muts) {
      if (!translated) return;
      let hit = false;
      for (let k = 0; k < muts.length; k++) {
        const added = muts[k].addedNodes;
        for (let j = 0; j < added.length; j++) {
          const n = added[j];
          if (n.nodeType === 1) {
            if (shouldSkip(n)) continue;
            mutRoots.add(n);
            hit = true;
          } else if (n.nodeType === 3 && n.parentElement) {
            mutRoots.add(n.parentElement);
            hit = true;
          }
        }
        if (hit) break;
      }
      if (hit) scheduleFlush();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 启动
  function init() {
    if (document.getElementById('tm-style')) return;
    loadSettings();
    injectStyle();

    const btn = createFab();
    applyPos(btn);
    startObserver();
    setupSelection();

    window.addEventListener('resize', function () {
      if (!snapped) applyPos(btn);
    });

    console.log('[译] ready | 划词=' + settings.selection + ' | size=' + settings.size + ' | GM=' + (typeof GM_xmlhttpRequest));

    if (settings.auto) setTimeout(function () { startTranslate(btn, true); }, 600);
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})();
