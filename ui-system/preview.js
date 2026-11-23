/* 页面层：命令、schema 与读数；视觉与行为由 system.js 提供。 */
(function () {
  'use strict';

  var store = UI.store;
  var PASS = ['FINAL', 'SHADOW', 'REFLECT', 'FOG', 'BUMP', 'GLASS'];

  var DEFAULTS = {
    lightType: 0,
    lightDist: 6.0,
    lightAzimuth: -35,
    lightElevation: 62,
    ka: 0.60,
    kd: 0.85,
    ks: 0.55,
    shininess: 96,
    pass: 0,
    envMix: 0.65,
    opacity: 0.55,
    bumpStrength: 1.0,
    fogDensity: 0.03,
    rimStrength: 0.35,
    aoStrength: 0.35,
    horizonGlow: 0.18,
    fov: 52,
    cameraDist: 6.5,
    exposure: 1.0,
    enableShadow: true,
    enablePCF: true,
    enableBump: true,
    enableFog: true,
    enableReflect: true,
    enableTransparent: true
  };

  store.patch(DEFAULTS);

  function q(selector) {
    return document.querySelector(selector);
  }

  function wrapAzimuth(value) {
    var next = ((value + 180) % 360 + 360) % 360 - 180;
    return next;
  }

  // ---------------------------------------------------------- commands

  UI.registerCommand({
    id: 'light.point', group: '01 LIGHT', label: '点光源 POINT', keys: ['C'],
    run: function (s) { s.set('lightType', 0); },
    detail: function () { return 'LIGHT · POINT'; }
  });

  UI.registerCommand({
    id: 'light.dir', group: '01 LIGHT', label: '平行光 DIR', keys: ['V'],
    run: function (s) { s.set('lightType', 1); },
    detail: function () { return 'LIGHT · DIRECTIONAL'; }
  });

  UI.registerCommand({
    id: 'light.orbit.left', group: '01 LIGHT', label: '光源左转 5°', keys: ['A'],
    run: function (s) { s.set('lightAzimuth', wrapAzimuth(s.get('lightAzimuth') - 5)); },
    detail: function (s) { return 'AZIM ' + s.get('lightAzimuth').toFixed(0) + '°'; }
  });

  UI.registerCommand({
    id: 'light.orbit.right', group: '01 LIGHT', label: '光源右转 5°', keys: ['D'],
    run: function (s) { s.set('lightAzimuth', wrapAzimuth(s.get('lightAzimuth') + 5)); },
    detail: function (s) { return 'AZIM ' + s.get('lightAzimuth').toFixed(0) + '°'; }
  });

  UI.registerCommand({
    id: 'light.dist.inc', group: '01 LIGHT', label: '光源距离 +0.5', keys: [],
    run: function (s) { s.set('lightDist', Math.min(12, Number((s.get('lightDist') + 0.5).toFixed(1)))); },
    detail: function (s) { return 'DIST ' + s.get('lightDist').toFixed(1) + ' m'; }
  });

  UI.registerCommand({
    id: 'light.dist.dec', group: '01 LIGHT', label: '光源距离 −0.5', keys: [],
    run: function (s) { s.set('lightDist', Math.max(2, Number((s.get('lightDist') - 0.5).toFixed(1)))); },
    detail: function (s) { return 'DIST ' + s.get('lightDist').toFixed(1) + ' m'; }
  });

  UI.registerCommand({
    id: 'camera.fov.inc', group: '02 CAMERA', label: '视场角 +2°', keys: ['M'],
    run: function (s) { s.set('fov', Math.min(90, s.get('fov') + 2)); },
    detail: function (s) { return 'FOV ' + s.get('fov') + '°'; }
  });

  UI.registerCommand({
    id: 'camera.fov.dec', group: '02 CAMERA', label: '视场角 −2°', keys: ['N'],
    run: function (s) { s.set('fov', Math.max(20, s.get('fov') - 2)); },
    detail: function (s) { return 'FOV ' + s.get('fov') + '°'; }
  });

  UI.registerCommand({
    id: 'camera.exposure.reset', group: '02 CAMERA', label: '曝光复位 1.00', keys: [],
    run: function (s) { s.set('exposure', 1.0); },
    detail: function () { return 'EXPOSURE 1.00'; }
  });

  UI.registerCommand({
    id: 'view.pass', group: '03 VIEW', label: '切换渲染通道', keys: ['P'],
    run: function (s) { s.set('pass', (s.get('pass') + 1) % PASS.length); },
    detail: function (s) { return 'PASS ' + PASS[s.get('pass')]; }
  });

  UI.registerCommand({
    id: 'view.focus', group: '03 VIEW', label: '沉浸模式', keys: ['F'],
    run: function () { UI.toggleFocus(); },
    detail: function () { return UI.getLayout().focus ? 'IMMERSIVE ON' : 'IMMERSIVE OFF'; }
  });

  UI.registerCommand({
    id: 'scene.reset', group: '04 SCENE', label: '重置场景参数', keys: ['Space'],
    run: function (s) { s.patch(DEFAULTS); s.set('pass', 0); },
    detail: function () { return 'SCENE RESET'; }
  });

  UI.registerCommand({
    id: 'ui.commandIndex', group: '05 SYSTEM', label: '命令索引', keys: ['Ctrl+K', '/'],
    closeLayer: false,
    run: function () { UI.openCommandIndex(); },
    detail: function () { return 'COMMAND INDEX'; }
  });

  UI.registerCommand({
    id: 'ui.help', group: '05 SYSTEM', label: '键位账本', keys: ['?'],
    closeLayer: false,
    run: function () { UI.openKeyLedger(); },
    detail: function () { return 'KEY LEDGER'; }
  });

  [
    ['effects.shadow', '阴影 SHADOW', 'enableShadow'],
    ['effects.pcf', 'PCF 反走样', 'enablePCF'],
    ['effects.bump', '凹凸 BUMP', 'enableBump'],
    ['effects.fog', '雾化 FOG', 'enableFog'],
    ['effects.reflect', '环境反射 REFLECT', 'enableReflect'],
    ['effects.glass', '半透明 GLASS', 'enableTransparent']
  ].forEach(function (entry) {
    UI.registerCommand({
      id: entry[0], group: '03 VIEW', label: entry[1], keys: [],
      run: function (s) { s.set(entry[2], !s.get(entry[2])); },
      detail: function (s) { return entry[2].replace('enable', '').toUpperCase() + ' ' + (s.get(entry[2]) ? 'ON' : 'OFF'); }
    });
  });

  // ---------------------------------------------------------- panel

  var schema = [
    {
      id: 'light', index: '01', title: 'LIGHT',
      meta: function (s) { return s.lightType ? 'DIR' : 'POINT'; },
      rows: [
        { type: 'bank', id: 'lightType', label: 'TYPE', command: 'light.point', options: [
          { value: 0, label: 'POINT' },
          { value: 1, label: 'DIR' }
        ] },
        { type: 'gauge', id: 'lightDist', label: 'DIST', min: 2, max: 12, step: 0.1, unit: 'm', command: 'light.dist.inc' },
        { type: 'gauge', id: 'lightAzimuth', label: 'AZIM', min: -180, max: 180, step: 1, unit: '°', digits: 0, command: 'light.orbit.right' },
        { type: 'gauge', id: 'lightElevation', label: 'ELEV', min: 5, max: 89, step: 1, unit: '°', digits: 0 },
        { type: 'note', text: 'A / D 环绕光源；距离与高度拖动刻度线，双击复位。' }
      ]
    },
    {
      id: 'material', index: '02', title: 'MATERIAL',
      meta: function (s) { return 'KA ' + Number(s.ka).toFixed(2); },
      rows: [
        { type: 'gauge', id: 'ka', label: 'KA', min: 0, max: 1, step: 0.01 },
        { type: 'gauge', id: 'kd', label: 'KD', min: 0, max: 1, step: 0.01 },
        { type: 'gauge', id: 'ks', label: 'KS', min: 0, max: 1, step: 0.01 },
        { type: 'gauge', id: 'shininess', label: 'SHINE', min: 8, max: 256, step: 1, digits: 0 },
        { type: 'note', text: '木纹亮度调制高光：暗纹 ×0.35，亮纹 ×1.0。' }
      ]
    },
    {
      id: 'effects', index: '03', title: 'EFFECTS',
      meta: function (s) { return PASS[s.pass]; },
      rows: [
        { type: 'bank', id: 'pass', label: 'PASS', compact: true, command: 'view.pass', options: [
          { value: 0, label: 'FINAL' },
          { value: 1, label: 'SHADOW' },
          { value: 2, label: 'REFLECT' },
          { value: 3, label: 'FOG' },
          { value: 4, label: 'BUMP' },
          { value: 5, label: 'GLASS' }
        ] },
        { type: 'gauge', id: 'envMix', label: 'ENV', min: 0, max: 1, step: 0.01, command: 'effects.reflect' },
        { type: 'gauge', id: 'opacity', label: 'GLASS', min: 0.05, max: 1, step: 0.01, command: 'effects.glass' },
        { type: 'gauge', id: 'bumpStrength', label: 'BUMP', min: 0, max: 2, step: 0.01, command: 'effects.bump' },
        { type: 'gauge', id: 'fogDensity', label: 'FOG', min: 0, max: 0.08, step: 0.001, digits: 3, command: 'effects.fog' },
        { type: 'key', id: 'enableShadow', label: 'SHADOW', command: 'effects.shadow' },
        { type: 'key', id: 'enablePCF', label: 'PCF', command: 'effects.pcf' },
        { type: 'key', id: 'enableReflect', label: 'REFLECT', command: 'effects.reflect' },
        { type: 'key', id: 'enableFog', label: 'FOG', command: 'effects.fog' },
        { type: 'key', id: 'enableTransparent', label: 'GLASS', command: 'effects.glass' },
        { type: 'fold', label: 'MORE · 03 PARAMETERS', rows: [
          { type: 'gauge', id: 'rimStrength', label: 'RIM', min: 0, max: 1, step: 0.01 },
          { type: 'gauge', id: 'aoStrength', label: 'AO', min: 0, max: 1, step: 0.01 },
          { type: 'gauge', id: 'horizonGlow', label: 'GLOW', min: 0, max: 1, step: 0.01 }
        ] }
      ]
    },
    {
      id: 'camera', index: '04', title: 'CAMERA',
      meta: function (s) { return Number(s.exposure).toFixed(2) + ' EV'; },
      rows: [
        { type: 'gauge', id: 'fov', label: 'FOV', min: 20, max: 90, step: 1, unit: '°', digits: 0, command: 'camera.fov.inc' },
        { type: 'gauge', id: 'cameraDist', label: 'DIST', min: 3, max: 12, step: 0.1, unit: 'm' },
        { type: 'gauge', id: 'exposure', label: 'EXPO', min: 0.6, max: 1.6, step: 0.01, digits: 2, command: 'camera.exposure.reset' },
        { type: 'note', text: 'ACES 色调映射后再输出；曝光只作用于最终合成。' }
      ]
    }
  ];

  UI.buildPanel(q('[data-ui="rack-body"]'), schema, store);

  // ---------------------------------------------------------- hints

  var HINTS = {
    light: [['C', '点光'], ['V', '平行光'], ['A/D', '环绕'], ['K', '索引']],
    material: [['↑↓', '微调读数'], ['K', '索引'], ['?', '键位']],
    effects: [['P', '通道循环'], ['K', '索引'], ['?', '键位']],
    camera: [['M/N', '视场角'], ['F', '沉浸'], ['K', '索引']],
    'default': [['C', '点光'], ['V', '平行光'], ['P', '通道'], ['F', '沉浸'], ['/', '命令']]
  };

  function renderHints() {
    var layout = UI.getLayout();
    var context = layout.drawers.length ? layout.drawers[layout.drawers.length - 1] : 'default';
    var list = HINTS[context] || HINTS.default;
    var host = q('[data-ui="hints"]');
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

  // ---------------------------------------------------------- ledger

  function renderLedger(state) {
    q('[data-cell="light"]').textContent = (state.lightType ? 'DIR' : 'POINT') + ' · ' + Number(state.lightDist).toFixed(1) + ' m';
    q('[data-cell="camera"]').textContent = Number(state.fov).toFixed(0) + '° · ' + Number(state.cameraDist).toFixed(1) + ' m';
    var fx = ['enableShadow', 'enablePCF', 'enableBump', 'enableFog', 'enableReflect', 'enableTransparent'].filter(function (key) {
      return state[key];
    }).length;
    q('[data-cell="effects"]').textContent = fx + ' / 6 ON';
    q('[data-cell="pass"]').textContent = PASS[state.pass];
    q('[data-cell="mode"]').textContent = PASS[state.pass];
  }

  store.subscribe(renderLedger);
  renderLedger(store.get());

  UI.mount(document);
  renderHints();
})();