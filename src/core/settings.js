/*!
 * settings.js — 用户设置（可编辑项 → 存浏览器）
 * ------------------------------------------------------------------
 * 默认值写在 config.apps.*，用户改过的合并后存 localStorage（键 eva2.settings.v1）。
 * 存储不可用（无痕 / 车机关掉缓存 / Node 里跑测试）时全部退回默认值，
 * 仪表照常工作，只是「关掉页面就忘了」。
 *
 * 谁读它：
 *   · useHud.js  → 把 tire.wheels / sensors / nav / media / bms 同步给车辆与各页面
 *   · SettingsPage.vue / NavPage.vue / MediaPage.vue → 读写 + commit()
 * 谁写它：只有设置类界面（改完调 commit()），逻辑层只读。
 */
import { CONFIG as C } from '../config.js';
import { read, write, erase, available } from './store.js';

const KEY = 'settings.v1';

/* 深拷贝（设置里全是 JSON 值，没有函数 / 循环引用） */
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

/* 默认设置：胎压阈值按轮位展开（前后轮可以不一样） */
export function defaults() {
  const T = C.apps.tire;
  const wheels = {};
  T.wheels.forEach(function (w) {
    wheels[w.id] = {
      kPaLow: T.limits.kPaLow,
      kPaHigh: T.limits.kPaHigh,
      tempWarn: T.limits.tempWarn,
      tempHigh: T.limits.tempHigh
    };
  });
  return {
    /* 胎压胎温：监控开关 + 每轮上下限 + 三个演示开关（漏气 / 升温 / 丢信号） */
    tire: {
      monitor: true,
      wheels: wheels,
      leak: false,
      heat: false,
      drop: false
    },
    /* 感应开关：坐垫（未坐稳不给起步）/ 边撑（放下不让挂挡） */
    sensors: { seat: true, kickstand: true },
    /* BMS：保护板型号 / 蓝牙名称 / 演示数据 / 轮询间隔（毫秒） */
    bms: { board: C.apps.bms.board, name: C.apps.bms.name, demo: C.apps.bms.demo, pollMs: C.apps.bms.pollMs },
    /* 导航：供应商 / 模式（默认骑行优先）/ 城市 / 三家 key / 传输方式 / 代理 */
    nav: {
      provider: 'amap',
      mode: 'ride',
      city: C.apps.nav.city,
      keys: clone(C.apps.nav.keys),
      transport: C.apps.nav.transport,
      proxy: C.apps.nav.proxy
    },
    /* 播放器：音量 / 列表循环 / 放完自动下一首 / 列表过滤（all|audio|video） */
    media: {
      volume: C.apps.media.volume,
      loopAll: C.apps.media.loopAll,
      autoplayNext: C.apps.media.autoplayNext,
      filter: 'all'
    },
    /* 消息中心：接收远程推送 / 记录故障码 */
    msg: { push: true, faults: true }
  };
}

/* 递归合并：默认值打底，只覆盖存过的键（老版本少键 / 多键都不会崩） */
export function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  Object.keys(base).forEach(function (k) {
    const b = base[k];
    const s = saved[k];
    if (s === undefined || s === null) return;
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, s);
    else if (typeof b === typeof s || typeof b === 'undefined') base[k] = s;
  });
  return base;
}

export function createSettings() {
  const value = merge(defaults(), read(KEY, null));
  const listeners = [];

  function snapshot() { return clone(value); }

  function commit() {
    write(KEY, value);
    listeners.forEach(function (fn) { fn(value); });
    return value;
  }

  /* 点号改值：set('tire.wheels.front.kPaLow', 200) */
  function set(path, v) {
    const parts = String(path).split('.');
    let cur = value;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = v;
    return commit();
  }

  function patch(obj) {
    merge(value, obj);
    return commit();
  }

  function reset() {
    const d = defaults();
    Object.keys(value).forEach(function (k) { delete value[k]; });
    Object.assign(value, d);
    erase(KEY);
    listeners.forEach(function (fn) { fn(value); });
    return value;
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return {
    value: value,
    storage: available(),
    defaults: defaults,
    snapshot: snapshot,
    set: set,
    patch: patch,
    commit: commit,
    reset: reset,
    onChange: onChange
  };
}
