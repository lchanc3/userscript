// ==UserScript==
// @name         DMM region flag rewrite
// @namespace    https://dmm.co.jp/
// @version      2.1.0
// @match        *://*.dmm.com/*
// @match        *://*.dmm.co.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// ===== cookie 段 =====
const domain = location.hostname.endsWith('.dmm.co.jp') || location.hostname === 'dmm.co.jp'
  ? '.dmm.co.jp' : '.dmm.com';
for (const [name, value] of [['ckcy_remedied_check', 'ec_mrnhbtk'], ['ckcy', '1']]) {
  document.cookie = `${name}=; path=/; max-age=0`;   // 清掉 host-only 同名舊值
  document.cookie = `${name}=${value}; domain=${domain}; path=/; max-age=31536000`;
}

(function () {
  'use strict';

  // 在 HAR 看到誰回 isAllowForeign / accessStatus 就加誰
  const HOSTS = new Set(['api.video.dmm.co.jp']);

  // ===== 請求段：搜尋結果補回「海外不可購買」的作品 =====
  //
  // 伺服器依連線地區把海外不可購買的作品從 legacySearchPPV 拿掉——不是隱藏，
  // 是根本沒回傳，所以下面的回應改寫救不回來（活動頁少了一整截就是這個）。
  // DMM 自己的網站在爬蟲模式下會在 legacySearchPPV 補上這個參數拿完整目錄
  // （2026-09-27 從網站 JS 的 urql exchange 查到），這裡對每個請求照做。
  // 實測（海外）：AV 297,628 → 479,911、動漫 0 → 4,125。
  const FLAG = 'forceFetchForeignUnavailable';

  const addFlag = (query) =>
    typeof query === 'string' && query.includes('legacySearchPPV') && !query.includes(FLAG)
      ? query.replace(/legacySearchPPV\s*\(/g, `legacySearchPPV(${FLAG}: true, `)
      : query;

  // POST body：{ query, variables } 或批次的陣列
  const rewriteBody = (body) => {
    if (typeof body !== 'string' || !body.includes('legacySearchPPV')) return body;
    try {
      const j = JSON.parse(body);
      let hit = false;
      for (const op of Array.isArray(j) ? j : [j]) {
        if (!op || typeof op !== 'object') continue;
        const q = addFlag(op.query);
        if (q !== op.query) { op.query = q; hit = true; }
      }
      return hit ? JSON.stringify(j) : body;
    } catch { return body; }
  };

  // GET：query 在網址參數裡（urql 的 preferGetMethod）
  const rewriteUrl = (url) => {
    try {
      const u = new URL(url, location.href);
      const q = u.searchParams.get('query');
      const n = addFlag(q);
      if (!q || n === q) return url;
      u.searchParams.set('query', n);
      return u.toString();
    } catch { return url; }
  };

  // key 對上才動，其他欄位原樣保留
  const RULES = {
    isAllowForeign: v => (v === false ? true : v),
    accessStatus:   v => (v === 'RESTRICT_USER' ? 'OK' : v), // ⚠ 合法值未知，HAR 只看過 RESTRICT_USER
    // countryCode: v => (v === 'TW' ? 'JP' : v), // 只改 UI 顯示，不影響伺服器決策
  };

  const isTarget = (url) => {
    try { return HOSTS.has(new URL(url, location.href).hostname); } catch { return false; }
  };

  const rewrite = (j) => {
    let hit = false;
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      for (const k of Object.keys(o)) {
        const f = RULES[k];
        if (f) { const n = f(o[k]); if (n !== o[k]) { o[k] = n; hit = true; } }
        else walk(o[k]);
      }
    })(j);
    return hit;
  };

  // ---------- fetch ----------
  const _fetch = window.fetch;

  // 送出前改寫請求（body 是字串、或是 Request 物件兩種都處理）
  const prepareFetch = async (input, init) => {
    if (typeof input === 'string' || input instanceof URL) {
      const url = rewriteUrl(String(input));
      if (init && typeof init.body === 'string') init = { ...init, body: rewriteBody(init.body) };
      return [url, init];
    }
    if (input instanceof Request) {
      let req = input;
      const url = rewriteUrl(req.url);
      if (url !== req.url) req = new Request(url, req);
      if (init && typeof init.body === 'string') return [req, { ...init, body: rewriteBody(init.body) }];
      if (req.method === 'POST' && !(init && 'body' in init)) {
        const text = await req.clone().text();
        const body = rewriteBody(text);
        if (body !== text) req = new Request(req, { body });
      }
      return [req, init];
    }
    return [input, init];
  };

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    if (!isTarget(url)) return _fetch.apply(this, arguments);
    const p = prepareFetch(input, init)
      .catch(() => [input, init])                        // 改寫出錯就照原樣送
      .then(([i, o]) => (o === undefined ? _fetch.call(this, i) : _fetch.call(this, i, o)));
    return p.then(res => {
      if (!(res.headers.get('content-type') || '').includes('json')) return res;
      return res.clone().text().then(text => {
        let j; try { j = JSON.parse(text); } catch { return res; }
        if (!rewrite(j)) return res;
        console.info('[dmm-rw] fetch', url);
        return new Response(JSON.stringify(j), {
          status: res.status, statusText: res.statusText, headers: res.headers,
        });
      }).catch(() => res);
    });
  };

  // ---------- XHR ----------
  const _open = XMLHttpRequest.prototype.open;
  const cache = new WeakMap();
  XMLHttpRequest.prototype.open = function () {
    if (isTarget(arguments[1] || '')) arguments[1] = rewriteUrl(String(arguments[1]));
    this.__url = arguments[1];
    cache.delete(this);              // Bug 2：重用時清掉上一輪
    return _open.apply(this, arguments);
  };

  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (isTarget(this.__url || '') && typeof body === 'string') body = rewriteBody(body);
    return _send.call(this, body);
  };

  for (const prop of ['responseText', 'response']) {
    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
    Object.defineProperty(XMLHttpRequest.prototype, prop, {
      configurable: true,
      get() {
        const v = desc.get.call(this);
        if (this.readyState !== 4 || !isTarget(this.__url || '')) return v;
        if (typeof v === 'string') {
          if (cache.has(this)) return cache.get(this);
          let out = v;
          try {
            const j = JSON.parse(v);
            if (rewrite(j)) { console.info('[dmm-rw] xhr', this.__url); out = JSON.stringify(j); }
          } catch { /* 非 JSON 原樣 */ }
          cache.set(this, out);
          return out;     
        }
        if (v && typeof v === 'object' && this.responseType === 'json') rewrite(v);
        return v;
      },
    });
  }
})();
