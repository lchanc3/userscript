// ==UserScript==
// @name         DMM area / redirect fix
// @namespace    https://dmm.co.jp/
// @version      1.1.0
// @match        *://*.dmm.com/*
// @match        *://*.dmm.co.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
(function () {
  // 只能對「當前所在網域」設 cookie，跨站設定會被瀏覽器靜默丟棄
  const domain = location.hostname.endsWith('.dmm.co.jp') || location.hostname === 'dmm.co.jp'
    ? '.dmm.co.jp' : '.dmm.com';
  const opts = `domain=${domain}; path=/; max-age=31536000`;
  document.cookie = `ckcy_remedied_check=ec_mrnhbtk; ${opts}`;
  document.cookie = `ckcy=1; ${opts}`;
})();
