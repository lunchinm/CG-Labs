/*
 * ui.js
 * 界面装配：参数面板 schema、顶栏上下文提示、状态账本、首次引导。
 * 控件外观与行为由 ui-system/system.js 提供，这里只描述“有哪些参数与分组”。
 */

(function () {
  'use strict';

  var store = UI.store;

  function q(selector) {
    return document.querySelector(selector);
  }

  // -------------------------------------------------------- 自定义行：动作按钮
  // system.js 的注册表只提供 gauge / bank / key / note / fold，
  // “清空笔画”这类一次性动作没有现成行型，按规范通过 register 扩展，
  // 不去改 buildRow 的分支。

  UI.register('action', function (row) {
    var field = document.createElement('div');
    field.className = 'ui-field ui-field--key';

    var label = document.createElement('span');
    label.className = 'ui-field__label';
    label.textContent = row.label || '';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-key';
    button.dataset.ui = 'action';

    var led = document.createElement('span');
    led.className = 'ui-key__led';
    var text = document.createElement('span');
    text.className = 'ui-key__label';
    text.textContent = row.action || '执行';

    button.appendChild(led);
    button.appendChild(text);
    button.addEventListener('click', function () {
      if (typeof row.run === 'function') row.run(store);
    });

    field.appendChild(label);
    field.appendChild(button);
    return field;
  });

  // ---------------------------------------------------------------- 参数面板

  var controlSchema = [
    {
      id: 'shape', index: '01', title: '图形', open: true,
      meta: function (s) { return SHAPE_LABEL[s.shape] || s.shape; },
      rows: [
        { type: 'bank', id: 'shape', label: '形状', command: 'shape.rect', options: [
          { value: 'rect', label: '矩形' },
          { value: 'tri', label: '三角形' },
          { value: 'circle', label: '圆形' },
          { value: 'star', label: '五角星' }
        ] },
        { type: 'note', text: '1–4 切换；点击画布让形状缓动移动到该处，颜色随之随机。' }
      ]
    },
    {
      id: 'rotate', index: '02', title: '旋转',
      meta: function (s) { return Number(s.rotSpeed) === 0 ? '停止' : describeSpeed(Number(s.rotSpeed)); },
      rows: [
        { type: 'gauge', id: 'rotSpeed', label: '转速', min: -360, max: 360, step: 10, unit: '°/s', digits: 0, command: 'rotate.stop' },
        { type: 'note', text: '中点为 0；正值顺时针、负值逆时针。Space 归零，↑↓ 每次 10°/s。' }
      ]
    },
    {
      id: 'sketch', index: '03', title: '手绘',
      meta: function (s) { return s.handdraw ? '绘制中' : '关闭'; },
      rows: [
        { type: 'key', id: 'handdraw', label: '手绘模式', on: '绘制中', off: '关闭', command: 'sketch.toggle' },
        { type: 'action', label: '笔画', action: '清空全部', run: function () {
          if (window.HW1) window.HW1.clearStrokes();
        } },
        { type: 'key', id: 'pivotAdjust', label: '旋转中心', on: '点选中', off: '质心', command: 'sketch.pivot' },
        { type: 'note', text: '按住左键画笔画，松开断一笔；可连画多笔，再按 G 或点「手绘模式」完成。' }
      ]
    }
  ];

  function describeSpeed(value) {
    var away = Math.abs(Math.round(value));
    return (value > 0 ? '顺时针 ' : '逆时针 ') + away + ' °/s';
  }

  UI.buildPanel(q('[data-ui="rack-body"]'), controlSchema, store);

  // ---------------------------------------------------------------- 上下文提示

  var HINTS = {
    shape: [['1–4', '形状'], ['G', '手绘'], ['R', '复位'], ['F', '沉浸']],
    rotate: [['Space', '停止'], ['↑↓', '微调'], ['R', '复位'], ['/', '命令']],
    sketch: [['G', '完成'], ['X', '调中心'], ['Del', '清空'], ['R', '复位']],
    'default': [['1–4', '形状'], ['G', '手绘'], ['Space', '停转'], ['F', '沉浸']]
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

  var GUIDE_KEY = 'hw1/guide/v1';

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
    // 让布局状态与「01 图形默认展开」一致，顶栏提示才能按分组切换
    UI.setDrawer('shape', true);
    renderHints();
    initGuide();
    UI.mount(document);
  }

  window.addEventListener('load', initUI);
}());
