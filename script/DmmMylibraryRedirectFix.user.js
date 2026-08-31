// ==UserScript==
// @name         DMM region flag rewrite
// @namespace    https://dmm.co.jp/
// @version      2.0.0
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
  window.fetch = function () {
    const input = arguments[0];
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const p = _fetch.apply(this, arguments);
    if (!isTarget(url)) return p;
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

  // ---------- XHR：prototype getter 惰性改寫，不受 handler 註冊順序影響 ----------
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    this.__url = arguments[1];
    return _open.apply(this, arguments);
  };

  const cache = new WeakMap();
  for (const prop of ['responseText', 'response']) {
    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, prop);
    Object.defineProperty(XMLHttpRequest.prototype, prop, {
      configurable: true,
      get() {
        const v = desc.get.call(this);
        if (this.readyState !== 4 || !isTarget(this.__url || '')) return v;
        if (typeof v === 'string') {
          if (!cache.has(this)) {
            let j; try { j = JSON.parse(v); } catch { return v; }
            if (rewrite(j)) {
              console.info('[dmm-rw] xhr', this.__url);
              cache.set(this, JSON.stringify(j));
            }
            return v;
          }
          return cache.get(this);
        }
        if (v && typeof v === 'object' && this.responseType === 'json') rewrite(v);
        return v;
      },
    });
  }
})();
