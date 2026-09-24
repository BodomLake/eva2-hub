/*!
 * store.js — 浏览器端本地缓存（localStorage 的安全薄封装）
 * ------------------------------------------------------------------
 * 只做一件事：把「用户改过的设置 / 填过的 API key / 上次打开的文件夹」
 * 存进浏览器，下次打开还在。
 *
 * 为什么包一层：
 *   · 无痕模式 / 车机把 localStorage 关掉时 setItem 会抛异常 →
 *     一律 try/catch，读不到就用默认值，绝不让仪表因为缓存崩掉；
 *   · Node（tools/check.js、tools/smoke.js 会 import 这些模块）里没有
 *     window → 统一走「存储不可用」分支，纯逻辑照样能测。
 */
const PREFIX = 'eva2.';

/* 拿 localStorage（Node / 隐私模式下是 null） */
function ls() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch (e) {
    return null;      // Safari 隐私模式：**访问** localStorage 本身就抛
  }
}

/* 读：JSON 解析失败 / 没存过 → 返回 fallback */
export function read(key, fallback) {
  const store = ls();
  if (!store) return fallback;
  try {
    const raw = store.getItem(PREFIX + key);
    if (raw === null || raw === undefined) return fallback;
    const val = JSON.parse(raw);
    return val === null || val === undefined ? fallback : val;
  } catch (e) {
    return fallback;
  }
}

/* 写：返回是否成功（满了 / 被禁用时返回 false，不抛） */
export function write(key, value) {
  const store = ls();
  if (!store) return false;
  try {
    store.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
}

export function erase(key) {
  const store = ls();
  if (!store) return false;
  try {
    store.removeItem(PREFIX + key);
    return true;
  } catch (e) {
    return false;
  }
}

/* 缓存到底能不能用（设置页上会显示这一条） */
export function available() {
  const store = ls();
  if (!store) return false;
  const k = PREFIX + '__probe';
  try {
    store.setItem(k, '1');
    store.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}

export { PREFIX };
