/*
 * ui.js
 * 把 3d-wandering.js 已经维护的那套状态镜像到新外壳上。
 *
 * 这个页面的渲染脚本是作业要求的成品，状态与 DOM 写入都在里面
 * （#stProjection / #stModel / #stTrans …）。因此这里不做第二份状态：
 * 外壳只负责抽屉开合、边轨与沉浸模式，读数从状态账本镜像到抽屉头。
 */

(function () {
  'use strict';

  function q(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  // ---------------------------------------------------------------- 抽屉

  function wireDrawers() {
    $$('[data-ui="drawer"] .ui-drawer__head').forEach(function (head) {
      head.addEventListener('click', function () {
        var drawer = head.closest('.ui-drawer');
        if (!drawer) return;
        UI.setDrawer(drawer.dataset.group, drawer.dataset.open !== 'true');
      });
    });
  }

  // ------------------------------------------------- 抽屉头的读数（镜像账本）

  var MIRROR = [
    { from: 'stModel', to: 'segModelMeta' },
    { from: 'stCamMode', to: 'stCamModeMeta' },
    { from: 'stTrans', to: 'stTransMeta' },
    { from: 'valSpeed', to: 'valSpeedMeta' }
  ];

  function mirror() {
    MIRROR.forEach(function (pair) {
      var source = document.getElementById(pair.from);
      var target = document.getElementById(pair.to);
      if (!source || !target) return;
      var text = source.textContent;
      if (target.textContent !== text) target.textContent = text;
    });
  }

  function watchLedger() {
    var ledge = q('[data-ui="ledger"]');
    if (!ledge || typeof window.MutationObserver !== 'function') return;
    new window.MutationObserver(mirror).observe(ledge, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  // ------------------------------------------- 层次模型出现时自动展开动画抽屉

  function watchAnimPanel() {
    var panel = document.getElementById('animPanel');
    if (!panel || typeof window.MutationObserver !== 'function') return;
    new window.MutationObserver(function () {
      var hidden = panel.classList.contains('is-hidden');
      if (!hidden && panel.dataset.open !== 'true') {
        UI.setDrawer('anim', true);
      }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  // ---------------------------------------------------------------- 启动

  function initUI() {
    wireDrawers();
    watchLedger();
    watchAnimPanel();
    UI.setDrawer('model', true);
    mirror();
    UI.mount(document);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
}());