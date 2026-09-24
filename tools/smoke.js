/*!
 * tools/smoke.js — 冒烟测试（零依赖：纯 Node + 可选的本机浏览器）
 * ------------------------------------------------------------------
 * 第一段：核心仿真（不需要浏览器）
 *   直接 import src/core/state.js，真跑 900 帧物理 + 演示自动驾驶，
 *   断言读数在动、挡位 / 告警 / 双电 / 氮气 / 龙头锁的规则都成立。
 *
 * 第二段：渲染冒烟（有 Chrome / Edge 时执行，否则自动跳过，退出码 0）
 *   用无头浏览器打开构建产物 dist/index.html，等开机动画走完后断言
 *   DOM 结构与读数（六边形芯片 / 双电两条 / NOS 格子 / P 挡大字 …）。
 *
 *   npm run smoke        # = node tools/smoke.js
 */
'use strict';

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { CONFIG as C } from '../src/config.js';
import * as V from '../src/core/state.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
const fails = [];

function assert(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fails.push(label); console.log('  FAIL ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

/* ============================================================
 * 第一段：核心仿真
 * ============================================================ */
console.log('\nEVA-02 HUD · smoke test（核心仿真）\n');

const v = V.create();

/* --- 初始状态 --- */
assert(v.gear === 'P' && v.speed === 0, '上电初始：P 挡静止', 'gear=' + v.gear);
assert(v.soc === C.seed.soc, '初始电量 = seed ' + C.seed.soc + '%');
assert(v.nos === C.seed.nos, '初始氮气 = seed ' + C.seed.nos + '%');
assert(v.lamps.lock === false, '龙头锁初始 OFF（对应参考图）');

/* --- 挡位规则 --- */
v.speed = 12;
assert(V.shiftGear(v, 'P') === false, '行驶中挂 P 被拒绝');
v.speed = 0;
v.kickstand = true;
assert(V.shiftGear(v, 'E') === false, '边撑放下时挂挡被拒绝');
assert(V.warnings(v) && V.warnings(v).id === 'KICKSTAND', '边撑告警已裁决');
v.kickstand = false;
v.lamps.lock = true;
assert(V.shiftGear(v, 'E') === false, '龙头锁 ON 时挂挡被拒绝');
assert(V.warnings(v) && V.warnings(v).id === 'LOCKED', '龙头锁告警已裁决');
v.lamps.lock = false;
assert(V.shiftGear(v, 'E') === true, '解锁后可以挂 E 挡');
assert(V.rideGear(v) === 'E', '驻车时 rideGear 记住上一次骑行挡位');

/* --- 自动演示 + 物理推进 15 秒 --- */
const dt = 1 / 60;
const odo0 = v.odo;
const trip0 = v.tripKm;
for (let i = 0; i < 900; i++) {
  v.auto.enabled = true;
  V.update(v, dt, V.autoDrive(v, dt));
}
assert(v.t > 14.9, '仿真时间推进 ' + v.t.toFixed(1) + 's');
assert(Math.abs(v.speed) > 5, '车速在动 (' + v.speed.toFixed(1) + ' km/h)');
assert(v.odo > odo0, '总里程在增加 (' + v.odo.toFixed(3) + ' km)');
assert(Math.abs((v.odo - odo0) - (v.tripKm - trip0)) < 1e-9, 'ODO 与 TRIP 增量一致');
assert(v.rideSec > C.seed.rideSec, '骑行时长在累积');
assert(v.motorTemp < C.seed.motorTemp, '电机温度在散热 (' + v.motorTemp.toFixed(1) + '℃)');

/* --- 转向灯 / 双闪（READY 铭牌左右两侧那两颗） --- */
const v4 = V.create();
V.update(v4, dt, { turn: 'turnL' });
V.update(v4, dt, {});
assert(v4.req.turnL === true, 'A 键打左转向');
assert(v4.lamps.turnL === true, '左转向灯亮（亮灭跟随 400ms 节拍）');
assert(v4.lamps.turnR === false, '右转向灯保持熄灭');
V.update(v4, dt, { hazard: true });
assert(v4.req.hazard === true && v4.req.turnL === false, '开双闪自动取消单边转向');
let bothBlink = false, singleBlink = false;
for (let i = 0; i < 160; i++) {
  V.update(v4, 0.01, {});
  if (v4.lamps.turnL && v4.lamps.turnR) bothBlink = true;
  if (!v4.lamps.turnL && !v4.lamps.turnR) singleBlink = true;
}
assert(bothBlink && singleBlink, '双闪时左右转向灯同步亮灭');
V.update(v4, dt, { hazard: false });
assert(v4.req.hazard === false && v4.lamps.hazard === false, '双闪可以关掉（H 键切换）');

/* --- 演示自动驾驶会依次演出「左转 / 右转 / 双闪」三个场景 --- */
const v5 = V.create();
let sawL = false, sawR = false, sawHaz = false;
for (let i = 0; i < 60 * 240; i++) {
  const c = V.autoDrive(v5, dt);
  if (c.turnL) sawL = true;
  if (c.turnR) sawR = true;
  if (c.hazard) sawHaz = true;
  V.update(v5, dt, c);
}
assert(sawL && sawR && sawHaz, '演示里左转 / 右转 / 双闪三个场景都会出现');

/* --- 双电电量表：C 挡满电 = 145km，剩余续航随 SOC 线性 --- */
V.shiftGear(v, 'C');
v.soc = 51;
V.update(v, dt, {});
assert(Math.abs(v.rangeFull - 145) < 0.01, 'C 挡满电续航 = 145km', v.rangeFull);
assert(Math.abs(v.rangeKm - 73.95) < 0.15, '51% 时剩余续航 ≈ 74km', v.rangeKm.toFixed(2));
V.shiftGear(v, 'E');
V.update(v, dt, {});
assert(v.rangeFull > 145, 'E 挡满电续航大于 C 挡（rangeFactor 1.15）');
V.shiftGear(v, 'C');

/* --- 氮气条：满油门大功率 → 消耗；制动回收 → 回充 --- */
const v2 = V.create();
v2.auto.enabled = false;
V.shiftGear(v2, 'F');                       // 激烈模式（功率上限最高）
const spCap = C.vehicle.gears.F.powerCap;
let peak = 0;
for (let i = 0; i < 60 * 5; i++) {          // 5s（定速巡航要 6s 才介入）
  V.update(v2, dt, { throttle: 1 });
  if (v2.power > peak) peak = v2.power;
}
assert(peak > spCap * 0.72, 'F 挡满油门峰值功率超过 72% 上限 (' + Math.round(peak) + 'W)');
assert(v2.nos < 100, '氮气条被消耗到 ' + v2.nos.toFixed(1) + '%');
const nosBefore = v2.nos;
for (let i = 0; i < 60 * 3; i++) V.update(v2, dt, { throttle: -1 });
assert(v2.nos > nosBefore, '制动回收时氮气条回充到 ' + v2.nos.toFixed(1) + '%');

/* --- 告警裁决优先级 --- */
const v3 = V.create();
v3.soc = 8;
assert(V.warnings(v3).id === 'CRIT_SOC', '电量 < 10% → CRIT_SOC');
v3.soc = 15;
assert(V.warnings(v3).id === 'LOW_SOC', '电量 < 20% → LOW_SOC');
v3.soc = 60;
v3.motorTemp = C.thermal.critical + 1;
assert(V.warnings(v3).id === 'MOTOR_HOT', '电机 ≥ ' + C.thermal.critical + '℃ → MOTOR_HOT');
v3.motorTemp = C.thermal.ambient;

/* --- 媒体 / 音源（左侧「音乐」芯片） --- */
V.update(v3, dt, { mediaFlip: true });
assert(v3.media.playing === true, 'mediaFlip 切换音源播放状态');

console.log('\n  核心仿真：' + pass + ' 项通过' + (fails.length ? '，' + fails.length + ' 项失败' : ''));

/* ============================================================
 * 第二段：渲染冒烟（无头浏览器打开 dist/index.html）
 * ============================================================ */
const BROWSERS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

const exe = BROWSERS.filter(function (p) { return fs.existsSync(p); })[0];
const entry = path.join(ROOT, 'dist', 'index.html');

if (!exe) {
  console.log('\n  [跳过] 没找到 Chrome / Edge，渲染冒烟跳过（可用 CHROME_PATH 指定）');
} else if (!fs.existsSync(entry)) {
  console.log('\n  [跳过] dist/index.html 不存在，先 npm run build');
} else {
  console.log('\nEVA-02 HUD · smoke test（渲染）\n');

  const photo = 'gear:X1,speed:35,power:780,soc:51,auxSoc:100,odo:11971,' +
    'rideSec:3498,tripKm:28.1,rangeFull:145,rangeKm:74,nos:100,' +
    'motorTemp:116,ambient:35,weather:fog,lamp.beamLow:1,lamp.cruise:1';
  const url = 'file:///' + entry.replace(/\\/g, '/') + '?photo=' + photo;
  const profile = path.join(os.tmpdir(), 'eva2hud-smoke-' + Date.now().toString(36));

  const r = spawnSync(exe, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profile,
    '--window-size=1300,760',
    '--virtual-time-budget=6000',
    '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }

  const dom = r.stdout || '';
  const has = (needle) => dom.indexOf(needle) >= 0;
  const textOf = (id) => {
    const m = new RegExp('id="' + id + '"[^>]*>([^<]*)<').exec(dom);
    return m ? m[1] : '';
  };
  const count = (re) => { const m = dom.match(re); return m ? m.length : 0; };
  const styleWidthOf = (id) => {
    const m = new RegExp('id="' + id + '"[^>]*style="([^"]*)"').exec(dom);
    if (!m) return NaN;
    const w = /width:\s*([\d.]+)%/.exec(m[1]);
    return w ? parseFloat(w[1]) : NaN;
  };

  assert(dom.length > 5000, 'DOM 已渲染（' + dom.length + ' 字符）');
  assert(!has('id="boot"') || has('boot is-done'), '开机动画已结束');
  assert(count(/class="sprite"/g) === 1, '图标精灵已注入');
  assert(has('<symbol id="i-msg"'), '新增图标（消息）已注册');
  assert(has('<symbol id="i-steerlock"'), '新增图标（龙头锁）已注册');

  /* ---- 结构：左侧 5 个六边形 + 左下 1 块五边形（内含 3 组状态） ---- */
  assert(count(/class="hexchip chip--hex/g) === C.rail.length,
    '左侧六边形芯片 ' + C.rail.length + ' 个', count(/class="hexchip chip--hex/g));
  assert(count(/class="clusterbox chip--bl/g) === 1, '左下角只有 1 块不规则五边形');
  assert(count(/class="clusterbox__ico/g) === C.cluster.length,
    '这块五边形里装 ' + C.cluster.length + ' 组状态图标', count(/class="clusterbox__ico/g));
  assert(has('chip--tl') && has('chip--bl'), '左侧角落芯片：切角朝屏幕中心、圆角在屏幕外角');
  assert(has('chip--tr') && has('chip--br'), '右侧角落芯片用镜像轮廓');
  assert(has('class="timechip'), '左上角只有天气 + 时间两行');
  assert(has('id="v-weather"'), '左上角有天气读数');
  assert(has('class="core__frame"'), '六边形外框已绘制');
  assert(has('class="core__odo"'), 'ODO 挂在六边形左下斜边');
  assert(has('class="core__lock"'), '龙头锁挂在六边形右下斜边');
  assert(has('gearchip'), '右上角是骑行挡位徽标（倒三角 + 电量点都在框内）');
  assert(!has('icochip'), '右上角不再有三个多余的小按钮');
  assert(count(/leveldots__dot/g) === 4, '电量点阵 = 倒三角 + 4 圆点', count(/leveldots__dot/g));
  assert(has('class="core__gear'), '挡位显示在中央六边形里面');
  assert(has('nosbox chip--br'), '右下角氮气条装在紫色不规则五边形里');
  assert(has('v-nos-segs'), 'NOS 斜条容器存在');

  /* ---- 读数 ---- */
  assert(textOf('v-readout') === '35', '起步后中央显示时速 35', textOf('v-readout'));
  assert(textOf('v-odo') === '11971', 'ODO = 11971', textOf('v-odo'));
  assert(textOf('v-lock-text') === 'OFF', '龙头锁默认 OFF（与参考图一致）', textOf('v-lock-text'));
  assert(textOf('v-gear') === 'X1', '中央六边形里的挡位 = X1', textOf('v-gear'));
  assert(textOf('v-gear-label') === '新国标', '挡位中文名 = 新国标', textOf('v-gear-label'));
  assert(textOf('v-gear-code') === 'X1', '右上角挡位徽标 = X1', textOf('v-gear-code'));
  assert(textOf('v-gear-name') === '新国标', '右上角挡位名 = 新国标', textOf('v-gear-name'));
  assert(textOf('v-soc-tag') === '51%', '容量读数 = 51%', textOf('v-soc-tag'));
  assert(textOf('v-range-max') === '145km', '满电续航读数 = 145km', textOf('v-range-max'));
  assert(textOf('v-nos-pct') === '100%', 'NOS 读数 = 100%', textOf('v-nos-pct'));
  assert(textOf('v-weather') === '雾', '左上角天气 = 雾（参考图那一帧）', textOf('v-weather'));
  assert(textOf('v-ride') === '0h58min', 'TIME = 0h58min', textOf('v-ride'));
  assert(textOf('v-trip') === '28.1km', 'TRIP = 28.1km', textOf('v-trip'));
  assert(textOf('v-ready') === 'READY', 'READY 铭牌', textOf('v-ready'));
  assert(textOf('v-power') === '780', '功率读数 = 780', textOf('v-power'));

  /* ---- 双电两条：并列一排 + 宽度 = 读数 ---- */
  assert(count(/class="battgauge__row"/g) === 2, '双电两条电量条（并列一排）');
  const socW = styleWidthOf('v-soc-fill');
  assert(Math.abs(socW - 51) < 0.6, '容量条宽度 ≈ 51%', socW + '%');
  const rangeW = styleWidthOf('v-range-fill');
  assert(Math.abs(rangeW - 51) < 0.6, '续航条宽度 = 74/145 ≈ 51%', rangeW + '%');
  assert(has('is-low'), '51% 落在黄色档（20%~60%）');

  /* ---- NOS 格子：满值 = 全亮 ---- */
  const nosOn = count(/class="bar__seg is-on"/g);
  assert(nosOn === C.nos.segments, 'NOS 点亮格数 = ' + C.nos.segments, nosOn);

  /* ---- GPS 图标：雷达盘（上一版是大头针，参考图里要的是雷达） ---- */
  const gpsSym = (/<symbol id="i-gps"[\s\S]*?<\/symbol>/.exec(dom) || [''])[0];
  assert(/<circle/.test(gpsSym) && /A8\.8 8\.8/.test(gpsSym) && !/21\.2s6\.6/.test(gpsSym),
    '左下角 GPS 图标 = 雷达盘（圆盘 + 扇形扫描波 + 回波点），不再是大头针');

  /* ---- 本轮修正：转向灯 / 斜纹装饰 / 红色梯形电量框 / NOS 字标 / ×2 ---- */
  assert(has('class="turn turn--l"') && has('class="turn turn--r"'),
    '转向灯装在 READY 铭牌左右两侧');
  assert(has('id="v-turn-l"') && has('id="v-turn-r"'), '左右转向灯各有独立节点（双闪时一起亮）');
  assert(count(/class="mesh /g) === 4,
    '灰黑斜纹平行四边形 4 块（READY 两侧 2 + 电量条两侧 2）', count(/class="mesh /g));
  assert(has('class="battgauge__rows"'), '两条电量条垫在红色梯形背景框上');
  assert(count(/class="mesh mesh--t[lr]"/g) === 2 && count(/class="mesh mesh--b[lr]"/g) === 2,
    '斜纹块按象限命名：顶栏 --tl/--tr、底栏 --bl/--br（一对一对互为镜像）',
    count(/class="mesh mesh--t[lr]"/g) + ' + ' + count(/class="mesh mesh--b[lr]"/g));
  assert(count(/class="battgauge__track"/g) === 2,
    '两条电量条各有一个 .battgauge__track（同一套 grid → 尺寸永远一致）',
    count(/class="battgauge__track"/g));
  assert(count(/clusterbox__ico is-tl/g) === 1 && count(/clusterbox__ico is-bl/g) === 1 &&
    count(/clusterbox__ico is-br/g) === 1, '左下三图标：信号左上 / 耳机蓝牙左下 / GPS 右下');
  assert(has('class="nosmark"') && has('<symbol id="i-nos"'),
    'NOS 字标改成 SVG（os 上方带箭头）并挂在五边形外侧');
  assert(!has('nosbox__label'), 'NOS 不再用纯文本标签');
  assert(!has('lamp--temp'), '「温度」图标（含 35℃ 读数）已移除');
  assert(textOf('v-dual') === '×2', '右上角第二行只剩「×2」（去掉「模式」）', textOf('v-dual'));
  assert(has('class="gauge__plate len-3"'), '功率数值装在自动宽度的圆角牌里（3 位数）');

  assert(count(/class="ico[ "]/g) >= 15, '图标元素数量充足：' + count(/class="ico[ "]/g));
}

/* ============================================================
 * 第三段：几何契约（无头浏览器 + tools/probe.html 量真实像素）
 * ------------------------------------------------------------
 * 断言的都是「肉眼容易看漏、但必须成立」的形状契约：
 *   · 4 块灰黑斜纹块 = 真平行四边形（上下边等长 + 左右斜边等长，不是梯形）
 *   · 每一对左右严格镜像（顶点镜像后重合）+ 同一条中线 + 同尺寸
 *   · 底栏那对与红色梯形框（.battgauge）等高
 *   · 开机自检的文本域不会压到进度条
 *   · 操作弹框（ControlPanel）：?panel=1 能开、**键盘 O 真的能开、Esc 真的能关**、
 *     按钮数量对、不越出屏幕、点按钮能驱动状态
 * ============================================================ */
function probe(app, sel, cnt, wait, extra) {
  const page = path.join(ROOT, 'tools', 'probe.html');
  if (!fs.existsSync(page)) return null;
  const e = extra || {};
  const url = 'file:///' + page.replace(/\\/g, '/') +
    '?app=' + encodeURIComponent(app) +
    '&wait=' + (wait || 1200) +
    '&sel=' + encodeURIComponent(sel.join(';')) +
    '&cnt=' + encodeURIComponent(cnt.join(';')) +
    '&order=' + encodeURIComponent((e.order || []).join(';')) +
    '&text=' + encodeURIComponent((e.text || []).join(';')) +
    '&click=' + encodeURIComponent((e.click || []).join(';')) +
    '&key=' + encodeURIComponent((e.key || []).join(';')) +
    '&keyDown=' + encodeURIComponent((e.keyDown || []).join(';')) +
    '&js=' + encodeURIComponent((e.js || []).join('|')) +
    '&after=' + (e.after || 500) +
    '&when=' + encodeURIComponent(e.when || '') +
    '&whenGone=' + encodeURIComponent(e.whenGone || '') +
    '&timeout=' + (e.timeout || 6000);
  const profile = path.join(os.tmpdir(), 'eva2hud-probe-' + Date.now().toString(36));
  const r = spawnSync(exe, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profile,
    '--window-size=1300,760',
    '--virtual-time-budget=' + (e.budget || 8000),
    '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  const m = /PROBE([\s\S]*?)ENDPROBE/.exec(r.stdout || '');
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

/* 两个点集是否一一对应（容差 tol px） */
function samePts(a, b, tol) {
  if (!a || !b || a.length !== b.length) return false;
  const used = b.map(function () { return false; });
  return a.every(function (p) {
    for (let i = 0; i < b.length; i++) {
      if (used[i]) continue;
      if (Math.abs(p.x - b[i].x) <= tol && Math.abs(p.y - b[i].y) <= tol) { used[i] = true; return true; }
    }
    return false;
  });
}
/* a 的顶点按自身宽度左右镜像后，是否与 b 重合 */
function mirrorEq(a, b, tol) {
  if (!a || !b || !a.poly || !b.poly) return false;
  return samePts(a.poly.map(function (p) { return { x: a.w - p.x, y: p.y }; }), b.poly, tol);
}

/* 从 computed transform 里取出 X 位移（探针环境里动画停在第一帧 → 需要还原落位） */
function txOf(t) {
  const m = /matrix\(([^)]+)\)/.exec(String(t || ''));
  if (!m) return 0;
  const v = m[1].split(',').map(Number);
  return v.length >= 6 ? v[4] : 0;
}

if (!exe || !fs.existsSync(entry)) {
  console.log('\n  [跳过] 几何契约需要 Chrome / Edge（或先 npm run build）');
} else {
  console.log('\nEVA-02 HUD · smoke test（几何契约）\n');

  const MESH = ['.mesh--tl', '.mesh--tr', '.mesh--bl', '.mesh--br'];
  const geo = probe('?photo=park', MESH.concat(['.battgauge', '.plaque']), [], 1200);
  const gi = (geo && geo.items) || {};
  const got = MESH.filter(function (s) { return !!gi[s]; });
  assert(got.length === 4, '四块斜纹装饰都量到了', got.join(' '));
  if (got.length === 4) {
    const w0 = gi[MESH[0]].w, h0 = gi[MESH[0]].h;
    assert(MESH.every(function (s) {
      return Math.abs(gi[s].w - w0) < 0.6 && Math.abs(gi[s].h - h0) < 0.6;
    }), '四块同尺寸 ' + w0.toFixed(1) + ' × ' + h0.toFixed(1));

    assert(MESH.every(function (s) {
      const p = gi[s].poly;
      if (!p || p.length !== 4) return false;
      const top = Math.abs(p[1].x - p[0].x);
      const bot = Math.abs(p[3].x - p[2].x);
      const lft = Math.hypot(p[3].x - p[0].x, p[3].y - p[0].y);
      const rgt = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
      const flat = Math.abs(p[0].y) < 0.6 && Math.abs(p[1].y) < 0.6 &&
                   Math.abs(p[2].y - h0) < 0.6 && Math.abs(p[3].y - h0) < 0.6;
      return flat && Math.abs(top - bot) < 0.6 && Math.abs(lft - rgt) < 0.6;
    }), '每块都是真平行四边形（上下边等长 + 左右斜边等长，不是梯形）');

    assert(mirrorEq(gi['.mesh--tl'], gi['.mesh--tr'], 0.6), '顶栏 READY 左右两块严格镜像对称');
    assert(mirrorEq(gi['.mesh--bl'], gi['.mesh--br'], 0.6), '底栏电量条左右两块严格镜像对称');

    assert(Math.abs(gi['.mesh--tl'].y - gi['.mesh--tr'].y) < 0.6 &&
           Math.abs(gi['.mesh--bl'].y - gi['.mesh--br'].y) < 0.6,
      '每一对左右共用同一条水平中线（不再一高一低）');

    assert(Math.abs(gi['.mesh--bl'].h - gi['.battgauge'].h) < 0.6,
      '底栏斜纹块与红色梯形框等高（' + gi['.mesh--bl'].h.toFixed(1) + ' vs ' + gi['.battgauge'].h.toFixed(1) + '）');

    const pc = gi['.plaque'].x + gi['.plaque'].w / 2;
    const tl = gi['.mesh--tl'].x + gi['.mesh--tl'].w / 2;
    const tr = gi['.mesh--tr'].x + gi['.mesh--tr'].w / 2;
    assert(Math.abs((pc - tl) - (tr - pc)) < 0.8,
      '顶栏两块到 READY 铭牌等距（' + (pc - tl).toFixed(1) + ' / ' + (tr - pc).toFixed(1) + '）');

    const bc = gi['.battgauge'].x + gi['.battgauge'].w / 2;
    const bl = gi['.mesh--bl'].x + gi['.mesh--bl'].w / 2;
    const br = gi['.mesh--br'].x + gi['.mesh--br'].w / 2;
    assert(Math.abs((bc - bl) - (br - bc)) < 0.8,
      '底栏两块到红框中线等距（' + (bc - bl).toFixed(1) + ' / ' + (br - bc).toFixed(1) + '）');
  }

  /* ---- 开机自检：自检文本域与进度条不重叠 ---- */
  const boot = probe('?nofreeze=1', ['.boot__log', '.boot__bar'], [], 2150);
  const bi = (boot && boot.items) || {};
  assert(!!bi['.boot__log'] && !!bi['.boot__bar'], '开机自检的日志框与进度条都在');
  if (bi['.boot__log'] && bi['.boot__bar']) {
    const lg = bi['.boot__log'], bar = bi['.boot__bar'];
    assert(lg.y + lg.h <= bar.y + 0.6,
      '自检文本域完全在进度条上方（底 ' + (lg.y + lg.h).toFixed(1) + ' ≤ 顶 ' + bar.y.toFixed(1) + '）');
    assert(Number(lg.rows) === C.boot.lines.length,
      '文本域高度按配置行数算（--boot-rows = ' + lg.rows + '）');
    assert(lg.overflowY === 'auto' || lg.overflowY === 'scroll',
      '行数超出时文本域内部滚动（overflow-y: ' + lg.overflowY + '）');
  }

  /* ---- 开机自检：写满进度条后必须「再停一会儿」才进入主界面 ---- */
  assert(C.boot.minMs >= 3000, '配置里最短停留 minMs ≥ 3s（默认 ' + C.boot.minMs + 'ms）');
  /* 事件驱动（when=）：一进入「写满并停留」的状态就量 —— 不依赖挂载耗时。
     注意：虚拟时间下 CSS 过渡不推进，所以看「行内 width」（状态）而不是渲染宽度。 */
  const hold = probe('?nofreeze=1', ['.boot', '.boot__log', '#boot-bar'], [], 0,
    { when: '.boot.is-hold', text: ['#boot-hint'], timeout: 9000, budget: 14000 });
  const hi = (hold && hold.items) || {};
  const ht = (hold && hold.texts) || {};
  if (hi['.boot'] && hi['.boot__log'] && hi['#boot-bar']) {
    assert(/\bis-hold\b/.test(hi['.boot'].cls),
      '自检写满后进入「停留」状态（.boot 的 class = ' + hi['.boot'].cls + '）');
    assert(hi['#boot-bar'].styleW === '100%',
      '进度条行内宽度 = 100%（写满了但还没进主界面）', hi['#boot-bar'].styleW);
    assert(C.boot.waitEnter
      ? /按任意键/.test(ht['#boot-hint'] || '')
      : /自检完成 · [0-3]s 后进入主界面/.test(ht['#boot-hint'] || ''),
      C.boot.waitEnter
        ? '停留期提示行是在等人工按键（waitEnter: true → 不显示倒计时）'
        : '停留期提示行给出「还有几秒」（waitEnter: false）', ht['#boot-hint']);
  } else {
    assert(false, '应该能等到 .boot.is-hold（写满后正在停留）这个状态');
  }
  /* 两个地址栏覆盖：?boot=0 立刻进；?boot=wait 停住等人 */
  const fast = probe('?nofreeze=1&boot=0', ['.boot__log'], [], 0,
    { whenGone: '.boot__log', timeout: 9000, budget: 14000 });
  assert(!!fast && (fast.items || {})['.boot__log'] === null,
    '?boot=0 时自检页自行擦除、进入主界面');
  const wait = probe('?nofreeze=1&boot=wait', ['.boot__log'], [], 7000, { budget: 12000 });
  assert(!!wait && !!(wait.items || {})['.boot__log'],
    '?boot=wait 时不自动进入（7s 后仍停在「按任意键 / 点击 进入主界面」）');

  /* ---- 开机自检：两侧立绘（config.boot.art 的「预留位」）-------------------
     立绘是「装饰层」，所以这里盯四件事：
       ① 绝对定位 + 贴在两个屏幕外缘 —— 一旦掉进 .boot 的 flex 排流就会顶开中列
          （第六轮「通配选择器压过子元素定位」那个坑的镜像版本）；
       ② 中列日志的位置尺寸与「关掉立绘」时逐像素一致（同上，硬证据）；
       ③ **图真的在**：background-image 指向 config 里填的那张，而且能解码出真实
          像素尺寸 —— 路径写错时元素照旧在、尺寸也照旧，只是图没了
          （background-image 不像 <img> 那样会报错，光看几何发现不了）；
       ④ 入场 / 羽化 / 层级 / ?art=off 这套「盒子」的行为不变；
       ⑤ 环里六边形内部的徽记（config.boot.mark）也是「预留位」：被 clipPath
          **裁进**那个六边形、描边画在它之上、图同样要能真解码（?mark=off 关掉）。
     --------------------------------------------------------------------- */
  const ART_SEL = ['.boot', '.boot__art--l', '.boot__art--r',
    '.boot__art--l .boot__artin', '.boot__art--r .boot__artin',
    '.boot__artglow', '.boot__scrim', '.boot__fx', '.boot__log',
    '.b-mark', '.b-hex'];
  const artSel = probe('?nofreeze=1&boot=wait', ART_SEL,
    ['.boot__art svg', '.boot__artglow', '.b-mark', '.b-hex'], 6000,
    { text: ['.boot__arttag'], order: ['.b-mark~.b-hex'], budget: 12000 });
  const ari = (artSel && artSel.items) || {};
  const arc = (artSel && artSel.counts) || {};
  const artText = (artSel && artSel.texts) || {};
  const artDims = (artSel && artSel.imgdims) || {};
  const artL = ari['.boot__art--l'], artR = ari['.boot__art--r'];
  const artInL = ari['.boot__art--l .boot__artin'];
  const artInR = ari['.boot__art--r .boot__artin'];

  assert(!!artL && !!artR, '自检页两侧立绘都在（左 = 驾驶员 / 右 = 机体）');
  if (artL && artR) {
    assert(artL.pos === 'absolute' && artR.pos === 'absolute',
      '立绘是绝对定位层、不参与 flex 排流（position: ' + artL.pos + ' / ' + artR.pos + '）');
    /* ⚠ 探针环境（--dump-dom）里 CSS 动画停在第一帧 → 位置要按「去掉起始位移」之后的
       落位来算；可见性看 fill-mode + 内层 opacity，别信外层的当帧 opacity */
    const artLogBox = ari['.boot__log'] || { x: 420, w: 460 };
    const restL = artL.x - txOf(artL.transform);
    const restR = artR.x - txOf(artR.transform) + artR.w;
    assert(artL.left === '-24px' && artR.right === '-24px',
      '左右立绘的 left / right 都钉在屏幕外缘 -24px（左 ' + artL.left + ' / 右 ' + artR.right + '）');
    assert(restL < artLogBox.x && restR > artLogBox.x + artLogBox.w,
      '落位后各贴一侧、内沿停在中间文字列两边（左 ' + restL.toFixed(1) + ' < ' + artLogBox.x +
      '，右 ' + restR.toFixed(1) + ' > ' + (artLogBox.x + artLogBox.w) + '）');
    assert(artL.w > 300 && artL.h > 400,
      '立绘有真实尺寸（' + artL.w.toFixed(0) + ' × ' + artL.h.toFixed(0) + '）—— 不是隐形的');
    assert(/bootArtIn/.test(String(artL.anim)) && /bootArtIn/.test(String(artR.anim)),
      '「从屏幕外划入」的动画挂在两侧立绘上（animation-name: ' + artL.anim + '）');
    assert(txOf(artL.transform) < 0 && txOf(artR.transform) > 0,
      '划入方向相反：左立绘从屏幕左边进、右立绘从屏幕右边进（' +
      txOf(artL.transform).toFixed(1) + ' / ' + txOf(artR.transform).toFixed(1) + '）');
    assert(parseFloat(artL.animDur) * 1000 === C.boot.art.slideMs && artL.animFill === 'both',
      '划入时长 = config.boot.art.slideMs（' + artL.animDur + '，fill-mode: ' + artL.animFill +
      ' → 停在最后一帧、不会退回透明）');
  }
  {
    /* 图：名字有没有真的用上、构建后能不能解码 —— 「预留位」方案最容易坏的地方。
       background-image 的 URL 会带内容哈希 → 只比「主名」（asuka_stand / eva-02-right） */
    assert(!!artInL && !!artInR, '两侧立绘各有一层装图的本体（.boot__artin）');
    const stem = (s) => path.basename(String(s)).replace(/\.[^.]+$/, '');
    const wantL = stem(C.boot.art.left.src), wantR = stem(C.boot.art.right.src);
    assert(artInL && artInL.bgImg.indexOf(wantL) >= 0 && artInR && artInR.bgImg.indexOf(wantR) >= 0,
      '立绘用的是 config 里填的那张图（' + wantL + ' / ' + wantR + '）');
    const px = (v) => {
      const m = /^(\d+)x(\d+)$/.exec(String(v == null ? '' : v));
      return m ? [+m[1], +m[2]] : null;
    };
    const dimL = px(artDims['.boot__art--l .boot__artin']);
    const dimR = px(artDims['.boot__art--r .boot__artin']);
    assert(!!dimL && dimL[0] > 500 && dimL[1] > 800,
      '左立绘的图真的能解码（' + wantL + ' → ' + artDims['.boot__art--l .boot__artin'] +
      'px）—— 路径没写错、构建也把它带上了');
    assert(!!dimR && dimR[0] > 1000 && dimR[1] > 800,
      '右立绘的图同样能解码（' + wantR + ' → ' + artDims['.boot__art--r .boot__artin'] + 'px）');
    const mtx = /^matrix\(([-\d.e]+),/.exec(String(artInL ? artInL.transform : ''));
    assert(!!mtx && Math.abs(Number(mtx[1]) - (C.boot.art.left.flip ? -1 : 1)) < 0.01,
      '镜像开关 = config.boot.art.left.flip（现在 ' + !!C.boot.art.left.flip +
      '，transform = ' + (artInL ? artInL.transform : 'null') + '）');
  }
  {
    const artIn = artInL;
    assert(!!artIn && Math.abs(Number(artIn.opacity) - C.boot.art.left.opacity) < 0.02,
      '立绘的不透明度取自配置（.boot__artin opacity = ' +
      (artIn ? artIn.opacity : 'null') + '，配置 ' + C.boot.art.left.opacity + '）');
  }
  if (artInL) {
    assert(/linear-gradient/.test(String(artInL.mask)),
      '立绘朝屏幕中心那一侧做了羽化（mask-image 里有 linear-gradient）');
    assert(String(artInL.blend) === C.boot.art.left.blend,
      '混合模式取自配置（mix-blend-mode = ' + artInL.blend + '，配置 ' + C.boot.art.left.blend + '）');
  }
  assert(arc['.boot__art svg'] === 0,
    '几何剪影已经退场：两侧不再注入任何 SVG（' + arc['.boot__art svg'] +
    ' 张）—— 内容现在全在图片里（core/bootart.js 已删）');
  assert(arc['.boot__artglow'] === 2, '两侧都有脚下的地面辉光（' + arc['.boot__artglow'] + ' 块）');
  assert(artText['.boot__arttag'] === C.boot.art.left.tag,
    '立绘角上的标签来自配置（' + artText['.boot__arttag'] + '）');
  {
    /* 层级：立绘 0 < 能量线 1 < 压暗层 2 < 文字 3（否则文字会被压暗或被盖住） */
    const artZ = [ari['.boot__art--l'], ari['.boot__fx'], ari['.boot__scrim'], ari['.boot__log']]
      .map(function (o) { return o ? Number(o.zIndex) : NaN; });
    assert(artZ[0] < artZ[1] && artZ[1] < artZ[2] && artZ[2] < artZ[3],
      '层级顺序：立绘 < 能量线 < 压暗层 < 文字（' + artZ.join(' < ') + '）');
  }
  /* ?art=off → 立绘整层不渲染；而且中列日志与开着立绘时逐像素一致（= 没被顶开） */
  const artOff = probe('?nofreeze=1&boot=wait&art=off&mark=off', ['.boot__log'], ['.boot__art', '.b-mark'], 6000,
    { budget: 12000 });
  assert(!!artOff && (artOff.counts || {})['.boot__art'] === 0,
    '?art=off 时两侧立绘完全不出现（.boot__art 数量 = ' +
    (artOff ? (artOff.counts || {})['.boot__art'] : 'null') + '）');
  assert(!!artOff && (artOff.counts || {})['.b-mark'] === 0,
    '?mark=off 时六边形里也不再画徽记（.b-mark 数量 = ' +
    (artOff ? (artOff.counts || {})['.b-mark'] : 'null') + '）');
  const artLogOn = ari['.boot__log'], artLogOff = (artOff && (artOff.items || {}))['.boot__log'];
  if (artLogOn && artLogOff) {
    assert(Math.abs(artLogOn.x - artLogOff.x) < 1 && Math.abs(artLogOn.y - artLogOff.y) < 1 &&
      Math.abs(artLogOn.w - artLogOff.w) < 1 && Math.abs(artLogOn.h - artLogOff.h) < 1,
      '开/关立绘时中列日志的位置尺寸逐像素一致（立绘真的没进排流）');
  }

  /* ---- 环里六边形内部的徽记（config.boot.mark 的预留位）------------------
     它比两侧立绘多三层契约：
       ① 被 clipPath **裁进**那个六边形（所以绝不可能溢出六边形）；
       ② 六边形的描边画在它**之后**（文档顺序）—— 否则图会糊掉半条描边；
       ③ 「铺满 / 缩进」看 preserveAspectRatio（来自 config.boot.mark.fit）。
     -------------------------------------------------------------------- */
  const markEl = ari['.b-mark'], hexEl = ari['.b-hex'];
  assert(!!markEl && arc['.b-mark'] === 1,
    '六边形内部有徽记（.b-mark ← config.boot.mark.src = ' + C.boot.mark.src +
    '，共 ' + arc['.b-mark'] + ' 个）');
  if (markEl) {
    const stem = (s) => path.basename(String(s)).replace(/\.[^.]+$/, '');
    const want = stem(C.boot.mark.src);
    assert(String(markEl.svgHref).indexOf(want) >= 0,
      '徽记用的是 config 里填的那张图（' + want + ' → ' + markEl.svgHref + '）');
    const dim = /^(\d+)x(\d+)$/.exec(String(artDims['.b-mark'] == null ? '' : artDims['.b-mark']));
    assert(!!dim && +dim[1] > 800 && +dim[2] > 800,
      '徽记的图真的能解码（' + artDims['.b-mark'] + 'px）—— 不是「元素在、图没了」');
    assert(String(markEl.par).indexOf(C.boot.mark.fit === 'contain' ? 'meet' : 'slice') > 0,
      '铺满还是缩进 = config.boot.mark.fit（preserveAspectRatio = ' + markEl.par + '）');
    assert(/^url\(/.test(String(markEl.clip)) && markEl.clipPts === 6,
      '徽记被裁进那个六边形（clip-path = ' + markEl.clip + '，裁剪多边形 ' +
      markEl.clipPts + ' 个顶点）');
    assert(Math.abs(Number(markEl.opacity) - C.boot.mark.opacity) < .03,
      '徽记不透明度取自配置（' + markEl.opacity + ' ← ' + C.boot.mark.opacity + '）');
    assert(String(markEl.blend) === C.boot.mark.blend,
      '徽记混合模式取自配置（mix-blend-mode = ' + markEl.blend + '）');
  }
  assert(!!hexEl, '六边形描边还在（.b-hex）');
  assert(((artSel || {}).orders || {})['.b-mark~.b-hex'] === true,
    '六边形描边画在徽记之上（文档顺序 .b-mark ~ .b-hex）—— 不会被图糊掉半条边');
  if (markEl && hexEl) {
    /* 六边形的 rect 含 3px 描边 → 容差给 4~5px（半条边）。
       框 = 六边形包围盒 × config.boot.mark.scale，所以断言也跟着 scale 走 */
    const k = C.boot.mark.scale == null ? 1 : C.boot.mark.scale;
    assert(Math.abs(markEl.x + markEl.w / 2 - (hexEl.x + hexEl.w / 2)) < 1.5 &&
      Math.abs(markEl.y + markEl.h / 2 - (hexEl.y + hexEl.h / 2)) < 1.5,
      '徽记与六边形同心（中心 ' + (markEl.x + markEl.w / 2).toFixed(1) + ',' +
      (markEl.y + markEl.h / 2).toFixed(1) + ' vs ' + (hexEl.x + hexEl.w / 2).toFixed(1) +
      ',' + (hexEl.y + hexEl.h / 2).toFixed(1) + '）');
    assert(Math.abs(markEl.w - hexEl.w * k) < 4 && Math.abs(markEl.h - hexEl.h * k) < 5,
      '徽记的框 = 六边形包围盒 × config.boot.mark.scale（' + markEl.w.toFixed(1) + '×' +
      markEl.h.toFixed(1) + ' vs ' + hexEl.w.toFixed(1) + '×' + hexEl.h.toFixed(1) +
      ' × ' + k + '）—— scale=1 时不露空框');
  }

  const nosFull = probe('?photo=park',
    ['.nosbox', '.nosmark', '.nosbox__pct', '.nosbox__segs', '.bar__seg'], ['.bar__seg'], 1200);
  const nf = (nosFull && nosFull.items) || {};
  const nfc = (nosFull && nosFull.counts) || {};
  assert(nfc['.bar__seg'] === C.nos.segments, 'NOS 斜条节点数 = ' + C.nos.segments, nfc['.bar__seg']);
  if (nf['.bar__seg'] && nf['.nosbox__segs'] && nf['.nosbox'] && nf['.nosbox__pct'] && nf['.nosmark']) {
    const box = nf['.nosbox'], seg = nf['.bar__seg'], host = nf['.nosbox__segs'];
    const pct = nf['.nosbox__pct'], mark = nf['.nosmark'];
    const k = box.w / 158;                 /* 整屏有一条统一的缩放 */
    assert(seg.w > 4 && seg.h >= 10,
      'NOS 斜条有真实尺寸（' + seg.w.toFixed(1) + ' × ' + seg.h.toFixed(1) + '）—— 不是隐形的');
    assert(Math.abs(seg.h - host.h) < 1.6, '斜条贴满色带高度（' + seg.h.toFixed(1) + ' vs ' + host.h.toFixed(1) + '）');
    assert(Math.abs(host.h - 22 * k) < 2, '色带高度 = 22px（' + host.h.toFixed(1) + 'px）');
    assert(/^rgb\(/.test(seg.bg),
      '满格时斜条是紫色实心（scoped 样式真的命中 JS 节点）', seg.bg + ' / ' + seg.bgImg);
    assert(pct.y - box.y < 24,
      '100% 读数贴在框内上半部（没被「NOS」标签挤到框外）', (pct.y - box.y).toFixed(1) + 'px');
    assert(host.y + host.h <= box.y + box.h + 1.5, '斜条色带完全落在紫色五边形里面');
    assert(mark.y + mark.h <= box.y + 1,
      '「NOS」标签挂在框外上方（position:absolute 没被通配规则压回文档流）');
  }

  /* ---- 半格：nos=40 → 2 亮 3 灭；灭的必须是「暗槽渐变」而不是完全没上色 ---- */
  const nosHalf = probe('?photo=gear:X1,nos:40', ['.bar__seg:nth-child(2)', '.bar__seg:nth-child(4)'], [], 1200);
  const nh = (nosHalf && nosHalf.items) || {};
  if (nh['.bar__seg:nth-child(2)'] && nh['.bar__seg:nth-child(4)']) {
    assert(/^rgb\(/.test(nh['.bar__seg:nth-child(2)'].bg), '40% 时第 2 格点亮（紫色实心）', nh['.bar__seg:nth-child(2)'].bg);
    assert(/^rgba\(0,\s*0,\s*0,\s*0\)$/.test(nh['.bar__seg:nth-child(4)'].bg) &&
      /gradient/.test(nh['.bar__seg:nth-child(4)'].bgImg),
      '40% 时第 4 格是暗槽渐变（有底色、不是透明）', nh['.bar__seg:nth-child(4)'].bgImg);
  }

  /* ---- 操作弹框（ControlPanel） ---- */
  const panel = probe('?photo=park&panel=1', ['.panel', '.screen'], ['.pbtn--gear', '.pbtn--hot'],
    1200, { text: ['#v-soc-tag', '#v-nos-pct'], click: ['#panel-nos-burn'], after: 600 });
  const pi = (panel && panel.items) || {};
  const pn = (panel && panel.counts) || {};
  const pt = (panel && panel.texts) || {};
  assert(!!pi['.panel'], '?panel=1 时操作弹框已打开');
  if (pi['.panel']) {
    assert(pn['.pbtn--gear'] === 1 + C.vehicle.gearOrder.length,
      '操作台挡位按钮 = P + ' + C.vehicle.gearOrder.length + ' 个', pn['.pbtn--gear']);
    assert(pn['.pbtn--hot'] >= 4, '操作台有急加速 / 急减速 / 消耗氮气等红色动作按钮', pn['.pbtn--hot']);
    const sc = pi['.screen'];
    assert(pi['.panel'].x >= sc.x - 1 && pi['.panel'].x + pi['.panel'].w <= sc.x + sc.w + 1 &&
           pi['.panel'].y >= sc.y - 1 && pi['.panel'].y + pi['.panel'].h <= sc.y + sc.h + 1,
      '操作弹框完全落在屏幕范围内');
    assert(pt['#v-nos-pct'] === '85%' && pt['#v-soc-tag'] !== undefined,
      '点「消耗氮气 −15%」后氮气真的掉到 ' + pt['#v-nos-pct'] + '（面板 → 状态 → 屏幕 全链路通）');
  }

  /* ---- 键盘链路：O 键开、O / Esc 关 ----
     上面那条只证明「URL 能开」。这一组走完整的「按键 → input.tap() → ref → DOM」：
     如果 <ControlPanel /> 哪天又被从 App.vue 模板里漏掉，panelOpen 会翻成 true、
     DOM 里却什么都没有 —— 正好是「O 键打开配置没了」那个症状，这里会立刻 FAIL */
  const keyOpen = probe('?photo=park', ['.panel'], [], 1000,
    { key: ['o'], after: 700, js: ['EVA_HUD.panelOpen.value'] });
  const ki = (keyOpen && keyOpen.items) || {};
  const kj = (keyOpen && keyOpen.js) || {};
  assert(!!ki['.panel'], '按 O 键打开操作弹框（键盘链路通）', ki['.panel']);
  assert(kj['EVA_HUD.panelOpen.value'] === true,
    'O 键把 panelOpen 翻成 true（状态与 DOM 一致）', kj['EVA_HUD.panelOpen.value']);

  const keyShut = probe('?photo=park', ['.panel'], [], 1000,
    { key: ['o', 'escape'], after: 700, js: ['EVA_HUD.panelOpen.value'] });
  const si = (keyShut && keyShut.items) || {};
  const sj = (keyShut && keyShut.js) || {};
  assert(si['.panel'] === null && sj['EVA_HUD.panelOpen.value'] === false,
    'O 之后再按 Esc 关掉弹框（Esc 链路通）', JSON.stringify(sj));

  /* ---- 面板 → 告警横幅（点哪条提示，横幅就显示哪条） ---- */
  /* 面板里告警按钮的顺序 = priority 从高到低 → 第一个按钮就是优先级最高的那条 */
  const warnListOrder = Object.keys(C.warnings)
    .sort(function (a, b) { return C.warnings[b].priority - C.warnings[a].priority; });
  const firstWarn = warnListOrder[0];
  const alert = probe('?photo=park&panel=1', [], ['.pbtn--alert'], 1200,
    { text: ['#banner-text', '#v-ready'], click: ['.pbtn--alert'], after: 500 });
  const at = (alert && alert.texts) || {};
  assert(at['#banner-text'] === C.warnings[firstWarn].text,
    '点第一条「' + C.warnings[firstWarn].label + '」→ 横幅显示对应文案（forceWarn 全链路通）',
    at['#banner-text']);

  /* ---- 再点「清除提示」→ 横幅消失 ---- */
  const clear = probe('?photo=park&panel=1', [], ['.pbtn--alert'], 1200,
    { text: ['#banner-text', '#v-ready'], click: ['.pbtn--alert', '#panel-alert-clear'], after: 500 });
  const ct = (clear && clear.texts) || {};
  assert(ct['#banner-text'] === null, '点「清除提示」后横幅消失', ct['#banner-text']);
}

/* ============================================================
 * 汇总
 * ============================================================ */
console.log('\n------------------------------------------------');
if (fails.length) {
  console.log('  ' + pass + ' 项通过, ' + fails.length + ' 项失败');
  console.log('------------------------------------------------\n');
  process.exit(1);
}
console.log('  全部 ' + pass + ' 项检查通过 ✓');
console.log('------------------------------------------------\n');
