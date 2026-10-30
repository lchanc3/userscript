// ==UserScript==
// @name         XXXClub 放大滑鼠預覽圖
// @namespace    https://lchance.org/
// @version      1.0
// @description  滑鼠移到種子連結時，改用原尺寸圖片並放大顯示，自動避開視窗邊緣
// @match        https://xxxclub.to/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 可調整設定 =====
  const MAX_WIDTH = 800;     // 預覽圖最大寬度 (px)
  const MAX_VW = 0.6;        // 最多佔視窗寬度比例
  const MAX_VH = 0.85;       // 最多佔視窗高度比例
  const OFFSET = 16;         // 與游標的距離 (px)

  const style = document.createElement('style');
  style.textContent = `
    img.floaterimg {
      box-sizing: border-box !important;
      width: min(${MAX_WIDTH}px, ${MAX_VW * 100}vw) !important;
      height: auto !important;
      max-height: ${MAX_VH * 100}vh !important;
      object-fit: contain !important;
      z-index: 2147483647 !important;
      box-shadow: 0 4px 24px rgba(0,0,0,.6);
    }`;
  document.head.appendChild(style);

  // 縮圖 /ps/ → 原圖 /p/
  const toFull = (src) => src.replace('://imgxclub.com/ps/', '://imgxclub.com/p/');

  let current = null;

  // 連結的 id 是 "#xxxx"，對應的 img id 是 "xxxx"
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest && e.target.closest('a[onpointerenter*="showImagestart"]');
    if (!a || !a.id) return;
    const img = document.getElementById(a.id.replace(/^#/, ''));
    if (!img || !img.classList.contains('floaterimg')) return;
    current = img;
    const full = toFull(img.src);
    if (full !== img.src && !img.dataset.fullLoading) {
      img.dataset.fullLoading = '1';
      const pre = new Image();
      pre.onload = () => { img.src = full; };
      pre.src = full;
    }
  }, true);

  // 網站自己的 followMouse 掛在 document 上；這個掛在 window，冒泡順序較晚，會覆蓋它的位置
  window.addEventListener('pointermove', (e) => {
    const img = current;
    if (!img || getComputedStyle(img).display === 'none') return;
    const r = img.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    let x = e.clientX + OFFSET;
    if (x + r.width > vw) x = e.clientX - OFFSET - r.width; // 右邊放不下就翻到左邊
    x = Math.max(0, Math.min(x, vw - r.width));

    let y = e.clientY + OFFSET;
    if (y + r.height > vh) y = vh - r.height;               // 下面放不下就往上推
    y = Math.max(0, y);

    img.style.left = x + 'px';
    img.style.top = y + 'px';
  });
})();
