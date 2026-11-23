/*
 * ui-system / system.js
 * 共用行为层：状态仓库、命令注册表、面板构建、控件绑定、三态收起、命令索引、键位账本、按键回声。
 * 不依赖任何框架；页面只提供 DOM 契约与 schema。
 */
window.UI = (function () {
  'use strict';

  var STORAGE_KEY = 'ui-system/layout/v1:' + (window.location.pathname || '/');

  var RESERVED_KEYS = [
    'ctrl+w', 'ctrl+t', 'ctrl+n', 'ctrl+r', 'ctrl+l', 'ctrl+d',
    'ctrl+shift+i', 'ctrl+shift+j', 'f5', 'f11', 'f12'
  ];

  // ---------------------------------------------------------------- utils

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function decimalsOf(step) {
    var text = String(step);
    if (text.indexOf('e-') !== -1) return Number(text.split('e-')[1]);
    var dot = text.indexOf('.');
    return dot === -1 ? 0 : text.length - dot - 1;
  }

  function snap(value, min, step) {
    if (!step) return value;
    var steps = Math.round((value - min) / step);
    return min + steps * step;
  }

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'style') Object.assign(node.style, value);
        else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  // ---------------------------------------------------------------- motion

  /**
   * 动效实现层：只暴露原生 CSS / WAAPI / FLIP，不引入运行时依赖。
   * 时长从 CSS token 读取，JS 不复制第二套数字。
   */
  var motion = (function () {
    var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var timings = {
      hoverIntent: 120,
      hoverClose: 180,
      echo: 1400,
      highlight: 600,
      layout: 320
    };

    function readTime(name, fallback) {
      var value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      if (!value) return fallback;
      if (value.slice(-2) === 'ms') return parseFloat(value);
      if (value.slice(-1) === 's') return parseFloat(value) * 1000;
      return fallback;
    }

    function refresh() {
      timings.hoverIntent = readTime('--ui-delay-hover', 120);
      timings.hoverClose = readTime('--ui-delay-close', 180);
      timings.echo = readTime('--ui-echo-ms', 1400);
      timings.highlight = readTime('--ui-highlight-ms', 600);
      timings.layout = readTime('--ui-dur-4', 320);
      return Object.assign({}, timings);
    }

    function duration(ms) {
      return reduceQuery.matches ? 0 : Number(ms) || 0;
    }

    /**
     * WAAPI 包装：统一处理 reduced-motion 与空元素。
     * @param {Element|null} element
     * @param {Keyframe[]|PropertyIndexedKeyframes} keyframes
     * @param {KeyframeAnimationOptions} options
     * @returns {Animation|null}
     */
    function animate(element, keyframes, options) {
      if (!element || typeof element.animate !== 'function') return null;
      var config = Object.assign({ duration: 0, easing: 'linear', fill: 'none' }, options || {});
      config.duration = duration(config.duration);
      return element.animate(keyframes, config);
    }

    /**
     * FLIP：先记录首帧，执行布局变更，再用 transform 补间。
     * 只用于容器或图片；文字密集的块优先使用 CSS Grid 轨道过渡。
     * @param {Element|null} element
     * @param {() => void} mutate
     * @param {KeyframeAnimationOptions} [options]
     * @returns {Animation|null}
     */
    function flip(element, mutate, options) {
      if (!element || typeof mutate !== 'function') return null;
      var first = element.getBoundingClientRect();
      mutate();
      var last = element.getBoundingClientRect();
      if (!last.width || !last.height) return null;

      var dx = first.left - last.left;
      var dy = first.top - last.top;
      var sx = first.width / last.width;
      var sy = first.height / last.height;
      if (!dx && !dy && sx === 1 && sy === 1) return null;

      return animate(element, [
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')' },
        { transform: 'translate(0,0) scale(1,1)' }
      ], Object.assign({
        duration: timings.layout,
        easing: 'cubic-bezier(.22,.61,.36,1)'
      }, options || {}));
    }

    refresh();

    return {
      refresh: refresh,
      timings: timings,
      reduced: function () { return reduceQuery.matches; },
      duration: duration,
      animate: animate,
      flip: flip
    };
  }());

  // ---------------------------------------------------------------- store

  function createStore(initial) {
    var state = Object.assign({}, initial || {});
    var listeners = new Set();
    var batching = 0;
    var queued = null;

    function emit(changed) {
      if (batching > 0) {
        queued = queued || {};
        Object.keys(changed).forEach(function (key) { queued[key] = changed[key]; });
        return;
      }
      listeners.forEach(function (listener) { listener(state, changed); });
    }

    return {
      get: function (key) {
        return key === undefined ? state : state[key];
      },
      has: function (key) {
        return Object.prototype.hasOwnProperty.call(state, key);
      },
      set: function (key, value) {
        if (Object.is(state[key], value)) return value;
        var prev = state[key];
        state[key] = value;
        emit({ [key]: { value: value, prev: prev } });
        return value;
      },
      patch: function (next) {
        var changed = {};
        Object.keys(next).forEach(function (key) {
          if (Object.is(state[key], next[key])) return;
          changed[key] = { value: next[key], prev: state[key] };
          state[key] = next[key];
        });
        if (Object.keys(changed).length) emit(changed);
      },
      batch: function (fn) {
        batching += 1;
        try {
          fn();
        } finally {
          batching -= 1;
          if (batching === 0 && queued) {
            var changed = queued;
            queued = null;
            emit(changed);
          }
        }
      },
      subscribe: function (listener) {
        listeners.add(listener);
        return function () { listeners.delete(listener); };
      },
      snapshot: function () {
        return Object.assign({}, state);
      }
    };
  }

  var store = createStore({});

  // ---------------------------------------------------------------- keys

  var KEY_ALIASES = {
    ' ': 'space',
    'spacebar': 'space',
    'escape': 'esc',
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    'delete': 'del'
  };

  function normalizeToken(token) {
    var text = String(token).trim();
    var lower = text.toLowerCase();
    return KEY_ALIASES[lower] || lower;
  }

  function normalizeKey(spec) {
    if (!spec) return '';
    var raw = String(spec).trim();
    if (raw.indexOf('+') === -1) return normalizeToken(raw);
    var parts = raw.split('+').map(function (part) { return part.trim(); }).filter(Boolean);
    var key = normalizeToken(parts.pop());
    var mods = parts.map(function (part) { return part.toLowerCase(); });
    var ordered = ['ctrl', 'alt', 'shift', 'meta'].filter(function (mod) {
      return mods.indexOf(mod) !== -1;
    });
    return ordered.concat(key).join('+');
  }

  function eventToKey(event) {
    var mods = [];
    if (event.ctrlKey || event.metaKey) mods.push('ctrl');
    if (event.altKey) mods.push('alt');

    var key = event.key;
    if (key === ' ' || key === 'Spacebar') key = 'space';
    else if (key === 'Escape') key = 'esc';
    else if (key === 'ArrowUp') key = 'up';
    else if (key === 'ArrowDown') key = 'down';
    else if (key === 'ArrowLeft') key = 'left';
    else if (key === 'ArrowRight') key = 'right';
    else if (key === 'Delete') key = 'del';
    else if (key.length === 1) key = key.toLowerCase();
    else key = key.toLowerCase();

    var isSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
    if (event.shiftKey && !isSymbol) mods.push('shift');
    return mods.concat(key).join('+');
  }

  function withoutShift(key) {
    return key.split('+').filter(function (part) { return part !== 'shift'; }).join('+');
  }

  function displayKey(spec) {
    var labels = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta', space: 'Space', esc: 'Esc', up: '↑', down: '↓', left: '←', right: '→' };
    return normalizeKey(spec).split('+').map(function (part) {
      return labels[part] || part.toUpperCase();
    }).join('+');
  }

  function isTypingTarget(target) {
    return !!(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function trapFocus(node, event) {
    if (event.key !== 'Tab') return;
    var focusables = $$('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])', node).filter(function (element) {
      return !element.disabled && element.getClientRects().length > 0;
    });
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // ---------------------------------------------------------------- registry

  var componentFactories = new Map();

  /**
   * 注册一种面板行组件。新组件只扩展注册表，不修改 buildRow 的 switch。
   * @param {string} type
   * @param {(row: Object, context: Object) => Node} factory
   * @returns {Function}
   */
  function register(type, factory) {
    if (typeof type !== 'string' || !type) throw new Error('[UI] register 需要类型名');
    if (typeof factory !== 'function') throw new Error('[UI] register 需要工厂函数: ' + type);
    if (componentFactories.has(type)) throw new Error('[UI] 组件类型重复注册: ' + type);
    componentFactories.set(type, factory);
    return factory;
  }

  function createComponent(row) {
    var factory = componentFactories.get(row.type);
    if (!factory) throw new Error('[UI] 未注册的组件类型: ' + row.type);
    return factory(row, {
      store: store,
      buildRow: buildRow,
      h: h,
      $: $,
      $$: $$,
      motion: motion
    });
  }

  // ---------------------------------------------------------------- commands

  var commands = new Map();
  var keyMap = new Map();
  var hooks = { command: new Set(), layout: new Set() };

  function on(event, listener) {
    if (!hooks[event]) throw new Error('[UI] 未知事件: ' + event);
    hooks[event].add(listener);
    return function () { hooks[event].delete(listener); };
  }

  function emitEvent(event, payload) {
    hooks[event].forEach(function (listener) { listener(payload); });
  }

  function registerCommand(def) {
    if (!def || !def.id) throw new Error('[UI] registerCommand 需要 id');
    if (commands.has(def.id)) throw new Error('[UI] 命令重复注册: ' + def.id);

    var keys = (def.keys || []).map(normalizeKey).filter(Boolean);
    keys.forEach(function (key) {
      if (RESERVED_KEYS.indexOf(key) !== -1) {
        throw new Error('[UI] ' + def.id + ' 占用了浏览器保留键: ' + displayKey(key));
      }
      if (keyMap.has(key)) {
        throw new Error('[UI] 键位冲突: ' + displayKey(key) + ' 已被 ' + keyMap.get(key).id + ' 使用');
      }
    });

    var command = Object.assign({
      group: 'GENERAL',
      label: def.id,
      context: 'global',
      keys: []
    }, def, { keys: keys });

    commands.set(command.id, command);
    keys.forEach(function (key) { keyMap.set(key, command); });
    return command;
  }

  function getCommand(id) {
    return commands.get(id) || null;
  }

  function listCommands() {
    return Array.from(commands.values());
  }

  function searchCommands(query) {
    var text = String(query || '').trim().toLowerCase();
    var list = listCommands();
    if (!text) return list;

    return list.map(function (command) {
      var label = command.label.toLowerCase();
      var group = command.group.toLowerCase();
      var id = command.id.toLowerCase();
      var keys = command.keys.map(displayKey).join(' ').toLowerCase();
      var score = 0;
      if (label.indexOf(text) === 0) score += 8;
      else if (label.indexOf(text) !== -1) score += 4;
      if (id.indexOf(text) !== -1) score += 3;
      if (group.indexOf(text) !== -1) score += 2;
      if (keys.indexOf(text) !== -1) score += 2;
      return { command: command, score: score };
    }).filter(function (entry) {
      return entry.score > 0;
    }).sort(function (a, b) {
      return b.score - a.score;
    }).map(function (entry) {
      return entry.command;
    });
  }

  function execute(command, payload) {
    if (!command) return false;
    if (typeof command.when === 'function' && !command.when(store)) return false;
    if (typeof command.run === 'function') command.run(store, payload);
    var detail = typeof command.detail === 'function' ? command.detail(store) : command.detail;
    echo(command, (payload && payload.detail) || detail);
    emitEvent('command', { command: command, payload: payload });
    if (command.closeLayer !== false) closeLayers();
    return true;
  }

  function dispatchKey(event) {
    var key = eventToKey(event);
    var typing = isTypingTarget(event.target);
    if (typing && key !== 'esc' && key !== 'ctrl+k') return false;

    var nativeControl = event.target && event.target.closest && event.target.closest('button, a, [role="slider"]');
    if (nativeControl && (key === 'space' || key === 'enter')) return false;

    var command = keyMap.get(key);
    if (!command) command = keyMap.get(withoutShift(key));
    if (!command) return false;

    event.preventDefault();
    event.stopPropagation();
    return execute(command);
  }

  // ---------------------------------------------------------------- echo

  var echoTimer = 0;
  var highlightTimers = new WeakMap();

  function ensureEcho() {
    var node = $('.ui-echo[data-ui="echo"]');
    if (node) return node;
    node = h('div', { class: 'ui-echo', dataset: { ui: 'echo', visible: 'false' }, role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(node);
    return node;
  }

  function echo(command, detail) {
    var node = ensureEcho();
    node.textContent = '';

    if (command) {
      var key = command.keys.length ? displayKey(command.keys[0]) : '›';
      node.appendChild(h('span', { class: 'ui-echo__key', text: key }));
      node.appendChild(h('span', { text: command.label }));
      if (detail) node.appendChild(h('span', { class: 'ui-echo__detail', text: String(detail) }));
    } else if (detail) {
      node.appendChild(h('span', { text: String(detail) }));
    }

    node.dataset.visible = 'true';
    window.clearTimeout(echoTimer);
    echoTimer = window.setTimeout(function () { node.dataset.visible = 'false'; }, motion.timings.echo);

    var ledgerEcho = $('[data-ui="ledger-echo"]');
    if (ledgerEcho && detail) ledgerEcho.textContent = String(detail);

    if (command) highlight(command.id);
  }

  function highlight(commandId) {
    var target = $('[data-command="' + commandId + '"]');
    if (!target) return;
    target.dataset.echo = 'true';
    window.clearTimeout(highlightTimers.get(target));
    highlightTimers.set(target, window.setTimeout(function () {
      target.dataset.echo = 'false';
    }, motion.timings.highlight));
  }

  // ---------------------------------------------------------------- layout

  var layout = {
    topbar: true,
    rack: true,
    ledge: true,
    focus: false,
    drawers: ['light'],
    saved: null
  };

  function loadLayout() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      if (typeof saved.topbar === 'boolean') layout.topbar = saved.topbar;
      if (typeof saved.rack === 'boolean') layout.rack = saved.rack;
      if (typeof saved.ledge === 'boolean') layout.ledge = saved.ledge;
      if (Array.isArray(saved.drawers)) layout.drawers = saved.drawers.slice();
    } catch (error) {
      /* localStorage 不可用时退回默认布局 */
    }
  }

  function saveLayout() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        topbar: layout.topbar,
        rack: layout.rack,
        ledge: layout.ledge,
        drawers: layout.drawers
      }));
    } catch (error) {
      /* 忽略写入失败 */
    }
  }

  function applyLayout() {
    var root = document.documentElement;
    root.dataset.topbar = layout.topbar ? 'open' : 'closed';
    root.dataset.rack = layout.focus ? 'closed' : (layout.rack ? 'open' : 'closed');
    root.dataset.ledge = layout.ledge ? 'open' : 'closed';
    root.dataset.focus = layout.focus ? 'on' : 'off';
    emitEvent('layout', getLayout());
  }

  function getLayout() {
    return {
      topbar: layout.topbar,
      rack: layout.rack,
      ledge: layout.ledge,
      focus: layout.focus,
      drawers: layout.drawers.slice()
    };
  }

  function setArea(name, open) {
    if (layout.focus) return;
    if (!(name in layout)) return;
    layout[name] = !!open;
    applyLayout();
    saveLayout();
  }

  function toggleArea(name) {
    if (!(name in layout)) return;
    setArea(name, !layout[name]);
  }

  function setDrawer(groupId, open) {
    var index = layout.drawers.indexOf(groupId);
    if (open && index === -1) layout.drawers.push(groupId);
    if (!open && index !== -1) layout.drawers.splice(index, 1);
    $$('[data-ui="drawer"]').forEach(function (drawer) {
      if (drawer.dataset.group !== groupId) return;
      drawer.dataset.open = open ? 'true' : 'false';
      var head = $('.ui-drawer__head', drawer);
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    saveLayout();
    emitEvent('layout', getLayout());
  }

  function toggleDrawer(groupId) {
    setDrawer(groupId, layout.drawers.indexOf(groupId) === -1);
  }

  function setFocus(on) {
    if (on === layout.focus) return;
    if (on) {
      layout.saved = { topbar: layout.topbar, rack: layout.rack, ledge: layout.ledge };
      layout.focus = true;
      layout.topbar = false;
      layout.rack = false;
      layout.ledge = false;
    } else {
      layout.focus = false;
      if (layout.saved) {
        layout.topbar = layout.saved.topbar;
        layout.rack = layout.saved.rack;
        layout.ledge = layout.saved.ledge;
        layout.saved = null;
      }
    }
    applyLayout();
    saveLayout();
  }

  function toggleFocus() {
    setFocus(!layout.focus);
  }

  // ---------------------------------------------------------------- controls

  function bindGauge(node, options) {
    var opts = options || {};
    var min = Number(node.dataset.min || opts.min || 0);
    var max = Number(node.dataset.max || opts.max || 100);
    var step = Number(node.dataset.step || opts.step || 0.01);
    var field = node.closest('[data-bind]');
    var id = opts.id || (field ? field.dataset.bind : null);
    if (!id) throw new Error('[UI] bindGauge 需要数据键');
    var initial = store.get(id);
    var dragging = false;

    function commit(raw) {
      var value = clamp(snap(raw, min, step), min, max);
      store.set(id, Number(value.toFixed(decimalsOf(step))));
    }

    function ratioFromPointer(event) {
      var rect = node.getBoundingClientRect();
      if (!rect.width) return 0;
      return clamp((event.clientX - rect.left) / rect.width, 0, 1);
    }

    node.addEventListener('pointerdown', function (event) {
      if (node.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      dragging = true;
      node.dataset.dragging = 'true';
      node.setPointerCapture(event.pointerId);
      commit(min + ratioFromPointer(event) * (max - min));
      node.focus();
    });

    node.addEventListener('pointermove', function (event) {
      if (!dragging) return;
      commit(min + ratioFromPointer(event) * (max - min));
    });

    function endDrag(event) {
      if (!dragging) return;
      dragging = false;
      node.dataset.dragging = 'false';
      if (node.releasePointerCapture && event.pointerId !== undefined) {
        try { node.releasePointerCapture(event.pointerId); } catch (error) { /* 已释放 */ }
      }
    }

    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);

    node.addEventListener('keydown', function (event) {
      var value = Number(store.get(id));
      var next = null;
      switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowDown': next = value - step; break;
        case 'ArrowRight':
        case 'ArrowUp': next = value + step; break;
        case 'PageDown': next = value - step * 10; break;
        case 'PageUp': next = value + step * 10; break;
        case 'Home': next = min; break;
        case 'End': next = max; break;
        default: return;
      }
      event.preventDefault();
      commit(next);
    });

    node.addEventListener('dblclick', function () {
      store.set(id, opts.reset === undefined ? initial : opts.reset);
    });
  }

  function bindBank(node, options) {
    var opts = options || {};
    var buttons = $$('button', node);
    var numeric = typeof opts.numeric === 'boolean' ? opts.numeric : true;

    function select(button, focus) {
      var raw = button.dataset.value;
      store.set(opts.id, numeric ? Number(raw) : raw);
      if (focus) button.focus();
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () { select(button, false); });
      button.addEventListener('keydown', function (event) {
        var index = buttons.indexOf(button);
        var target = null;
        if (event.key === 'ArrowLeft') target = buttons[(index - 1 + buttons.length) % buttons.length];
        if (event.key === 'ArrowRight') target = buttons[(index + 1) % buttons.length];
        if (event.key === 'Home') target = buttons[0];
        if (event.key === 'End') target = buttons[buttons.length - 1];
        if (!target) return;
        event.preventDefault();
        select(target, true);
      });
    });
  }

  function bindKey(node, options) {
    var opts = options || {};
    node.addEventListener('click', function () {
      store.set(opts.id, !store.get(opts.id));
    });
  }

  function paintGauge(node, value) {
    var min = Number(node.dataset.min);
    var max = Number(node.dataset.max);
    var span = max - min || 1;
    var ratio = clamp((value - min) / span, 0, 1);
    node.dataset.value = String(value);
    node.style.setProperty('--ui-gauge-pos', (ratio * 100).toFixed(2) + '%');
    node.setAttribute('aria-valuenow', String(value));
    node.setAttribute('aria-valuetext', formatGauge(node, value));
  }

  function formatGauge(node, value) {
    var digits = Number(node.dataset.digits || 0);
    var unit = node.dataset.unit || '';
    return Number(value).toFixed(digits) + (unit ? ' ' + unit : '');
  }

  var bankObserver = null;
  var bankFrames = new WeakMap();

  function observeBank(bank) {
    if (bank.dataset.observed === 'true') return;
    bank.dataset.observed = 'true';
    if (typeof window.ResizeObserver !== 'function') return;
    if (!bankObserver) {
      bankObserver = new window.ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          var target = entry.target;
          if (target.classList && target.classList.contains('ui-bank')) {
            scheduleBankIndicator(target);
          }
        });
      });
    }
    bankObserver.observe(bank);
  }

  function scheduleBankIndicator(bank) {
    if (bankFrames.has(bank)) return;
    var frame = window.requestAnimationFrame(function () {
      bankFrames.delete(bank);
      positionBankIndicator(bank);
    });
    bankFrames.set(bank, frame);
  }

  function positionBankIndicator(bank, active) {
    var target = active || $('button[data-active="true"]', bank);
    if (!target) {
      bank.dataset.ready = 'false';
      return;
    }
    bank.style.setProperty('--ui-bank-x', target.offsetLeft + 'px');
    bank.style.setProperty('--ui-bank-w', target.offsetWidth + 'px');
    if (bank.dataset.ready !== 'true') {
      bank.dataset.ready = 'false';
      window.requestAnimationFrame(function () { bank.dataset.ready = 'true'; });
    }
  }

  function sync(root, state) {
    var scope = root || document;
    var data = state || store.get();

    $$('[data-bind]', scope).forEach(function (field) {
      var id = field.dataset.bind;
      if (!Object.prototype.hasOwnProperty.call(data, id)) return;
      var value = data[id];

      var gauge = $('.ui-gauge', field);
      if (gauge) {
        paintGauge(gauge, Number(value));
        var gaugeValue = $('.ui-field__value', field);
        if (gaugeValue) gaugeValue.textContent = formatGauge(gauge, Number(value));
      }

      var bank = $('.ui-bank', field);
      if (bank) {
        $$('button', bank).forEach(function (button) {
          var isActive = button.dataset.value === String(value);
          button.dataset.active = String(isActive);
          button.setAttribute('aria-checked', String(isActive));
        });
        observeBank(bank);
        scheduleBankIndicator(bank);
        var bankValue = $('.ui-field__value', field);
        if (bankValue && bank.dataset.labels) {
          var labels = JSON.parse(bank.dataset.labels);
          var index = Number(value);
          if (labels[index] !== undefined) bankValue.textContent = labels[index];
        }
      }

      var key = $('.ui-key', field);
      if (key) {
        var active = !!value;
        key.dataset.active = active ? 'true' : 'false';
        key.setAttribute('aria-pressed', active ? 'true' : 'false');
        var keyLabel = $('.ui-key__label', key);
        if (keyLabel) keyLabel.textContent = active ? (key.dataset.on || '开') : (key.dataset.off || '关');
      }
    });

    $$('[data-ui="drawer"]', scope).forEach(function (drawer) {
      var meta = drawer._meta;
      if (typeof meta !== 'function') return;
      var target = $('.ui-drawer__meta', drawer);
      if (target) target.textContent = meta(data);
    });
  }

  // ---------------------------------------------------------------- panel

  function buildGaugeRow(row) {
    var digits = row.digits === undefined ? decimalsOf(row.step || 1) : row.digits;
    var field = h('div', {
      class: 'ui-field',
      dataset: { bind: row.id, command: row.command || '' }
    });

    var gauge = h('div', {
      class: 'ui-gauge',
      dataset: {
        ui: 'gauge',
        min: String(row.min),
        max: String(row.max),
        step: String(row.step || 1),
        digits: String(digits),
        unit: row.unit || '',
        value: String(row.min)
      },
      tabindex: '0',
      role: 'slider',
      'aria-valuemin': String(row.min),
      'aria-valuemax': String(row.max),
      'aria-label': row.label
    });

    gauge.appendChild(h('div', { class: 'ui-gauge__track' }));
    gauge.appendChild(h('div', { class: 'ui-gauge__fill' }));
    gauge.appendChild(h('div', { class: 'ui-gauge__thumb' }));

    var ticks = h('div', { class: 'ui-gauge__ticks' });
    var count = row.ticks || 11;
    for (var i = 0; i < count; i += 1) ticks.appendChild(h('span'));
    gauge.appendChild(ticks);

    field.appendChild(h('span', { class: 'ui-field__label', text: row.label }));
    field.appendChild(gauge);
    field.appendChild(h('span', { class: 'ui-field__value' }));
    return field;
  }

  function buildBankRow(row) {
    var field = h('div', {
      class: 'ui-field',
      dataset: { bind: row.id, command: row.command || '', stacked: row.stacked === false ? 'false' : 'true' }
    });

    var bank = h('div', {
      class: 'ui-bank',
      dataset: {
        ui: 'bank',
        labels: JSON.stringify(row.options.map(function (option) { return option.label; }))
      },
      role: 'radiogroup',
      'aria-label': row.label
    });
    if (row.compact) bank.dataset.compact = 'true';

    row.options.forEach(function (option, index) {
      bank.appendChild(h('button', {
        type: 'button',
        role: 'radio',
        dataset: { value: String(option.value), active: index === 0 ? 'true' : 'false' },
        'aria-checked': index === 0 ? 'true' : 'false',
        text: option.label
      }));
    });

    bank.appendChild(h('span', { class: 'ui-bank__indicator', 'aria-hidden': 'true' }));

    field.appendChild(h('span', { class: 'ui-field__label', text: row.label }));
    field.appendChild(h('span', { class: 'ui-field__value' }));
    field.appendChild(bank);
    return field;
  }

  function buildKeyRow(row) {
    var field = h('div', {
      class: 'ui-field ui-field--key',
      dataset: { bind: row.id, command: row.command || '' }
    });

    var key = h('button', {
      type: 'button',
      class: 'ui-key',
      dataset: { ui: 'key', active: 'false', on: row.on || '开', off: row.off || '关' },
      'aria-pressed': 'false'
    }, [
      h('span', { class: 'ui-key__led' }),
      h('span', { class: 'ui-key__label', text: row.off || '关' })
    ]);

    field.appendChild(h('span', { class: 'ui-field__label', text: row.label }));
    field.appendChild(key);
    return field;
  }

  register('gauge', function (row) {
    var field = buildGaugeRow(row);
    bindGauge($('.ui-gauge', field), { id: row.id, reset: row.reset });
    return field;
  });

  register('bank', function (row) {
    var field = buildBankRow(row);
    bindBank($('.ui-bank', field), {
      id: row.id,
      numeric: typeof row.options[0].value === 'number'
    });
    return field;
  });

  register('key', function (row) {
    var field = buildKeyRow(row);
    bindKey($('.ui-key', field), { id: row.id });
    return field;
  });

  register('note', function (row) {
    return h('p', { class: 'ui-note', text: row.text });
  });

  register('fold', function (row) {
    var body = h('div', { class: 'ui-fold__body', hidden: 'hidden' });
    (row.rows || []).forEach(function (child) { body.appendChild(buildRow(child)); });
    var fold = h('button', {
      type: 'button',
      class: 'ui-fold',
      'aria-expanded': 'false',
      text: row.label || 'MORE',
      onclick: function () {
        var open = fold.getAttribute('aria-expanded') === 'true';
        fold.setAttribute('aria-expanded', open ? 'false' : 'true');
        body.hidden = open;
      }
    });
    return h('div', { class: 'ui-fold-wrap' }, [fold, body]);
  });

  function buildRow(row) {
    return createComponent(row);
  }

  function buildPanel(root, schema, state) {
    if (!root) throw new Error('[UI] buildPanel 缺少容器');
    var source = state || store;
    root.textContent = '';

    schema.forEach(function (group) {
      var open = layout.drawers.indexOf(group.id) !== -1 || group.open === true;
      var drawer = h('section', {
        class: 'ui-drawer',
        dataset: { ui: 'drawer', group: group.id, open: open ? 'true' : 'false' }
      });

      var meta = group.meta;
      var metaText = typeof meta === 'function' ? meta(source.get()) : (meta || '');
      drawer._meta = meta;

      var head = h('button', {
        type: 'button',
        class: 'ui-drawer__head',
        'aria-expanded': open ? 'true' : 'false'
      }, [
        h('span', { class: 'ui-drawer__index', text: group.index || '--' }),
        h('span', { class: 'ui-drawer__title', text: group.title }),
        h('span', { class: 'ui-drawer__meta', text: metaText })
      ]);

      head.addEventListener('click', function () {
        var next = drawer.dataset.open !== 'true';
        drawer.dataset.open = next ? 'true' : 'false';
        head.setAttribute('aria-expanded', next ? 'true' : 'false');
        var index = layout.drawers.indexOf(group.id);
        if (next && index === -1) layout.drawers.push(group.id);
        if (!next && index !== -1) layout.drawers.splice(index, 1);
        saveLayout();
        emitEvent('layout', getLayout());
      });

      var body = h('div', { class: 'ui-drawer__body' });
      var bodyInner = h('div', { class: 'ui-drawer__body-inner' });
      (group.rows || []).forEach(function (row) {
        var node = buildRow(row);
        if (node) bodyInner.appendChild(node);
      });
      body.appendChild(bodyInner);

      drawer.appendChild(head);
      drawer.appendChild(body);
      root.appendChild(drawer);
    });

    var unsubscribe = source.subscribe(function (current) { sync(document, current); });
    sync(document, source.get());
    return unsubscribe;
  }

  // ---------------------------------------------------------------- overlays

  var layers = { command: null, keys: null };

  function closeLayers() {
    Object.keys(layers).forEach(function (name) {
      var node = layers[name];
      if (node) node.hidden = true;
    });
    if (layers.command) {
      var input = $('.ui-command__search', layers.command);
      if (input && document.activeElement === input) input.blur();
    }
  }

  function buildCommandIndex(root, state) {
    var source = state || store;
    var node = root || $('[data-ui="command-index"]');
    if (!node) {
      node = h('div', { class: 'ui-command', dataset: { ui: 'command-index' } });
      document.body.appendChild(node);
    }
    node.hidden = true;
    node.textContent = '';

    var list = h('div', { class: 'ui-command__list' });
    var search = h('input', {
      class: 'ui-command__search',
      type: 'search',
      placeholder: '搜索命令、分组或键位',
      'aria-label': '搜索命令'
    });

    var panel = h('div', { class: 'ui-command__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '命令索引' }, [
      h('div', { class: 'ui-command__head' }, [
        h('span', { class: 'ui-command__title', text: '命令索引' }),
        h('span', { class: 'ui-command__hint', text: '↑↓ 选择 · 回车执行 · Esc 关闭' })
      ]),
      search,
      list
    ]);

    node.appendChild(panel);
    layers.command = node;
    node.addEventListener('keydown', function (event) { trapFocus(panel, event); });

    var activeIndex = 0;

    function rows() {
      return $$('.ui-command__row', list);
    }

    function paintActive() {
      var items = rows();
      items.forEach(function (row, index) {
        row.dataset.active = index === activeIndex ? 'true' : 'false';
      });
      if (items[activeIndex]) items[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function render() {
      var result = searchCommands(search.value);
      list.textContent = '';
      activeIndex = 0;

      if (!result.length) {
        list.appendChild(h('div', { class: 'ui-command__group', text: '无匹配项' }));
        return;
      }

      var lastGroup = null;
      result.forEach(function (command) {
        if (command.group !== lastGroup) {
          lastGroup = command.group;
          list.appendChild(h('div', { class: 'ui-command__group', text: command.group }));
        }
        var row = h('button', {
          type: 'button',
          class: 'ui-command__row',
          dataset: { command: command.id }
        }, [
          h('span', { class: 'ui-command__label', text: command.label }),
          h('span', { class: 'ui-command__key', text: command.keys.length ? displayKey(command.keys[0]) : '›' })
        ]);
        row.addEventListener('click', function () { execute(command); });
        list.appendChild(row);
      });

      paintActive();
    }

    search.addEventListener('input', render);
    search.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, rows().length - 1);
        paintActive();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        paintActive();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        var row = rows()[activeIndex];
        if (row) {
          var command = getCommand(row.dataset.command);
          execute(command);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeLayers();
      }
    });

    node.addEventListener('pointerdown', function (event) {
      if (event.target === node) closeLayers();
    });

    render();

    return {
      open: function () {
        closeLayers();
        node.hidden = false;
        search.value = '';
        render();
        search.focus();
      },
      close: function () { node.hidden = true; }
    };
  }

  function buildKeyLedger(root) {
    var node = root || $('[data-ui="key-ledger"]');
    if (!node) {
      node = h('div', { class: 'ui-keys', dataset: { ui: 'key-ledger' } });
      document.body.appendChild(node);
    }
    node.hidden = true;
    node.textContent = '';
    layers.keys = node;

    var grid = h('div', { class: 'ui-keys__grid' });
    var groups = new Map();

    listCommands().forEach(function (command) {
      if (!command.keys.length) return;
      if (!groups.has(command.group)) groups.set(command.group, []);
      groups.get(command.group).push(command);
    });

    groups.forEach(function (items, group) {
      grid.appendChild(h('div', { class: 'ui-keys__group', text: group }));
      items.forEach(function (command) {
        var row = h('button', { type: 'button', class: 'ui-keys__row' }, [
          h('span', { class: 'ui-keys__key', text: displayKey(command.keys[0]) }),
          h('span', { class: 'ui-keys__label', text: command.label })
        ]);
        row.addEventListener('click', function () { execute(command); });
        grid.appendChild(row);
      });
    });

    node.appendChild(h('div', { class: 'ui-keys__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '快捷键' }, [
      h('div', { class: 'ui-keys__head' }, [
        h('span', { class: 'ui-keys__title', text: '快捷键' }),
        h('span', { class: 'ui-keys__hint', text: '点击执行 · ESC 关闭' })
      ]),
      grid
    ]));

    node.addEventListener('keydown', function (event) {
      trapFocus(node.firstChild, event);
    });

    node.addEventListener('pointerdown', function (event) {
      if (event.target === node) closeLayers();
    });

    return {
      open: function () { closeLayers(); node.hidden = false; },
      close: function () { node.hidden = true; }
    };
  }

  var commandIndex = null;
  var keyLedger = null;

  function openCommandIndex() {
    if (!commandIndex) commandIndex = buildCommandIndex();
    commandIndex.open();
  }

  function openKeyLedger() {
    if (!keyLedger) keyLedger = buildKeyLedger();
    keyLedger.open();
  }

  // ---------------------------------------------------------------- mount

  var mounted = false;
  var destroyMount = null;

  function mount(root) {
    if (mounted) return destroyMount;
    mounted = true;
    motion.refresh();

    var scope = root || document;
    var controller = new window.AbortController();
    var signal = controller.signal;

    $$('[data-ui="drawer"]', scope).forEach(function (drawer) {
      if (drawer.dataset.bound === 'true') return;
      drawer.dataset.bound = 'true';
    });

    $$('[data-action]', scope).forEach(function (button) {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', function () {
        var action = button.dataset.action;
        if (action === 'topbar') toggleArea('topbar');
        else if (action === 'rack') toggleArea('rack');
        else if (action === 'ledge') toggleArea('ledge');
        else if (action === 'focus') toggleFocus();
        else if (action === 'command') openCommandIndex();
        else if (action === 'help') openKeyLedger();
      });
    });

    $$('[data-rail]', scope).forEach(function (button) {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', function () {
        var group = button.dataset.rail;
        if (layout.focus) setFocus(false);
        if (!layout.rack) {
          setArea('rack', true);
        }
        if (group) {
          if (layout.drawers.indexOf(group) === -1) setDrawer(group, true);
          var drawer = $('[data-ui="drawer"][data-group="' + group + '"]');
          if (drawer) drawer.scrollIntoView({ block: 'start' });
        }
      });
    });

    var rackEl = $('.ui-rack', scope);
    var peekTimer = 0;
    var peekCloseTimer = 0;

    function schedulePeekClose() {
      window.clearTimeout(peekCloseTimer);
      peekCloseTimer = window.setTimeout(function () {
        if (document.documentElement.dataset.rack === 'peek') {
          document.documentElement.dataset.rack = 'closed';
        }
      }, motion.timings.hoverClose);
    }

    $$('.ui-rail', scope).forEach(function (rail) {
      if (rail.dataset.bound === 'true') return;
      rail.dataset.bound = 'true';
      rail.addEventListener('pointerenter', function () {
        if (layout.rack || layout.focus) return;
        window.clearTimeout(peekTimer);
        window.clearTimeout(peekCloseTimer);
        peekTimer = window.setTimeout(function () {
          document.documentElement.dataset.rack = 'peek';
        }, motion.timings.hoverIntent);
      });
      rail.addEventListener('pointerleave', function () {
        window.clearTimeout(peekTimer);
        schedulePeekClose();
      });
    });

    if (rackEl && rackEl.dataset.peekBound !== 'true') {
      rackEl.dataset.peekBound = 'true';
      rackEl.addEventListener('pointerenter', function () {
        window.clearTimeout(peekCloseTimer);
      });
      rackEl.addEventListener('pointerleave', function () {
        if (document.documentElement.dataset.rack === 'peek') schedulePeekClose();
      });
      rackEl.addEventListener('pointerdown', function () {
        if (document.documentElement.dataset.rack === 'peek') setArea('rack', true);
      });
    }

    var unsubscribeLayout = on('layout', function () {
      window.requestAnimationFrame(function () { sync(document, store.get()); });
    });

    if (typeof window.ResizeObserver !== 'function') {
      window.addEventListener('resize', function () {
        window.requestAnimationFrame(function () { sync(document, store.get()); });
      }, { signal: signal });
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (!mounted) return;
        $$('.ui-bank', document).forEach(scheduleBankIndicator);
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.defaultPrevented) return;
      if (dispatchKey(event)) return;

      var key = eventToKey(event);
      if (key === 'esc') {
        var layerOpen = Object.keys(layers).some(function (name) { return layers[name] && !layers[name].hidden; });
        if (layerOpen) {
          closeLayers();
          event.preventDefault();
          return;
        }
        if (layout.focus) {
          setFocus(false);
          event.preventDefault();
        }
      }
    }, { signal: signal });

    applyLayout();

    destroyMount = function () {
      if (!mounted) return;
      controller.abort();
      unsubscribeLayout();
      window.clearTimeout(peekTimer);
      window.clearTimeout(peekCloseTimer);
      window.clearTimeout(echoTimer);
      if (bankObserver) bankObserver.disconnect();
      closeLayers();
      mounted = false;
      destroyMount = null;
    };

    return destroyMount;
  }

  // ---------------------------------------------------------------- public

  loadLayout();
  applyLayout();

  var api = {
    store: store,
    createStore: createStore,
    on: on,
    register: register,
    motion: motion,
    registerCommand: registerCommand,
    getCommand: getCommand,
    listCommands: listCommands,
    searchCommands: searchCommands,
    execute: execute,
    dispatchKey: dispatchKey,
    displayKey: displayKey,
    normalizeKey: normalizeKey,
    buildPanel: buildPanel,
    buildCommandIndex: buildCommandIndex,
    buildKeyLedger: buildKeyLedger,
    bindGauge: bindGauge,
    bindBank: bindBank,
    bindKey: bindKey,
    sync: sync,
    echo: echo,
    mount: mount,
    destroy: function () { if (destroyMount) destroyMount(); },
    closeLayers: closeLayers,
    openCommandIndex: openCommandIndex,
    openKeyLedger: openKeyLedger,
    setArea: setArea,
    toggleArea: toggleArea,
    setDrawer: setDrawer,
    toggleDrawer: toggleDrawer,
    setFocus: setFocus,
    toggleFocus: toggleFocus,
    getLayout: getLayout,
    applyLayout: applyLayout
  };

  return api;
})();
