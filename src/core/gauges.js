/*!
 * gauges.js — 功率圆表（SVG）+ 分段色条（DOM）
 * ------------------------------------------------------------------
 * 用 SVG 而不是 Canvas 的原因：矢量在任何缩放下都锐利，
 * 且发光/渐变可直接复用 CSS，改配色只需动 config.js。
 *
 * 纯 ESM：由 PowerGauge.vue / NosBar.vue 在 onMounted 里构建，
 * 之后每帧由 useVehicle 的 frame hook 直接写 SVG 属性（60fps 通道）。
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

  function polar(cx, cy, r, deg) {
    var a = deg * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function arcPath(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0);
    var p1 = polar(cx, cy, r, a1);
    var large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
           ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' +
           p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
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

    var powerMax = 0;
    var modes = CONFIG.vehicle.modes;
    for (var mk in modes) {
      if (modes[mk].powerCap > powerMax) powerMax = modes[mk].powerCap;
    }
    powerMax = Math.ceil(powerMax / 200) * 200;      // 例如 1600

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

    var STEPS = 32;                                   // 每格 50W
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
        var pct = Math.min(1, Math.abs(value) / powerMax);
        if (Math.abs(pct - lastPct) < 0.002) return pct;
        lastPct = pct;
        var deg = A0 + SPAN * pct;
        valueArc.setAttribute('d', arcPath(cx, cy, RARC, A0, deg));
        valueArc.setAttribute('stroke', value < 0 ? 'url(#pgRegen)' : 'url(#pgArc)');
        var p = polar(cx, cy, RARC, deg);
        dot.setAttribute('cx', p[0].toFixed(2));
        dot.setAttribute('cy', p[1].toFixed(2));
        dot.setAttribute('opacity', pct > 0.01 ? 1 : 0);
        dot.setAttribute('fill', value < 0 ? '#7dffb8' : '#fff');
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
