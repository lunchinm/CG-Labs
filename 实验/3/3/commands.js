/*
 * commands.js
 * 唯一的动作来源：所有键盘、鼠标、面板之外的动作都通过命令注册表执行。
 * 面板控件由 ui.js 的 controlSchema 生成，行上的 command 字段只用于按键提示定位。
 */

var PASS = ['最终画面', '阴影', '环境反射', '雾效', '法线', '透明度'];

var SCENE_DEFAULTS = Object.assign({
  lightType: 0,
  lightDist: 10.5,
  lightAzimuth: -128,
  lightElevation: 74,
  cameraAzimuth: 20,
  cameraElevation: 72,
  cameraDist: 7.4,
  targetX: 0,
  targetZ: 0,
  fov: 50
}, MATERIAL_DEFAULTS);

UI.store.patch(SCENE_DEFAULTS);

// ---------------------------------------------------------------- 01 LIGHT

UI.registerCommand({
  id: 'light.point', group: '01 光照', label: '点光源', keys: ['C'],
  run: function (s) { s.set('lightType', 0); },
  detail: function () { return '光照 · 点光'; }
});

UI.registerCommand({
  id: 'light.dir', group: '01 光照', label: '平行光', keys: ['V'],
  run: function (s) { s.set('lightType', 1); },
  detail: function () { return '光照 · 平行光'; }
});

