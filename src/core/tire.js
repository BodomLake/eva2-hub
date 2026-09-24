/*!
 * tire.js — 胎压 / 胎温模型 + 告警裁决（前后轮各一组）
 * ------------------------------------------------------------------
 * 纯逻辑，不碰 DOM：state.js 每帧调 tickTire() 推进，warnings() 调 tireAlerts()
 * 裁决告警，设置页 / 消息中心只读这里算出来的值。
 *
 * 单位：kPa + ℃。界面上同时给 bar（240kPa = 2.40bar）。
 * 阈值来自**用户设置**（core/settings.js 里存浏览器），默认值在 config.apps.tire。
 */
import { CONFIG as C, clamp } from '../config.js';

/* 建一份胎压胎温状态（每轮：当前值 / 基准值 / 传感器是否在线） */
export function createTire(cfg) {
  cfg = cfg || C.apps.tire;
  const wheels = {};
  cfg.wheels.forEach(function (w) {
    const s = (cfg.seed && cfg.seed[w.id]) || {};
    const kPa = typeof s.kPa === 'number' ? s.kPa : 240;
    wheels[w.id] = {
      id: w.id,
      name: w.name,
      pos: w.pos || w.name.charAt(0),
      kPa: kPa,
      temp: typeof s.temp === 'number' ? s.temp : 30,
      base: kPa,                       // 基准气压：停止演示后缓慢回到这里
      ok: true                         // 单轮传感器在线
    };
  });
  return {
    sensor: true,                      // 总传感器在线（false = 收不到胎压广播）
    wheels: wheels
  };
}

/* ---------------------------------------------------------------
 * 每帧推进：演示「漏气 / 升温 / 信号丢失」，都不开时缓慢回到基准
 *   flags = { leak, heat, drop }（设置页的三个演示开关）
 * 冷却：行驶中轮胎自身会升温（速度越快升得越多），停车后慢慢降回环境温度。
 * ------------------------------------------------------------- */
export function tickTire(t, dt, flags, oc, speed) {
  if (!t || !t.wheels) return t;
  flags = flags || {};
  oc = oc || C.apps.tire.demo;
  const vAbs = Math.abs(speed || 0);
  const leakPerSec = (oc.leakKPaPerMin || 12) / 60;
  const heatPerSec = (oc.heatKPerMin || 2) / 60;
  const settle = oc.settlePerSec || 0.05;
  const ambient = oc.ambient == null ? 28 : oc.ambient;

  t.sensor = !flags.drop;
  Object.keys(t.wheels).forEach(function (k, i) {
    const w = t.wheels[k];
    w.ok = t.sensor;

    if (flags.leak) {
      /* 漏气：后轮漏得更快一点（演示时能看出左右不同步） */
      w.kPa -= leakPerSec * dt * (i === 0 ? 1 : 1.35);
      w.kPa = Math.max(60, w.kPa);
    } else {
      w.kPa += (w.base - w.kPa) * settle * dt;      // 正常状态缓慢回到基准
    }

    /* 温度 = 环境 + 行驶升温；开了演示升温就额外加一把 */
    const roll = 4 + vAbs * 0.22;
    const target = ambient + roll + (flags.heat ? 22 : 0);
    const rate = flags.heat ? (heatPerSec / Math.max(4, target - w.temp)) : 0.06;
    w.temp += (target - w.temp) * clamp(rate, 0, 1) * dt;
    w.temp = clamp(w.temp, -20, 120);
  });
  return t;
}

/* ---------------------------------------------------------------
 * 告警裁决：返回 [{ id, wheel, text, level }]，按 severity 从高到低
 *   limits = { front: { kPaLow, kPaHigh, tempWarn, tempHigh }, rear: {...} }
 *   —— 直接就是设置页存下来的形状（core/settings.js 的 settings.tire.wheels）
 * ------------------------------------------------------------- */
export function tireAlerts(t, limits) {
  const out = [];
  if (!t || !t.wheels) return out;

  if (!t.sensor) {
    out.push({ id: 'TIRE_LOST', wheel: '', text: C.warnings.TIRE_LOST.text });
    return out;
  }

  const def = C.apps.tire.limits;
  Object.keys(t.wheels).forEach(function (k) {
    const w = t.wheels[k];
    const L = (limits && limits[k]) || def;
    const low = L.kPaLow, high = L.kPaHigh;
    const tw = L.tempWarn, th = L.tempHigh;
    const bar = (w.kPa / C.apps.tire.barDiv).toFixed(2);

    if (w.kPa < low) {
      out.push({
        id: 'TIRE_LEAK', wheel: w.name, level: 'red',
        text: w.name + '气压 ' + Math.round(w.kPa) + 'kPa（' + bar + 'bar）· 低于下限 ' + low + 'kPa'
      });
    } else if (w.kPa > high) {
      out.push({
        id: 'TIRE_OVER', wheel: w.name, level: 'amber',
        text: w.name + '气压 ' + Math.round(w.kPa) + 'kPa（' + bar + 'bar）· 高于上限 ' + high + 'kPa'
      });
    }

    if (w.temp >= th) {
      out.push({
        id: 'TIRE_HOT', wheel: w.name, level: 'red',
        text: w.name + '胎温 ' + Math.round(w.temp) + '℃ · 超过上限 ' + th + '℃'
      });
    } else if (w.temp >= tw) {
      out.push({
        id: 'TIRE_WARM', wheel: w.name, level: 'amber',
        text: w.name + '胎温 ' + Math.round(w.temp) + '℃ · 注意连续行驶'
      });
    }
  });
  return out;
}

/* 汇总读数（消息中心 / 设置页 / 告警文案都会用） */
export function tireStat(t) {
  const ids = t && t.wheels ? Object.keys(t.wheels) : [];
  const list = ids.map(function (k) { return t.wheels[k]; });
  const kPaMin = list.length ? Math.min.apply(null, list.map(function (w) { return w.kPa; })) : 0;
  const kPaMax = list.length ? Math.max.apply(null, list.map(function (w) { return w.kPa; })) : 0;
  const tempMax = list.length ? Math.max.apply(null, list.map(function (w) { return w.temp; })) : 0;
  return { kPaMin: kPaMin, kPaMax: kPaMax, tempMax: tempMax, sensor: !!(t && t.sensor), n: list.length };
}

/* 240 → '2.40' */
export function barText(kPa) {
  return (Number(kPa) / C.apps.tire.barDiv).toFixed(2);
}
