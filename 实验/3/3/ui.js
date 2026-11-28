/*
 * ui.js
 * 界面装配：参数面板 schema、顶栏上下文提示、状态栏、首次引导。
 * 视觉与行为由 ui-system/system.js 提供，这里只描述“有哪些参数与分组”。
 */

(function () {
  'use strict';

  var store = UI.store;

  function q(selector) {
    return document.querySelector(selector);
  }

  // ---------------------------------------------------------------- 参数面板

  var controlSchema = [
    {
      id: 'light', index: '01', title: '光照',
      meta: function (s) { return s.lightType ? '平行光' : '点光源'; },
      rows: [
        { type: 'bank', id: 'lightType', label: '光源类型', command: 'light.point', options: [
          { value: 0, label: '点光源' },
          { value: 1, label: '平行光' }
        ] },
        { type: 'gauge', id: 'lightDist', label: '光源距离', min: 2, max: 12, step: 0.1, unit: 'm', command: 'light.dist.inc' },
        { type: 'gauge', id: 'lightAzimuth', label: '方位角', min: -180, max: 180, step: 1, unit: '°', digits: 0, command: 'light.orbit.right' },
        { type: 'gauge', id: 'lightElevation', label: '仰角', min: 5, max: 89, step: 1, unit: '°', digits: 0, command: 'light.orbit.up' },
        { type: 'note', text: 'W / S 调整仰角，A / D 环绕；距离与角度可直接拖动刻度。' }
      ]
    },
    {
      id: 'material', index: '02', title: '材质',
      meta: function (s) { return '环境光 ' + Number(s.ka).toFixed(2); },
      rows: [
        { type: 'gauge', id: 'ka', label: '环境光', min: 0, max: 1, step: 0.01 },
        { type: 'gauge', id: 'kd', label: '漫反射', min: 0, max: 1, step: 0.01 },
        { type: 'gauge', id: 'ks', label: '高光强度', min: 0, max: 1, step: 0.01 },
        { type: 'gauge', id: 'shininess', label: '高光锐度', min: 8, max: 256, step: 1, digits: 0 },
        { type: 'note', text: '高光按纹理亮度调制：暗纹 ×0.35，亮纹 ×1.0。' }
      ]
    },
    {
      id: 'effects', index: '03', title: '特效',
      meta: function (s) { return PASS[s.pass]; },
      rows: [
        { type: 'bank', id: 'pass', label: '渲染视图', compact: true, command: 'view.pass', options: [
          { value: 0, label: '最终画面' },
          { value: 1, label: '阴影' },
          { value: 2, label: '环境反射' },
          { value: 3, label: '雾效' },
          { value: 4, label: '法线' },
          { value: 5, label: '透明度' }
        ] },
        { type: 'bank', id: 'sceneDetail', label: '背景来源', command: 'scene.detail', options: [
          { value: 0, label: '简易贴图' },
          { value: 1, label: '完整地形' }
        ] },
        { type: 'note', text: '完整地形：水面波浪与体积云随时间流动，持续重绘；简易贴图：模板天空盒照片，静止，负载低。' },
        { type: 'note', text: '按对象分组：正方体 / 地板 / 周围环境。' },
        { type: 'fold', label: '正方体 · 反射与透明', rows: [
          { type: 'key', id: 'enableReflect', label: '环境反射', command: 'effects.reflect' },
          { type: 'key', id: 'enableTransparent', label: '透明混合', command: 'effects.glass' },
          { type: 'gauge', id: 'envMix', label: '反射强度', min: 0, max: 1, step: 0.01, command: 'effects.reflect' },
          { type: 'gauge', id: 'opacity', label: '不透明度', min: 0.05, max: 1, step: 0.01, command: 'effects.glass' }
        ] },
        { type: 'fold', label: '地板 · 凹凸', rows: [
          { type: 'gauge', id: 'bumpStrength', label: '凹凸强度', min: 0, max: 2, step: 0.01, command: 'effects.bump' },
          { type: 'key', id: 'enableBump', label: '凹凸贴图', command: 'effects.bump' }
        ] },
        { type: 'fold', label: '周围环境 · 雾与天空', rows: [
          { type: 'key', id: 'enableShadow', label: '阴影', command: 'effects.shadow' },
          { type: 'key', id: 'enablePCF', label: 'PCF 柔化', command: 'effects.pcf' },
          { type: 'key', id: 'enableFog', label: '雾效', command: 'effects.fog' },
          { type: 'gauge', id: 'fogDensity', label: '雾浓度', min: 0, max: 0.08, step: 0.001, digits: 3, command: 'effects.fog' },
          { type: 'gauge', id: 'waterReflect', label: '水面反射', min: 0, max: 1, step: 0.01, command: 'effects.waterReflect' },
          { type: 'key', id: 'enableWaterReflect', label: '水面反射开关', command: 'effects.waterReflect' },
          { type: 'gauge', id: 'skyGlow', label: '天空亮度', min: 0, max: 1, step: 0.01 }
        ] }
      ]
    },
    {
      id: 'camera', index: '04', title: '相机',
      meta: function (s) { return Number(s.exposure).toFixed(2) + ' EV'; },
      rows: [
        { type: 'gauge', id: 'fov', label: '视场角', min: 20, max: 90, step: 1, unit: '°', digits: 0, command: 'camera.fov.inc' },
        { type: 'gauge', id: 'cameraDist', label: '相机距离', min: 3, max: 12, step: 0.1, unit: 'm' },
        { type: 'gauge', id: 'exposure', label: '曝光', min: 0.6, max: 1.6, step: 0.01, digits: 2, command: 'camera.exposure.reset' },
        { type: 'note', text: 'ACES 色调映射后输出；左键环绕，右键或滚轮改变距离。' }
      ]
    }
  ];

  UI.buildPanel(q('[data-ui="rack-body"]'), controlSchema, store);

  // 特效抽屉默认展开“正方体 · 反射与透明”，一进去就能看到反射与透明参数。
  var effectsDrawer = q('[data-ui="drawer"][data-group="effects"]');
  if (effectsDrawer) {
    var firstFold = effectsDrawer.querySelector('.ui-fold');
    if (firstFold && firstFold.getAttribute('aria-expanded') !== 'true') {
      firstFold.click();
    }
  }

  // ---------------------------------------------------------------- 上下文提示

  var HINTS = {
    light: [['C', '点光源'], ['V', '平行光'], ['A/D', '环绕'], ['W/S', '仰角'], ['K', '索引']],
    material: [['↑↓', '微调参数'], ['Space', '重置'], ['K', '索引'], ['?', '快捷键']],
    effects: [['P', '切换视图'], ['Space', '重置'], ['K', '索引'], ['?', '快捷键']],
    camera: [['M/N', '视场角'], ['F', '沉浸'], ['K', '索引'], ['?', '快捷键']],
    'default': [['C', '点光源'], ['V', '平行光'], ['P', '视图'], ['F', '沉浸'], ['/', '命令']]
  };

  function renderHints() {
    var layout = UI.getLayout();
    var context = layout.drawers.length ? layout.drawers[layout.drawers.length - 1] : 'default';
    var list = HINTS[context] || HINTS.default;
    var host = q('[data-ui="hints"]');
    if (!host) return;

    host.textContent = '';
    list.forEach(function (item) {
      var hint = document.createElement('span');
      hint.className = 'ui-hint';
      var kbd = document.createElement('span');
      kbd.className = 'ui-kbd';
      kbd.textContent = item[0];
      hint.appendChild(kbd);
      hint.appendChild(document.createTextNode(item[1]));
      host.appendChild(hint);
    });
  }

  UI.on('layout', renderHints);

  // ---------------------------------------------------------------- 状态栏

  function angleText(value) {
    var rounded = Math.round(Number(value));
    var absolute = Math.abs(rounded);
    var text = absolute < 10 ? '00' + absolute : (absolute < 100 ? '0' + absolute : String(absolute));
    return (rounded < 0 ? '−' : '') + text;
  }

  function renderLedger(state) {
    var light = q('[data-cell="light"]');
    var camera = q('[data-cell="camera"]');
    var effects = q('[data-cell="effects"]');
    var pass = q('[data-cell="pass"]');
    var mode = q('[data-cell="mode"]');
    var meta = q('[data-cell="scene-meta"]');

    if (light) {
      light.textContent = (state.lightType ? '平行光' : '点光源') + ' · ' + Number(state.lightDist).toFixed(1) + ' m';
    }
    if (camera) {
      camera.textContent = Number(state.fov).toFixed(0) + '° · ' + Number(state.cameraDist).toFixed(1) + ' m';
    }
    if (effects) {
      var enabled = ['enableShadow', 'enablePCF', 'enableBump', 'enableFog', 'enableReflect', 'enableWaterReflect', 'enableTransparent']
        .filter(function (key) { return state[key]; }).length;
      effects.textContent = enabled + ' / 7 启用';
    }
    if (pass) pass.textContent = PASS[state.pass];
    if (mode) mode.textContent = PASS[state.pass];
    if (meta) {
      meta.textContent = '相机 ' + angleText(state.cameraAzimuth) + '° / '
        + angleText(state.cameraElevation) + '° / '
        + Number(state.cameraDist).toFixed(1) + '  ·  光照 '
        + angleText(state.lightAzimuth) + '° / '
        + angleText(state.lightElevation) + '°';
    }
  }

  store.subscribe(renderLedger);

  // ---------------------------------------------------------------- 首次引导

  var GUIDE_KEY = 'hw3/guide/v1';

  function initGuide() {
    var guide = q('[data-ui="guide"]');
    if (!guide) return;

    var seen = false;
    try {
      seen = window.localStorage.getItem(GUIDE_KEY) === 'done';
    } catch (error) {
      seen = false;
    }

    if (seen) {
      guide.hidden = true;
      return;
    }

    guide.hidden = false;
    var unsubscribe = null;

    function dismiss() {
      guide.hidden = true;
      try {
        window.localStorage.setItem(GUIDE_KEY, 'done');
      } catch (error) {
        /* localStorage 不可用时只关闭本次提示 */
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }

    var button = guide.querySelector('[data-guide="dismiss"]');
    if (button) button.addEventListener('click', dismiss);
    unsubscribe = UI.on('command', dismiss);
  }

  // ---------------------------------------------------------------- 启动

  function initUI() {
    renderHints();
    renderLedger(store.get());
    initGuide();
    UI.mount(document);
  }

  window.addEventListener('load', initUI);
}());