UI.registerCommand({
  id: 'light.orbit.left', group: '01 光照', label: '光源左转 5°', keys: ['A'],
  run: function (s) { s.set('lightAzimuth', wrapAngle(s.get('lightAzimuth') - 5)); },
  detail: function (s) { return '方位 ' + s.get('lightAzimuth').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'light.orbit.right', group: '01 光照', label: '光源右转 5°', keys: ['D'],
  run: function (s) { s.set('lightAzimuth', wrapAngle(s.get('lightAzimuth') + 5)); },
  detail: function (s) { return '方位 ' + s.get('lightAzimuth').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'light.orbit.up', group: '01 光照', label: '光源升高 2°', keys: ['W'],
  run: function (s) { s.set('lightElevation', clampNumber(s.get('lightElevation') + 2, 5, 89)); },
  detail: function (s) { return '仰角 ' + s.get('lightElevation').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'light.orbit.down', group: '01 光照', label: '光源降低 2°', keys: ['S'],
  run: function (s) { s.set('lightElevation', clampNumber(s.get('lightElevation') - 2, 5, 89)); },
  detail: function (s) { return '仰角 ' + s.get('lightElevation').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'light.dist.inc', group: '01 光照', label: '光源距离 +0.5 m', keys: ['Y'],
  run: function (s) { s.set('lightDist', roundTo(Math.min(12, s.get('lightDist') + 0.5), 1)); },
  detail: function (s) { return '距离 ' + s.get('lightDist').toFixed(1) + ' m'; }
});

UI.registerCommand({
  id: 'light.dist.dec', group: '01 光照', label: '光源距离 −0.5 m', keys: ['U'],
  run: function (s) { s.set('lightDist', roundTo(Math.max(2, s.get('lightDist') - 0.5), 1)); },
  detail: function (s) { return '距离 ' + s.get('lightDist').toFixed(1) + ' m'; }
});

// ---------------------------------------------------------------- 02 CAMERA

UI.registerCommand({
  id: 'camera.orbit.left', group: '02 相机', label: '相机左移 5°', keys: ['J'],
  run: function (s) { s.set('cameraAzimuth', roundTo(wrapAngle(s.get('cameraAzimuth') - 5), 1)); },
  detail: function (s) { return '相机方位 ' + s.get('cameraAzimuth').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'camera.orbit.right', group: '02 相机', label: '相机右移 5°', keys: ['L'],
  run: function (s) { s.set('cameraAzimuth', roundTo(wrapAngle(s.get('cameraAzimuth') + 5), 1)); },
  detail: function (s) { return '相机方位 ' + s.get('cameraAzimuth').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'camera.orbit.up', group: '02 相机', label: '相机升高 2°', keys: ['I'],
  run: function (s) { s.set('cameraElevation', roundTo(clampNumber(s.get('cameraElevation') + 2, 8, 88), 1)); },
  detail: function (s) { return '相机仰角 ' + s.get('cameraElevation').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'camera.orbit.down', group: '02 相机', label: '相机降低 2°', keys: ['K'],
  run: function (s) { s.set('cameraElevation', roundTo(clampNumber(s.get('cameraElevation') - 2, 8, 88), 1)); },
  detail: function (s) { return '相机仰角 ' + s.get('cameraElevation').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'camera.fov.inc', group: '02 相机', label: '视场角 +2°', keys: ['M'],
  run: function (s) { s.set('fov', Math.min(90, s.get('fov') + 2)); },
  detail: function (s) { return '视场角 ' + s.get('fov').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'camera.fov.dec', group: '02 相机', label: '视场角 −2°', keys: ['N'],
  run: function (s) { s.set('fov', Math.max(20, s.get('fov') - 2)); },
  detail: function (s) { return '视场角 ' + s.get('fov').toFixed(0) + '°'; }
});

UI.registerCommand({
  id: 'camera.exposure.reset', group: '02 相机', label: '曝光复位 1.00', keys: [],
  run: function (s) { s.set('exposure', 1.0); },
  detail: function () { return '曝光 1.00'; }
});

// ---------------------------------------------------------------- 03 VIEW

UI.registerCommand({
  id: 'view.pass', group: '03 视图', label: '切换渲染视图', keys: ['P'],
  run: function (s) { s.set('pass', (s.get('pass') + 1) % PASS.length); },
  detail: function (s) { return '视图 ' + PASS[s.get('pass')]; }
});

[
  ['最终画面', 0, 'final'],
  ['阴影', 1, 'shadow'],
  ['环境反射', 2, 'reflect'],
  ['雾效', 3, 'fog'],
  ['法线', 4, 'normal'],
  ['透明度', 5, 'glass']
].forEach(function (entry) {
  UI.registerCommand({
    id: 'view.pass.' + entry[2], group: '03 视图',
    label: '视图 ' + entry[0], keys: [],
    run: function (s) { s.set('pass', entry[1]); },
    detail: function () { return '视图 ' + entry[0]; }
  });
});

UI.registerCommand({
  id: 'view.focus', group: '03 视图', label: '沉浸模式', keys: ['F'],
  run: function () { UI.toggleFocus(); },
  detail: function () { return UI.getLayout().focus ? '沉浸 开' : '沉浸 关'; }
});

// ---------------------------------------------------------------- 04 EFFECTS

[
  ['effects.shadow', '阴影', 'enableShadow'],
  ['effects.pcf', 'PCF 柔化', 'enablePCF'],
  ['effects.bump', '凹凸贴图', 'enableBump'],
  ['effects.fog', '雾效', 'enableFog'],
  ['effects.reflect', '环境反射', 'enableReflect'],
  ['effects.waterReflect', '水面反射', 'enableWaterReflect'],
  ['effects.glass', '透明混合', 'enableTransparent']
].forEach(function (entry) {
  UI.registerCommand({
    id: entry[0], group: '04 特效', label: entry[1], keys: [],
    run: function (s) { s.set(entry[2], !s.get(entry[2])); },
    detail: function (s) { return entry[1] + (s.get(entry[2]) ? ' 开' : ' 关'); }
  });
});

// ---------------------------------------------------------------- 05 SCENE

UI.registerCommand({
  id: 'scene.detail', group: '05 场景', label: '背景来源 简易贴图 / 完整地形', keys: [],
  run: function (s) { s.set('sceneDetail', s.get('sceneDetail') ? 0 : 1); },
  detail: function (s) { return '背景 ' + (s.get('sceneDetail') ? '完整地形，水与云流动' : '简易贴图，静止'); }
});

UI.registerCommand({
  id: 'scene.reset', group: '05 场景', label: '重置场景参数', keys: ['Space'],
  run: function (s) { s.patch(SCENE_DEFAULTS); },
  detail: function () { return '场景已重置'; }
});

// ---------------------------------------------------------------- 06 SYSTEM

UI.registerCommand({
  id: 'ui.commandIndex', group: '06 系统', label: '命令索引', keys: ['Ctrl+K', '/'],
  closeLayer: false,
  run: function () { UI.openCommandIndex(); },
  detail: function () { return '命令索引'; }
});

UI.registerCommand({
  id: 'ui.help', group: '06 系统', label: '快捷键', keys: ['?'],
  closeLayer: false,
  run: function () { UI.openKeyLedger(); },
  detail: function () { return '快捷键'; }
});
