/*
 * commands.js
 * 唯一的动作来源：键盘、命令索引、面板控件都改同一份状态。
 * 面板行上的 command 字段只用于键位提示定位，真正执行的是这里的 run。
 */

UI.store.patch({
  shape: 'rect',
  rotSpeed: 0,
  handdraw: false,
  pivotAdjust: false
});

var SHAPE_LABEL = { rect: '矩形', tri: '三角形', circle: '圆形', star: '五角星' };

// ---------------------------------------------------------------- 01 图形

UI.registerCommand({
  id: 'shape.rect', group: '01 图形', label: '矩形', keys: ['1'],
  run: function (s) { s.set('shape', 'rect'); },
  detail: function () { return '图形 · 矩形'; }
});

UI.registerCommand({
  id: 'shape.tri', group: '01 图形', label: '三角形', keys: ['2'],
  run: function (s) { s.set('shape', 'tri'); },
  detail: function () { return '图形 · 三角形'; }
});

UI.registerCommand({
  id: 'shape.circle', group: '01 图形', label: '圆形', keys: ['3'],
  run: function (s) { s.set('shape', 'circle'); },
  detail: function () { return '图形 · 圆形'; }
});

UI.registerCommand({
  id: 'shape.star', group: '01 图形', label: '五角星', keys: ['4'],
  run: function (s) { s.set('shape', 'star'); },
  detail: function () { return '图形 · 五角星'; }
});

// ---------------------------------------------------------------- 02 旋转

UI.registerCommand({
  id: 'rotate.stop', group: '02 旋转', label: '停止旋转', keys: ['space'],
  run: function (s) { s.set('rotSpeed', 0); },
  detail: function (s) { return '旋转 · ' + s.get('rotSpeed') + ' °/s'; }
});

UI.registerCommand({
  id: 'rotate.faster', group: '02 旋转', label: '加速 10°/s', keys: ['up'],
  run: function (s) { s.set('rotSpeed', Math.min(360, s.get('rotSpeed') + 10)); },
  when: function (s) { return s.get('rotSpeed') < 360; }
});

UI.registerCommand({
  id: 'rotate.slower', group: '02 旋转', label: '减速 10°/s', keys: ['down'],
  run: function (s) { s.set('rotSpeed', Math.max(-360, s.get('rotSpeed') - 10)); },
  when: function (s) { return s.get('rotSpeed') > -360; }
});

UI.registerCommand({
  id: 'rotate.center', group: '02 旋转', label: '旋转中心回到质心', keys: ['shift+x'],
  run: function (s) { s.set('pivotAdjust', false); if (window.HW1) window.HW1.resetPivot(); },
  when: function (s) { return s.get('handdraw'); }
});

// ---------------------------------------------------------------- 03 手绘

UI.registerCommand({
  id: 'sketch.toggle', group: '03 手绘', label: '手绘 / 完成绘制', keys: ['g'],
  run: function (s) { s.set('handdraw', !s.get('handdraw')); },
  detail: function (s) { return s.get('handdraw') ? '手绘 · 绘制中' : '手绘 · 关闭'; }
});

UI.registerCommand({
  id: 'sketch.clear', group: '03 手绘', label: '清空全部笔画', keys: ['del'],
  run: function () { if (window.HW1) window.HW1.clearStrokes(); },
  when: function (s) { return s.get('handdraw'); }
});

UI.registerCommand({
  id: 'sketch.pivot', group: '03 手绘', label: '调整旋转中心', keys: ['x'],
  run: function (s) { s.set('pivotAdjust', !s.get('pivotAdjust')); },
  when: function (s) { return s.get('handdraw'); },
  detail: function (s) { return s.get('pivotAdjust') ? '中心 · 点选' : '中心 · 质心'; }
});

// ---------------------------------------------------------------- 04 通用

UI.registerCommand({
  id: 'view.reset', group: '04 通用', label: '复位（形状、转速、手绘）', keys: ['r'],
  run: function (s) {
    s.patch({ shape: 'rect', rotSpeed: 0, handdraw: false, pivotAdjust: false });
    if (window.HW1) window.HW1.resetScene();
  },
  detail: function () { return '复位 · 矩形 / 0 °/s'; }
});

UI.registerCommand({
  id: 'ui.commands', group: '04 通用', label: '命令索引', keys: ['ctrl+k', '/'],
  // 打开浮层的命令不能被 execute 的收尾逻辑立刻关掉
  closeLayer: false,
  run: function () { UI.openCommandIndex(); }
});

UI.registerCommand({
  id: 'ui.keys', group: '04 通用', label: '快捷键账本', keys: ['?'],
  closeLayer: false,
  run: function () { UI.openKeyLedger(); }
});

UI.registerCommand({
  id: 'ui.rack', group: '04 通用', label: '收起 / 展开参数面板', keys: ['p'],
  run: function () { UI.toggleArea('rack'); }
});

UI.registerCommand({
  id: 'ui.focus', group: '04 通用', label: '沉浸模式', keys: ['f'],
  run: function () { UI.toggleFocus(); }
});