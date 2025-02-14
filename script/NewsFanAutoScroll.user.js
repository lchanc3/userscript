// ==UserScript==
// @name         NewsFan.jp 自動翻頁和點擊
// @namespace    https://github.com/lchanc3/userscript
// @version      1.0
// @license      MIT
// @description  自動滾動並點擊「続きを読む」，若找不到則點擊「スタンプページへ」連結
// @homepage     https://github.com/lchanc3/userscript
// @updateURL    
// @downloadURL    
// @author       lchanc3
// @match        https://www.life-n.jp/sp/article/?article_id=*
// @match        https://www.trepy.jp/sp/article/?article_id=*
// @match        https://point-news.jp/sp/article/?article_id=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lastHeight = 0; // 記錄上次滾動的高度
    let scrollInterval = 50; // 滾動頻率
    let buttonCheckInterval = 150; // 檢查是否有按鈕頻率
    let maxScrollAttempts = 10; // 最大嘗試滾動次數

    // 自動滾動到底部
    function autoScroll() {
        let attempts = 0;

        let scrollLoop = setInterval(() => {
            window.scrollTo(0, document.body.scrollHeight);

            if (document.body.scrollHeight === lastHeight) {
                attempts++;
                if (attempts >= maxScrollAttempts) {
                    console.log("已經無法再滾動，停止滾動");
                    clearInterval(scrollLoop);
                }
            } else {
                attempts = 0;
            }

            lastHeight = document.body.scrollHeight;
        }, scrollInterval);
    }

    // 自動點擊按鈕（先點擊 `btnNext`，若找不到則點擊 `button_stamp` 內的 `<a>`）
    function autoClickButton() {
        let clickLoop = setInterval(() => {
  
            let button = document.querySelector('[class^="btnNext"]');

            if (button) {
                console.log("發現按鈕「続きを読む」，正在點擊...", button.className);
                button.click();
                return;
            }

            let link = document.querySelector('.button_stamp a');
            if (link) {
                console.log("未找到「続きを読む」，改點擊「スタンプページへ」連結", link.href);
                window.location.href = link.href; 
            } else {
                console.log("未找到「続きを読む」與「スタンプページへ」，繼續檢查...");
            }
        }, buttonCheckInterval);
    }


    autoScroll();
    autoClickButton();
})();
