// ==UserScript==
// @name         DMM mylibrary redirect fix
// @namespace    https://dmm.co.jp/
// @version      1.0.0
// @description  設定 ckcy_remedied_check cookie，避免 DMM mylibrary 進入地區判定的無限轉址
// @match        https://*.dmm.co.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

document.cookie = "ckcy_remedied_check=ec_mrnhbtk; domain=.dmm.co.jp; path=/; max-age=31536000; secure";
