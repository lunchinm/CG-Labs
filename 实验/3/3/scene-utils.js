/*
 * scene-utils.js
 * 场景层共用的小工具。commands.js 与 Phongshading.js 都依赖这些函数，
 * 单独成文件，避免命令表隐式依赖渲染脚本中的全局定义。
 */

function toRad(deg) {
  return deg * Math.PI / 180;
}

function wrapAngle(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value, digits) {
  var factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
