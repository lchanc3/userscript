// ==UserScript==
// @name         原價屋估價：清單滑過即預覽圖片
// @namespace    https://github.com/lchanc3/userscript
// @version      1.0
// @description  把原價屋線上估價的下拉選單換成自訂清單，滑鼠移到品項上就在旁邊顯示商品圖片與價格，另附關鍵字篩選
// @author       lchanc3
// @homepage     https://github.com/lchanc3/userscript
// @supportURL   https://github.com/lchanc3/userscript/issues
// @downloadURL  https://raw.githubusercontent.com/lchanc3/userscript/main/script/CoolpcHoverPreview.user.js
// @updateURL    https://raw.githubusercontent.com/lchanc3/userscript/main/script/CoolpcHoverPreview.user.js
// @match        *://www.coolpc.com.tw/evaluate.php*
// @match        *://coolpc.com.tw/evaluate.php*
// @grant        none
// @inject-into  page
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';
  if (window.__cpxHoverPreview) return;
  window.__cpxHoverPreview = true;

  const W = window;
  const HOVER_DELAY = 80;          // 滑過多久才載圖（毫秒）
  const cache = new Map();         // "類別:選項值" -> Promise<HTMLElement>

  // ---------- 樣式 ----------
  const style = document.createElement('style');
  style.textContent = `
#cpx-list{position:fixed;z-index:2147483646;display:none;flex-direction:column;background:#fff;
  border:1px solid #778;box-shadow:0 6px 20px rgba(0,0,0,.28);font:13px/1.45 "Microsoft JhengHei","PingFang TC",sans-serif;color:#222}
#cpx-filter{margin:5px;padding:3px 7px;border:1px solid #aab;border-radius:3px;font:inherit;outline:none}
#cpx-filter:focus{border-color:#47a}
#cpx-items{overflow-y:auto;flex:1;overscroll-behavior:contain}
#cpx-items .g{position:sticky;top:0;padding:2px 7px;font-weight:bold;background:#e8ecf6;color:#334;border-top:1px solid #d4d9e6}
#cpx-items .o{padding:1px 7px 1px 18px;cursor:default}
#cpx-items .o.top{padding-left:7px}
#cpx-items .o.r{color:#c00}
#cpx-items .o.dis{color:#999;cursor:not-allowed}
#cpx-items .o.cur{font-weight:bold;background:#fff1c2}
#cpx-items .o.act{background:#cfe0f5}
#cpx-items .empty{padding:8px;color:#888}
#cpx-hint{padding:2px 7px;font-size:11px;color:#888;border-top:1px solid #eee}
#cpx-prev{position:fixed;z-index:2147483647;display:none;width:280px;box-sizing:border-box;padding:8px;background:#fff;
  border:2px solid #f0a020;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.28);pointer-events:none;
  font:13px/1.5 "Microsoft JhengHei","PingFang TC",sans-serif;color:#222}
#cpx-prev img{display:block;max-width:100%;max-height:380px;margin:0 auto 6px;object-fit:contain}
#cpx-prev .price{font-weight:bold;color:#c00}
#cpx-prev .msg{color:#888}
`;
  document.head.append(style);

  // ---------- 元件 ----------
  const list = document.createElement('div');
  list.id = 'cpx-list';
  list.innerHTML = '<input id="cpx-filter" type="text" placeholder="輸入關鍵字篩選（空白分隔多個）" autocomplete="off" spellcheck="false">'
    + '<div id="cpx-items"></div>'
    + '<div id="cpx-hint">↑↓ 移動・Enter 選取・Esc 關閉・Alt+點選單 用原生選單</div>';
  const prev = document.createElement('div');
  prev.id = 'cpx-prev';
  document.body.append(list, prev);

  const filter = list.querySelector('#cpx-filter');
  const items = list.querySelector('#cpx-items');

  let curSel = null;   // 目前開啟的 <select>
  let curIdx = 0;      // 類別編號（n8 → 8）
  let active = null;   // 目前反白的項目
  let timer = 0;

  // 擋掉網站掛在 body 上的鍵盤／選取限制，避免干擾篩選框
  for (const t of ['keydown', 'keyup', 'keypress', 'selectstart', 'contextmenu']) {
    list.addEventListener(t, e => e.stopPropagation());
  }

  // ---------- 建立清單 ----------
  function addOption(o, inGroup, groupEl) {
    const d = document.createElement('div');
    d.className = 'o' + (inGroup ? '' : ' top') + (o.classList.contains('r') ? ' r' : '')
      + (o.disabled ? ' dis' : '') + (o.selected ? ' cur' : '');
    d.textContent = o.text.trim();
    d._opt = o;
    d._group = groupEl;
    items.append(d);
  }

  function build(sel) {
    items.textContent = '';
    for (const node of sel.children) {
      if (node.tagName === 'OPTGROUP') {
        const g = document.createElement('div');
        g.className = 'g';
        g.textContent = node.label;
        items.append(g);
        for (const o of node.children) if (o.tagName === 'OPTION') addOption(o, true, g);
      } else if (node.tagName === 'OPTION') {
        addOption(node, false, null);
      }
    }
  }

  function visibleOptions() {
    return [...items.querySelectorAll('.o')].filter(d => d.style.display !== 'none' && !d._opt.disabled);
  }

  function applyFilter() {
    const kws = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    const shownGroups = new Set();
    let any = false;
    for (const d of items.querySelectorAll('.o')) {
      const t = d.textContent.toLowerCase();
      const ok = kws.every(k => t.includes(k));
      d.style.display = ok ? '' : 'none';
      if (ok) { any = true; if (d._group) shownGroups.add(d._group); }
    }
    for (const g of items.querySelectorAll('.g')) g.style.display = (!kws.length || shownGroups.has(g)) ? '' : 'none';
    let empty = items.querySelector('.empty');
    if (!any) {
      if (!empty) { empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '沒有符合的品項'; items.append(empty); }
    } else if (empty) empty.remove();
    if (active && active.style.display === 'none') { active.classList.remove('act'); active = null; hidePrev(); }
  }

  // ---------- 開關 ----------
  function open(sel) {
    curSel = sel;
    curIdx = parseInt(sel.name.slice(1), 10);
    build(sel);
    filter.value = '';

    const r = sel.getBoundingClientRect();
    const below = innerHeight - r.bottom - 8;
    const above = r.top - 8;
    list.style.left = Math.max(4, r.left) + 'px';
    list.style.width = Math.max(r.width, 420) + 'px';
    if (below >= 320 || below >= above) {
      list.style.top = r.bottom + 'px';
      list.style.bottom = 'auto';
      list.style.maxHeight = Math.min(below, innerHeight * 0.75) + 'px';
    } else {
      list.style.top = 'auto';
      list.style.bottom = (innerHeight - r.top) + 'px';
      list.style.maxHeight = Math.min(above, innerHeight * 0.75) + 'px';
    }
    list.style.display = 'flex';
    filter.focus({ preventScroll: true });

    const cur = items.querySelector('.o.cur');
    if (cur && cur._opt.value !== '0') {
      cur.scrollIntoView({ block: 'center' });
      setActive(cur, false);
    }
  }

  function close() {
    clearTimeout(timer);
    list.style.display = 'none';
    hidePrev();
    curSel = null;
    active = null;
  }

  function choose(d) {
    const o = d._opt;
    if (!o || o.disabled || !curSel) return;
    const sel = curSel;
    close();
    if (sel.value !== o.value) {
      sel.value = o.value;
      sel.dispatchEvent(new Event('change', { bubbles: true })); // 觸發網站原本的 cnt(i) 計價
    }
  }

  // ---------- 反白與預覽 ----------
  function setActive(d, scroll) {
    if (active) active.classList.remove('act');
    active = d;
    if (!d) { hidePrev(); return; }
    d.classList.add('act');
    if (scroll) d.scrollIntoView({ block: 'nearest' });
    schedulePreview(d);
  }

  function hidePrev() {
    clearTimeout(timer);
    prev.style.display = 'none';
  }

  function placePrev() {
    if (!active) return;
    prev.style.display = 'block';
    const lr = list.getBoundingClientRect();
    const ir = active.getBoundingClientRect();
    const pw = prev.offsetWidth, ph = prev.offsetHeight;
    let left = lr.right + 6;
    if (left + pw > innerWidth - 4) left = lr.left - pw - 6;      // 右邊放不下就放左邊
    if (left < 4) left = innerWidth - pw - 4;                       // 兩邊都不夠就貼齊右緣
    const top = Math.max(4, Math.min(ir.top - 8, innerHeight - ph - 4));
    prev.style.left = left + 'px';
    prev.style.top = top + 'px';
  }

  function showPrev(node) {
    prev.textContent = '';
    prev.append(node);
    placePrev();
    const img = prev.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', placePrev, { once: true });
  }

  function msg(text) {
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = text;
    return d;
  }

  function schedulePreview(d) {
    clearTimeout(timer);
    const o = d._opt;
    if (o.disabled || o.value === '0') { hidePrev(); return; }
    const idx = curIdx;
    timer = setTimeout(async () => {
      const g = W['g' + idx];
      const G = g ? g[o.value] : 0;
      // 跟網站邏輯一致：G 的整數部分為 0 代表沒有參考圖片
      if (!G || Math.trunc(Number(G)) === 0) { showPrev(msg('這個品項沒有參考圖片')); return; }
      const key = idx + ':' + o.value;
      let p = cache.get(key);
      if (!p) {
        p = fetchPreview(G);
        cache.set(key, p);
        p.catch(() => cache.delete(key));
      }
      if (!(await Promise.race([p.then(() => true, () => true), new Promise(r => setTimeout(r, 150, false))]))) {
        if (active === d) showPrev(msg('載入中…'));
      }
      try {
        const node = await p;
        if (active === d) showPrev(node.cloneNode(true));
      } catch (err) {
        if (active === d) showPrev(msg('圖片載入失敗'));
      }
    }, HOVER_DELAY);
  }

  async function fetchPreview(G) {
    const body = 'G=' + encodeURIComponent(G) + (typeof W.DD === 'string' ? W.DD : '&D=1');
    const res = await fetch('eva-img.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = new TextDecoder('big5').decode(await res.arrayBuffer());
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const box = document.createElement('div');
    const src = doc.querySelector('img')?.getAttribute('src');
    if (src) {
      const img = document.createElement('img');
      img.src = new URL(src, location.href).href;
      box.append(img);
    }
    // 取出沒有巢狀表格的儲存格文字（品名、價格）
    const lines = [...doc.querySelectorAll('td')]
      .filter(td => !td.querySelector('table'))
      .map(td => td.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!lines.length) {
      const t = doc.body?.textContent.replace(/\s+/g, ' ').trim();
      if (t) lines.push(t);
    }
    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      if (/含稅價|NT\s*\d/.test(line)) div.className = 'price';
      box.append(div);
    }
    if (!box.childNodes.length) box.append(msg('沒有可顯示的內容'));
    return box;
  }

  // ---------- 事件 ----------
  items.addEventListener('mouseover', e => {
    const d = e.target.closest('.o');
    if (d && d !== active && !d._opt.disabled) setActive(d, false);
  });
  items.addEventListener('mouseleave', () => {
    if (active) active.classList.remove('act');
    active = null;
    hidePrev();
  });
  items.addEventListener('click', e => {
    const d = e.target.closest('.o');
    if (d) choose(d);
  });

  filter.addEventListener('input', applyFilter);
  filter.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (active) choose(active); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      const vis = visibleOptions();
      if (!vis.length) return;
      const step = e.key.startsWith('Page') ? 10 : 1;
      const dir = (e.key === 'ArrowDown' || e.key === 'PageDown') ? 1 : -1;
      let i = vis.indexOf(active);
      i = i < 0 ? (dir > 0 ? 0 : vis.length - 1) : Math.max(0, Math.min(vis.length - 1, i + dir * step));
      setActive(vis[i], true);
    }
  });

  // 攔截估價選單的點擊，改開自訂清單；按住 Alt 則保留原生選單
  document.addEventListener('mousedown', e => {
    if (list.contains(e.target)) return;
    const sel = e.target.closest ? e.target.closest('select') : null;
    if (sel && /^n\d+$/.test(sel.name) && e.button === 0 && !e.altKey) {
      e.preventDefault();
      if (curSel === sel) close();
      else open(sel);
      return;
    }
    if (curSel) close();
  }, true);

  // 頁面捲動或視窗縮放時關閉（清單內捲動不影響）
  W.addEventListener('scroll', e => { if (curSel && !list.contains(e.target)) close(); }, true);
  W.addEventListener('resize', () => { if (curSel) close(); });
})();
