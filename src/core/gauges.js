/*!
 * gauges.js — 功率圆表（SVG）+ 分段色条（DOM）
 * ------------------------------------------------------------------
 * 用 SVG 而不是 Canvas 的原因：矢量在任何缩放下都锐利，
 * 且发光/渐变可直接复用 CSS，改配色只需动 config.js。
 *
 * 纯 ESM：由 PowerGauge.vue / BottomBar.vue 在 onMounted 里构建，
 * 之后每帧由 useHud 的 registerFrame() 通道直接写 SVG 属性（60fps 通道）。
 *
 * ⚠ 写进 SVG 的每个数字都过 num() / f2() 兜底：外部数据给 NaN 时只是「弧没动」，
 *   不会在控制台刷 <path> d / <circle> cx 的 NaN 报错，也不会把弧画满。
 */
import { CONFIG, clamp } from '../config.js';

const NS = 'http://www.w3.org/2000/svg';

  /* ---------------------------- 基础工具 ---------------------------- */
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
      }
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  /* 数字兜底：外部数据源（CAN / BLE / 手改 EVA_HUD.vehicle.xxx）可能是
     undefined / NaN / 字符串。NaN 一旦写进 SVG 属性，浏览器只在控制台念一句
     `Error: <path> attribute d: Expected number, "…14 A92 92 0 0 1 NaN NaN"`、
     `Error: <circle> attribute cx: Expected length, "NaN"`，画面上只是「那条弧
     没画出来」—— 很难跟「数据没来」区分。所以进 SVG 的数字全部过这里。 */
  function num(v, d) {
    var n = Number(v);
    return isFinite(n) ? n : d;
  }
  function f2(v) { return num(v, 0).toFixed(2); }

  function polar(cx, cy, r, deg) {
    var a = num(deg, 0) * Math.PI / 180;
    return [num(cx, 0) + num(r, 0) * Math.cos(a), num(cy, 0) + num(r, 0) * Math.sin(a)];
  }

  function arcPath(cx, cy, r, a0, a1) {
    a0 = num(a0, 0);
    a1 = num(a1, a0);
    var p0 = polar(cx, cy, r, a0);
    var p1 = polar(cx, cy, r, a1);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + f2(p0[0]) + ' ' + f2(p0[1]) +
           ' A' + f2(r) + ' ' + f2(r) + ' 0 ' + large + ' 1 ' +
           f2(p1[0]) + ' ' + f2(p1[1]);
  }

  /* ============================================================
   * 功率表：0 → powerMax 对应 140° → 400°（顺时针 260°）
   * 最外圈是「粗描边整圆」，呼应参考图里六边形左右那两个粗线圆。
   * ============================================================ */
  function buildPower(svg) {
    var cx = 150, cy = 156;
    var RING = 128;                 // 粗描边外圈半径（外径 268 → 与左侧 TIME 圆盘等大）
    var R = 114;                    // 刻度基准半径
    var RARC = 92;                  // 数值弧半径
    var A0 = 140, A1 = 400, SPAN = A1 - A0;

    /* 量程 = 骑行挡位里最大的 powerCap 向上取整到 200（当前 F 挡 10000 → 满量程 10kW）。
       ⚠ 量程取自 **CONFIG.vehicle.gears**。这里曾经写错成 CONFIG.vehicle.modes
       （那个键不存在）→ powerMax = 0，于是：
         · 0W 时 Math.abs(0) / 0 = NaN → 数值弧写成 "…A92 92 0 0 1 NaN NaN"，
           浏览器在控制台刷 `<path> d` / `<circle> cx/cy` 三条 NaN 报错；
         · 有功率时 x / 0 = Infinity → pct 恒等于 1，**数值弧永远画满**（不报错，
           只是看着像「功率爆表」，最难发现的那种。
       所以除了改对键名，下面还留了两个兜底：拿不到数字就不算、量程为 0 时给个默认值。 */
    var powerMax = 0;
    var gears = CONFIG.vehicle.gears || {};
    for (var mk in gears) {
      if (!Object.prototype.hasOwnProperty.call(gears, mk)) continue;
      var cap = Number(gears[mk] && gears[mk].powerCap);
      if (isFinite(cap) && cap > powerMax) powerMax = cap;
    }
    powerMax = Math.ceil(powerMax / 200) * 200;
    if (!(powerMax > 0)) powerMax = 1200;            // 配置读不到也不让分母变成 0

    svg.innerHTML = '';
    var defs = el('defs', null, svg);
    var g1 = el('linearGradient', { id: 'pgArc', x1: '0', y1: '1', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ff8a1e' }, g1);
    el('stop', { offset: '55%', 'stop-color': '#ff2d3d' }, g1);
    el('stop', { offset: '100%', 'stop-color': '#ffe08a' }, g1);
    var g2 = el('linearGradient', { id: 'pgRegen', x1: '0', y1: '1', x2: '1', y2: '0' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#16a04e' }, g2);
    el('stop', { offset: '100%', 'stop-color': '#7dffb8' }, g2);
    var g3 = el('radialGradient', { id: 'pgRing', cx: '50%', cy: '34%', r: '76%' }, defs);
    el('stop', { offset: '0%', 'stop-color': '#ffe0a8' }, g3);
    el('stop', { offset: '34%', 'stop-color': '#ff8a1e' }, g3);
    el('stop', { offset: '70%', 'stop-color': '#e2001a' }, g3);
    el('stop', { offset: '100%', 'stop-color': '#8f0b16' }, g3);
    var flt = el('filter', { id: 'pgGlow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
    el('feGaussianBlur', { stdDeviation: '4', result: 'b' }, flt);
    var mg = el('feMerge', null, flt);
    el('feMergeNode', { in: 'b' }, mg);
    el('feMergeNode', { in: 'SourceGraphic' }, mg);

    /* 粗描边外圈（整圆）——六边形右侧那个「粗线圆」 */
    el('circle', {
      class: 'g-ring', cx: cx, cy: cy, r: RING,
      stroke: 'url(#pgRing)', 'stroke-width': 12
    }, svg);

    /* 背景刻度弧 + 数值弧的底槽 */
    el('path', { class: 'g-ring-bg', d: arcPath(cx, cy, RARC, A0, A1) }, svg);

    var STEPS = 40;                                   // 每格 250W（10kW 量程 → 40 格）
    var i, deg;
    for (i = 0; i <= STEPS; i++) {
      deg = A0 + SPAN * i / STEPS;
      var major = i % 4 === 0;
      var r1 = major ? R - 13 : R - 7;
      var r2 = R + 6;
      var p1 = polar(cx, cy, r1, deg);
      var p2 = polar(cx, cy, r2, deg);
      el('line', {
        class: 'g-tick ' + (major ? 'g-tick--major' : 'g-tick--minor'),
        x1: p1[0].toFixed(2), y1: p1[1].toFixed(2),
        x2: p2[0].toFixed(2), y2: p2[1].toFixed(2)
      }, svg);
    }

    /* 数值弧 + 端点游标 */
    var valueArc = el('path', {
      class: 'g-arc', d: arcPath(cx, cy, RARC, A0, A0),
      stroke: 'url(#pgArc)', 'stroke-width': 14, filter: 'url(#pgGlow)'
    }, svg);
    var dot = el('circle', { class: 'g-dot', cx: 0, cy: 0, r: 6.4, opacity: 0 }, svg);

    /* 圆心装饰：内圈 */
    el('circle', {
      cx: cx, cy: cy, r: RARC - 16,
      fill: 'rgba(226,0,26,.05)', stroke: 'rgba(255,90,42,.2)', 'stroke-width': 1.4
    }, svg);

    var lastPct = -1;
    return {
      max: powerMax,
      /* value: W（可为负）；返回归一化比例 */
      set: function (value) {
        var w = num(value, 0);                    // NaN / undefined → 当 0，绝不画 NaN 弧
        var pct = Math.min(1, Math.abs(w) / powerMax);
        if (Math.abs(pct - lastPct) < 0.002) return pct;
        lastPct = pct;
        var deg = A0 + SPAN * pct;
        valueArc.setAttribute('d', arcPath(cx, cy, RARC, A0, deg));
        valueArc.setAttribute('stroke', w < 0 ? 'url(#pgRegen)' : 'url(#pgArc)');
        var p = polar(cx, cy, RARC, deg);
        dot.setAttribute('cx', f2(p[0]));
        dot.setAttribute('cy', f2(p[1]));
        dot.setAttribute('opacity', pct > 0.01 ? 1 : 0);
        dot.setAttribute('fill', w < 0 ? '#7dffb8' : '#fff');
        return pct;
      }
    };
  }

  /* ============================================================
   * 分段色条（电机温度）
   * ============================================================ */
  function buildSegments(host, count, colors) {
    host.innerHTML = '';
    var nodes = [];
    for (var i = 0; i < count; i++) {
      var d = document.createElement('i');
      d.className = 'bar__seg';
      d.style.setProperty('--seg', colors[i % colors.length]);
      host.appendChild(d);
      nodes.push(d);
    }
    return {
      count: count,
      /* value / max → 点亮的格子数 */
      set: function (value, max) {
        var on = Math.round(clamp(value / max, 0, 1) * count);
        for (var j = 0; j < count; j++) {
          var want = j < on;
          if (nodes[j].classList.contains('is-on') !== want) {
            nodes[j].classList.toggle('is-on', want);
          }
        }
        return on;
      }
    };
  }


export { buildPower as power, buildSegments as segments, arcPath, polar };
