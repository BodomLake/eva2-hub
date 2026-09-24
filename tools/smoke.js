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

/* 「不该 FAIL、但必须让人看见」的提示（例如 config 配了某效果而 DOM 里没有节点）：
   打印出来但不计进断言数，闸门照旧按 FAIL 数判定 */
function warn(msg) { console.log('  warn ' + msg); }

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
let peakSpeed = 0;
for (let i = 0; i < 900; i++) {
  v.auto.enabled = true;
  V.update(v, dt, V.autoDrive(v, dt));
  if (Math.abs(v.speed) > peakSpeed) peakSpeed = Math.abs(v.speed);
}
assert(v.t > 14.9, '仿真时间推进 ' + v.t.toFixed(1) + 's');
/* ⚠ 别拿「第 900 帧那一刻的车速」当断言：演示是**随机**的（autoDrive 里 Math.random），
   正好抽到「拐弯 / 刹到低速」那一段时瞬时车速会掉到 5 以下 → 偶发假 FAIL。
   改看 15 秒里的**峰值车速**（"车真的动起来了" 这件事就成立） */
assert(peakSpeed > 5, '车速在动（15s 内峰值 ' + peakSpeed.toFixed(1) + ' km/h）');
assert(v.odo > odo0, '总里程在增加 (' + v.odo.toFixed(3) + ' km)');
assert(Math.abs((v.odo - odo0) - (v.tripKm - trip0)) < 1e-9, 'ODO 与 TRIP 增量一致');
assert(v.rideSec > C.seed.rideSec, '骑行时长在累积');
assert(v.motorTemp < C.seed.motorTemp, '电机温度在散热 (' + v.motorTemp.toFixed(1) + '℃)');

/* --- 转向灯 / 双闪（READY 铭牌左右两侧那两颗） --- */
const v4 = V.create();
V.update(v4, dt, { turn: 'turnL' });
V.update(v4, dt, {});
assert(v4.req.turnL === true, '打左转向（cmd.turn = turnL / 键盘 ← 按住）');
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
assert(v4.req.hazard === false && v4.lamps.hazard === false, '双闪可以关掉（H 键 / cmd.hazard=false）');

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

/* ============================================================
 * 第 12 轮：功率上限 10kW / 加速更快 / 能破百 / 氛围灯带状态机
 * ------------------------------------------------------------
 * 这几条在 Node 里跑**真物理**（不依赖浏览器），所以是「标定」的硬证据：
 *   ① 功率表满量程 = 10kW（F 挡 powerCap 10000）
 *   ② 满油门 0→100km/h 用时 < 12s（用户嫌「演示加速太慢」）
 *   ③ 峰值功率真的能推到 ≈10kW（否则功率弧永远画不到满）
 *   ④ 氛围灯带六种状态的判定与优先级
 * ============================================================ */
const vP = V.create();
vP.auto.enabled = false;
assert(V.shiftGear(vP, 'F') === true, '能挂上 F 激烈模式');
assert(C.vehicle.gears.F.powerCap === 10000, 'F 挡功率上限 = 10000W（满量程 10kW）',
  C.vehicle.gears.F.powerCap);

let t100 = 0, t60 = 0, peakSpd = 0, peakW = 0;
for (let i = 0; i < 60 * 40; i++) {
  V.update(vP, dt, { throttle: 1 });
  if (!t60 && vP.speed >= 60) t60 = vP.t;
  if (!t100 && vP.speed >= 100) t100 = vP.t;
  if (vP.speed > peakSpd) peakSpd = vP.speed;
  if (vP.power > peakW) peakW = vP.power;
}
assert(peakSpd > 100, 'F 挡满油门能**破百**（峰值 ' + peakSpd.toFixed(1) + ' km/h）');
assert(t100 > 0 && t100 < 12,
  '0→100km/h 用时 ' + (t100 ? t100.toFixed(1) : '—') + 's（< 12s：加速够猛）');
assert(t60 > 0 && t60 < 5, '0→60km/h 用时 ' + (t60 ? t60.toFixed(1) : '—') + 's');
assert(peakW > 9000, '峰值功率能推到 ' + Math.round(peakW) + 'W（≈10kW 满量程）');

/* --- 氛围灯带状态机（颜色在 base.css，判定与优先级在这里） --- */
const vS = V.create();
assert(V.stripMode(vS) === 'park', '驻车 → 黄色（park）', V.stripMode(vS));
vS.gear = 'C';
assert(V.stripMode(vS) === 'idle', '骑行但没给油（静止 / 匀速）→ 淡青（idle）', V.stripMode(vS));
vS.throttle = 0.6;
vS.power = 900;
assert(V.stripMode(vS) === 'accel', '加速 → 蓝色（accel）', V.stripMode(vS));
vS.throttle = -1;
vS.power = -800;
assert(V.stripMode(vS) === 'brake', '减速 / 能量回收 → 绿色（brake）', V.stripMode(vS));
const burnAt = C.vehicle.gears.C.powerCap * C.strip.burnRatio;
vS.throttle = 0.9;
vS.power = burnAt + 50;
assert(V.stripMode(vS) === 'boost', '烧氮气（>' + Math.round(burnAt) + 'W）→ 紫色（boost）', V.stripMode(vS));
vS.warning = { level: 'red' };
assert(V.stripMode(vS) === 'fault', '故障（红色级告警）→ 红色（fault），压过 boost', V.stripMode(vS));
vS.warning = { level: 'amber' };
assert(V.stripMode(vS) === 'boost', '黄色级告警不抢灯带状态（还是紫闪）', V.stripMode(vS));
vS.gear = C.vehicle.parkGear;
vS.warning = null;
vS.power = 0;
vS.throttle = 0;
assert(V.stripMode(vS) === 'park', '回到驻车 → 又变回黄色（状态可逆，不会卡在红 / 紫）', V.stripMode(vS));

/* 满油门的 F 挡跑着跑着就该出现「紫闪」（氮气）—— 演示得真的看到这个状态 */
const vN = V.create();
vN.auto.enabled = false;
V.shiftGear(vN, 'F');
let sawBoost = false, sawAccel = false;
for (let i = 0; i < 60 * 8; i++) {
  V.update(vN, dt, { throttle: 1 });
  const st = V.stripMode(vN);
  if (st === 'boost') sawBoost = true;
  if (st === 'accel') sawAccel = true;
}
assert(sawAccel && sawBoost, 'F 挡满油门期间：先蓝色加速、功率上来后转紫色烧氮气');

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

  const photo = 'gear:C,speed:35,power:780,soc:51,auxSoc:100,odo:11971,' +
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
  assert(textOf('v-gear') === 'C', '中央六边形里的挡位 = C', textOf('v-gear'));
  assert(textOf('v-gear-label') === '滑行模式', '挡位中文名 = 滑行模式', textOf('v-gear-label'));
  /* 右上角徽标：第一行挡位名、第二行挡位代号（#v-gear-code）——
     那块地方讲的是**挡位**，不是「×2 / 双电模式」（README 里记过这个误解） */
  assert(textOf('v-gear-name') === '滑行模式', '右上角挡位名 = 滑行模式', textOf('v-gear-name'));
  assert(textOf('v-gear-code') === 'C', '右上角第二行 = 挡位代号 C（不是「×2」）', textOf('v-gear-code'));
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
  assert(count(/class="strip strip--l is-/g) === 1,
    '左侧氛围灯带带上状态类（is-park / is-accel / …）—— 颜色跟着驾驶状态走');
  assert(has('class="gauge__plate len-3"'), '功率数值装在自动宽度的圆角牌里（3 位数）');

  /* 没打开页面时 HUD 的 DOM 里不该有应用页（?page= 才挂 v-if，结构断言不受影响） */
  assert(!has('page__tabs') && !has('id="page-msg"'),
    '没打开页面时 DOM 里没有应用页（五个页面都是 v-if 挂载的）');


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
let probeCalls = 0;
const missProbes = [];

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
    '&timeout=' + (e.timeout || 6000) +
    '&reload=' + (e.reload || 0) +
    '&reloadHash=' + encodeURIComponent(e.reloadHash || '');
  /* 无头浏览器偶发不吐 title（启动慢 / 虚拟时间用完）→ **重试一次**；
     两次都空就记进 missProbes，最后统一报一条 FAIL（否则「探针空手」会表现为
     「那几条断言悄悄少了几条」，闸门看着还是全绿 —— 覆盖偷偷变少最难发现） */
  probeCalls += 1;
  let out = shoot(url, e.budget || 8000);
  if (!out) out = shoot(url, e.budget || 8000);
  if (!out) missProbes.push(app + (sel.length ? ' · ' + sel.join(' ') : ''));
  return out;
}

function shoot(url, budget) {
  const profile = path.join(os.tmpdir(), 'eva2hud-probe-' + Date.now().toString(36) + '-' +
    Math.floor(Math.random() * 1e4));
  const r = spawnSync(exe, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--user-data-dir=' + profile,
    '--window-size=1300,760',
    '--virtual-time-budget=' + budget,
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

/* 从 computed transform 里取出位移（探针环境里动画停在第一帧 → 需要还原落位） */
function shiftOf(t, i) {
  const m = /matrix\(([^)]+)\)/.exec(String(t || ''));
  if (!m) return 0;
  const v = m[1].split(',').map(Number);
  return v.length >= 6 ? v[i] : 0;
}
function txOf(t) { return shiftOf(t, 4); }
function tyOf(t) { return shiftOf(t, 5); }
/* x 方向缩放（matrix 的 a）—— 徽记的入场动画 from 是 scale(.88)，一样要还原
   （没有 transform = 动画没跑/已跑完 → 1） */
function scOf(t) {
  const m = /matrix\(([^)]+)\)/.exec(String(t || ''));
  if (!m) return 1;
  const a = Number(m[1].split(',')[0]);
  return a > 0 ? a : 1;
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
  /* 划入方向（左从屏幕左边进 / 右从屏幕右边进）读的是**动画的第一个关键帧**：
     ⚠ 别读**当帧** transform —— 探针里动画可能已经跑完（fill: both 落到 to →
     transform: none），量到的是 0/0 → 偶发假 FAIL（就是「等太久落进 is-hold」那条老坑）。
     getAnimations() 的 keyframes 是**与时间无关**的，而且 Chrome 会把
     `calc(46% * var(--art-dir))` 解析成真实值（translate(-46%) / translate(46%)）。 */
  const keyJs = function (side) {
    return 'JSON.stringify(document.querySelector(".boot__art--' + side + '")' +
      '.getAnimations().map(function(a){return [a.animationName,a.effect.getKeyframes()[0].transform]}))';
  };
  const ART_KEY_L = keyJs('l');
  const ART_KEY_R = keyJs('r');
  const artSel = probe('?nofreeze=1&boot=wait', ART_SEL,
    ['.boot__art svg', '.boot__artglow', '.b-mark', '.b-hex'], 6000,
    { text: ['.boot__arttag'], order: ['.b-mark~.b-hex'], budget: 12000,
      js: [ART_KEY_L, ART_KEY_R] });
  const ari = (artSel && artSel.items) || {};
  const arc = (artSel && artSel.counts) || {};
  const artText = (artSel && artSel.texts) || {};
  const artDims = (artSel && artSel.imgdims) || {};
  const artKj = (artSel && artSel.js) || {};
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
    /* 划入方向：读**动画的第一个关键帧**（与时间无关）。
       getAnimations() 的 keyframes 由 Chrome 解析过 var() → "translate(-46%)" / "translate(46%)"。
       ⚠ 当帧 transform 只能当参考 —— 探针里动画可能已经跑完（fill: both 落到 to =
       transform: none），量到 0/0 会偶发假 FAIL（「等太久落进 is-hold」那条老坑）。 */
    const dirTx = function (raw) {
      let list = [];
      try { list = JSON.parse(String(raw || '[]')); } catch (e) { list = []; }
      const hit = list.filter(function (it) { return /bootArtIn/.test(String(it[0])); })[0];
      const m = hit ? /(-?[\d.]+)/.exec(String(hit[1])) : null;
      return m ? parseFloat(m[1]) : NaN;
    };
    const txKeyL = dirTx(artKj[ART_KEY_L]);
    const txKeyR = dirTx(artKj[ART_KEY_R]);
    assert(txKeyL < 0 && txKeyR > 0,
      '划入方向相反：左立绘从屏幕左边进、右立绘从屏幕右边进' +
      '（动画第一帧 translate(' + txKeyL + '%) / translate(' + txKeyR + '%)）',
      JSON.stringify({ l: artKj[ART_KEY_L], r: artKj[ART_KEY_R] }));
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
    /* ⚠ 探针环境（--dump-dom）里 CSS 动画停在第一帧：markIn 的 from 是
       `opacity: .2`，所以**当帧 opacity 读出来不是配置值** —— 配置值要从
       --mark-o 变量量（写法同立绘读内层 --art-o）；「动画只做淡入、
       不把配置值盖掉」由下面两条 + check.js 的 to 帧静态检查一起盯着。 */
    assert(Math.abs(Number(markEl.markO) - C.boot.mark.opacity) < .001,
      '徽记不透明度取自配置（--mark-o = ' + markEl.markO + ' ← ' +
      C.boot.mark.opacity + '）');
    assert(/markIn/.test(String(markEl.anim)) && markEl.animFill === 'both',
      '徽记的入场动画挂在它自己身上、停在最后一帧（animation-name: ' + markEl.anim +
      '，fill-mode: ' + markEl.animFill + '）—— 跑完就落回 --mark-o');
    assert(String(markEl.blend) === C.boot.mark.blend,
      '徽记混合模式取自配置（mix-blend-mode = ' + markEl.blend + '）');
  }
  assert(!!hexEl, '六边形描边还在（.b-hex）');
  assert(((artSel || {}).orders || {})['.b-mark~.b-hex'] === true,
    '六边形描边画在徽记之上（文档顺序 .b-mark ~ .b-hex）—— 不会被图糊掉半条边');
  if (markEl && hexEl) {
    /* 六边形的 rect 含 3px 描边 → 容差给 4~5px（半条边）。
       框 = 六边形包围盒 × config.boot.mark.scale，所以断言也跟着 scale 走。
       ⚠ 同上：「当帧 rect」是落位再乘动画第一帧的 scale(.88) → 先除掉再比
       （像立绘那样把当帧 transform 的影响还原掉） */
    const k = C.boot.mark.scale == null ? 1 : C.boot.mark.scale;
    const fk = scOf(markEl.transform);
    const mw = markEl.w / fk, mh = markEl.h / fk;
    assert(Math.abs(markEl.x + markEl.w / 2 - (hexEl.x + hexEl.w / 2)) < 1.5 &&
      Math.abs(markEl.y + markEl.h / 2 - (hexEl.y + hexEl.h / 2)) < 1.5,
      '徽记与六边形同心（中心 ' + (markEl.x + markEl.w / 2).toFixed(1) + ',' +
      (markEl.y + markEl.h / 2).toFixed(1) + ' vs ' + (hexEl.x + hexEl.w / 2).toFixed(1) +
      ',' + (hexEl.y + hexEl.h / 2).toFixed(1) + '）');
    assert(Math.abs(mw - hexEl.w * k) < 4 && Math.abs(mh - hexEl.h * k) < 5,
      '徽记的框 = 六边形包围盒 × config.boot.mark.scale（' + mw.toFixed(1) + '×' +
      mh.toFixed(1) + ' vs ' + hexEl.w.toFixed(1) + '×' + hexEl.h.toFixed(1) +
      ' × ' + k + '）—— scale=1 时不露空框');
  }

  /* ---- 中央六边形的挡位图（config.vehicle.gearArt）：图案跟着挡位换 ----
     探针里量三件事：换成图了吗（#v-gear-art / #v-emblem 二选一）、
     用的是这一挡的图吗（构建后 URL 里带 gear-<挡位>）、图上的暗幕按 config 压了吗。
     换挡那一下的「心跳」是 CSS 动画，探针环境量不可靠 → 由 check.js 静态盯着。 */
  const gearCases = C.vehicle.gearOrder
    .filter(function (g) { return (C.vehicle.gearArt.map || {})[g]; })
    .concat([C.vehicle.parkGear]);
  const ART_SRC = 'document.querySelector("#v-gear-art") ? document.querySelector("#v-gear-art").src : ""';
  /* ⚠ 上面这个表达式里不能出现 `|`：probe.html 用 `|` 分隔多条 js 表达式（见文件头注释） */
  gearCases.forEach(function (g) {
    const wantArt = !!(C.vehicle.gearArt.map || {})[g];
    const gp = probe('?photo=gear:' + g,
      ['#v-gear-art', '#v-emblem', '#v-gear-veil'], [], 1200,
      { text: ['#v-gear'], js: [ART_SRC] });
    const gi = (gp && gp.items) || {};
    const gt = (gp && gp.texts) || {};
    const gj = (gp && gp.js) || {};
    const src = String(gj[ART_SRC] || '');
    assert(gt['#v-gear'] === g, '?photo=gear:' + g + ' 的挡位铭牌 = ' + g, gt['#v-gear']);
    if (!wantArt) {
      assert(!!gi['#v-emblem'] && gi['#v-gear-art'] === null,
        g + ' 挡没有配挡位图 → 六边形里是原创徽记（fallbackEmblem 兜底，不会空一块）',
        JSON.stringify(gi['#v-gear-art'] || null));
      return;
    }
    assert(!!gi['#v-gear-art'] && gi['#v-emblem'] === null,
      g + ' 挡的六边形换成挡位图（#v-gear-art 在、原创徽记让位）',
      JSON.stringify(gi['#v-gear-art'] || null));
    assert(src.indexOf('gear-' + g.toLowerCase()) >= 0,
      g + ' 挡用的就是 art/' + C.vehicle.gearArt.map[g] + '（图的 URL 带 gear-' +
      g.toLowerCase() + '）', src.split('/').pop());
    if (gi['#v-gear-veil']) {
      assert(Math.abs(Number(gi['#v-gear-veil'].opacity) - C.vehicle.gearArt.veil) < .02,
        g + ' 挡图上的暗幕按 config 压暗（opacity ' + gi['#v-gear-veil'].opacity +
        ' ← ' + C.vehicle.gearArt.veil + '）—— 中央大字读得清');
    } else if (Number(C.vehicle.gearArt.veil) > 0) {
      /* ⚠ 这里**不能**就这么 `if (节点) assert(...)` 了事：节点一旦从 CoreHex.vue 里
         被删掉，这 4 条断言会**静默消失**（闸门还是全绿，覆盖却少了）。有配置没节点
         就 warn 出来，让人一眼看见「配置和 DOM 对不上」。 */
      warn(g + ' 挡：config.vehicle.gearArt.veil = ' + C.vehicle.gearArt.veil +
        '，但 DOM 里没有 #v-gear-veil（CoreHex.vue 现在没画暗幕）—— ' +
        '要么补回节点，要么把配置里的 veil 去掉');
    }
  });

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

  /* ---- 键盘：挡位字母键 / 方向键转向 / 双闪 / R 定速（第 12 轮的新键表） ----
     这一组走的是**指令队列**那条线（`tap()` → `pending` / `keys`），而不是像上面
     `O` 键那样直接翻一个 ref。⚠ 探针环境里 `requestAnimationFrame` 不推进（所以
     所有渲染断言都用 `?photo=` + 强制 `renderOnce()`），队列得有人消费 ——
     这里用 `EVA_HUD.dispatch()`（= advance(0) + 刷快照），它就是操作台那条链路。
     于是断言看的是**状态**（view.gear / vehicle.req / view.lamps）；DOM 那边由
     上面「挡位图 / 灯带」那几条 `?photo=gear:X` 的断言盯着。 */
  const J_DISP = 'EVA_HUD.dispatch()';
  const keyGear = probe('?photo=park', [], [], 1000,
    { key: ['a'], keyDown: ['arrowleft'], after: 400,
      js: [J_DISP, 'EVA_HUD.view.gear', 'EVA_HUD.vehicle.req.turnL', 'EVA_HUD.view.strip'] });
  const kg = (keyGear && keyGear.js) || {};
  assert(kg['EVA_HUD.view.gear'] === 'A',
    '按 A 键 = 挂 A 挡（助力推行）—— 字母键就是挡位键', kg['EVA_HUD.view.gear']);
  assert(kg['EVA_HUD.vehicle.req.turnL'] === true,
    '按住 ← = 左转向（电平语义：按住期间一直成立）', kg['EVA_HUD.vehicle.req.turnL']);
  assert(kg['EVA_HUD.view.strip'] === 'idle',
    '挂上 A 挡、没给油 → 灯带进入「静止」状态（淡青）', kg['EVA_HUD.view.strip']);

  const keyHaz = probe('?photo=park', [], [], 1000,
    { keyDown: ['arrowleft', 'arrowright'], after: 400,
      js: [J_DISP, 'EVA_HUD.vehicle.req.hazard', 'EVA_HUD.vehicle.req.turnL'] });
  const kh = (keyHaz && keyHaz.js) || {};
  assert(kh['EVA_HUD.vehicle.req.hazard'] === true && kh['EVA_HUD.vehicle.req.turnL'] === false,
    '← 和 → 一起按住 = 双闪（单边转向自动让位）',
    JSON.stringify({ hazard: kh['EVA_HUD.vehicle.req.hazard'], l: kh['EVA_HUD.vehicle.req.turnL'] }));

  const keyCruise = probe('?photo=speed:20,gear:C', [], [], 1000,
    { key: ['r'], after: 400, js: [J_DISP, 'EVA_HUD.view.lamps.cruise'] });
  assert(((keyCruise && keyCruise.js) || {})['EVA_HUD.view.lamps.cruise'] === true,
    '按 R = 定速巡航（从 C 键搬走了 —— C 现在是 C 挡）',
    ((keyCruise && keyCruise.js) || {})['EVA_HUD.view.lamps.cruise']);

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

  /* ---- 五个应用页（左灯塔五个芯片 · ?page=msg|nav|nerv|music|set 直达） ----
     这一组盯的是「页面真的渲染出来了」。踩过的坑：模板里写 <AppPage> 却忘了
     import 时，Vue 会退化成运行期 resolveComponent('AppPage')，生产构建连警告
     都没有 —— 整页静默渲染成空；只断言 HUD 自己的结构是看不出来的。 */
  /* 每个页面「自己的正文」长什么样（用来断言页面不是空壳）。
     set 取的是默认那一节里的实时读数条 —— 第 10 轮起设置页分节显示，
     默认停在「胎压胎温」那一节（BMS 的 .cells__c 要点进电池那一节才有）。 */
  const PAGE_MARKS = { msg: '.msg__item', nav: '.page__cols', nerv: '.nerv__big',
    music: '.player', set: '.tlive__w' };
  const pageIds = C.rail.map(function (r) { return r.id; });

  pageIds.forEach(function (id) {
    const pp = probe('?photo=park&page=' + id, ['.page', '.pages', '.hud', '.screen'],
      ['.page__tab', '.page__close', PAGE_MARKS[id]], 1200,
      { text: ['.page__title', '.page__en'], js: ['EVA_HUD.page.value'] });
    const pi = (pp && pp.items) || {};
    const pc = (pp && pp.counts) || {};
    const pt = (pp && pp.texts) || {};
    const pj = (pp && pp.js) || {};
    const meta = C.pages[id];

    assert(!!pi['.page'], '?page=' + id + ' 页面层渲染出来了（AppPage 外壳）', pi['.page']);
    if (!pi['.page']) return;                       /* 没渲染就别继续按空值量 */

    const pg = pi['.page'], sc = pi['.screen'], hd = pi['.hud'], ps = pi['.pages'];
    /* ⚠ 探针环境（--dump-dom + 虚拟时间）里动画 / 过渡**都停在第一帧**：
       进入页的 pageSw-enter-from 带 translateY(8px) + opacity 0 → 几何要减掉
       当帧位移再看；而「不闪 home」这件事改看**页面层**（.pages）—— 它是常驻
       实底，页与页交叉淡入期间透出来的就是它，不是下面的仪表本体。 */
    if (sc) {
      assert(Math.abs(pg.x - sc.x) < 1 && Math.abs((pg.y - tyOf(pg.transform)) - sc.y) < 1 &&
             Math.abs(pg.w - sc.w) < 1 && Math.abs(pg.h - sc.h) < 1,
        '「' + meta.title + '」页铺满整块屏幕（' +
        pg.w.toFixed(0) + '×' + pg.h.toFixed(0) + ' vs 屏幕 ' +
        sc.w.toFixed(0) + '×' + sc.h.toFixed(0) + '）');
    }
    assert(!!ps && /gradient|rgb/.test(String(ps.bgImg) + ps.bg),
      '「' + meta.title + '」页压在**常驻实底**的页面层上（.pages 有渐变底色 → 转场不闪 home）',
      ps ? String(ps.bgImg).slice(0, 44) : 'null');
    if (ps && hd) {
      assert(Number(ps.zIndex) > Number(hd.zIndex),
        '页面层压在仪表本体之上（.pages z-index ' + ps.zIndex + ' > .hud ' + hd.zIndex +
        '）——不会像忘了 import 时那样叠在 HUD 里');
    }
    assert(pj['EVA_HUD.page.value'] === id,
      '「' + meta.title + '」页由**路由**给出来（?page=' + id + ' → EVA_HUD.page.value = ' +
      pj['EVA_HUD.page.value'] + '）', pj['EVA_HUD.page.value']);
    assert(pt['.page__title'] === meta.title && pt['.page__en'] === meta.en,
      '「' + meta.title + '」页标题取自 config.pages.' + id + '（' +
      pt['.page__title'] + ' / ' + pt['.page__en'] + '）');
    assert(pc['.page__tab'] === pageIds.length,
      '「' + meta.title + '」页五个页签都在（' + pc['.page__tab'] + ' 个）', pc['.page__tab']);
    assert(pc['.page__close'] === 1, '「' + meta.title + '」页右上角有 ✕ 关闭按钮');
    assert(pc[PAGE_MARKS[id]] >= 1,
      '「' + meta.title + '」页渲染出自己的正文（' + PAGE_MARKS[id] + ' × ' + pc[PAGE_MARKS[id]] + '）');
  });

  /* 换页（点页签）→ 状态 → 转场类 → DOM：一条链路全通。
     探针里过渡停在第一帧，所以正好能把 <Transition> 加上的类名读出来验转场。 */
  const navTab = pageIds.indexOf('nav') + 1;
  const msgTab = pageIds.indexOf('msg') + 1;
  const jump = probe('?photo=park&page=msg',
    ['#page-nav', '.pages', '.page.pageSw-enter-active', '.page.pageSw-leave-active'], [], 1200,
    { click: ['.page__tab:nth-child(' + navTab + ')'], after: 300,
      js: ['EVA_HUD.page.value'] });
  const ji = (jump && jump.items) || {};
  const jj = (jump && jump.js) || {};
  assert(!!ji['#page-nav'] && jj['EVA_HUD.page.value'] === 'nav',
    '在消息页点「导航」页签 → 换成导航页（#page-nav 在、EVA_HUD.page.value = "nav"）',
    JSON.stringify(ji['#page-nav'] || null));
  assert(!!ji['.page.pageSw-enter-active'] && !!ji['.page.pageSw-leave-active'],
    '切页走的是「交叉淡入」：新页面带 pageSw-enter、旧页面带 pageSw-leave（同时在场 → 丝滑）',
    JSON.stringify({ enter: (ji['.page.pageSw-enter-active'] || {}).cls,
      leave: (ji['.page.pageSw-leave-active'] || {}).cls }));
  assert(!!ji['.pages'] && !/is-off/.test(String(ji['.pages'].cls)),
    '有页面打开时 .pages 不带 is-off（页面层是常驻实底，不是每次重新挂载）',
    ji['.pages'] && ji['.pages'].cls);

  /* 关闭：✕ 按钮 / Esc 两条链路都要把页面关掉（路由回 '/'、页面层藏起来）。
     ⚠ 上了 KeepAlive 之后页面实例**不卸载**，所以这里断言「路由 + .pages 的
     is-off」，而不是「DOM 里查不到页面」（去激活的页面会被挪出文档但还活着）。 */
  const shut = probe('?photo=park&page=msg', ['.pages'], [], 1200,
    { click: ['.page__close'], after: 300, js: ['EVA_HUD.page.value'] });
  const shp = (((shut || {}).items) || {})['.pages'] || {};
  const shPage = (((shut || {}).js) || {})['EVA_HUD.page.value'];
  assert(shPage === '' && /is-off/.test(String(shp.cls)),
    '点 ✕ → 关掉页面：路由回 "/"、页面层 .pages 加 is-off（藏起来且不吃点击）',
    JSON.stringify({ page: shPage, cls: shp.cls }));

  const esc = probe('?photo=park&page=msg', ['.pages'], [], 1200,
    { key: ['escape'], after: 300, js: ['EVA_HUD.page.value'] });
  const ecp = (((esc || {}).items) || {})['.pages'] || {};
  const ecPage = (((esc || {}).js) || {})['EVA_HUD.page.value'];
  assert(ecPage === '' && /is-off/.test(String(ecp.cls)),
    'Esc → 关掉应用页（键盘链路通）', JSON.stringify({ page: ecPage, cls: ecp.cls }));

  /* ---- 保活（KeepAlive）：切页 / 关页都不该把页面状态弄丢 ----
     证据用页面自己的状态：消息页展开一条（.msg__item.is-open = 1），
     切到导航再切回来 —— 若没有 KeepAlive，重新挂载时 openId 归零、展开态就没了。 */
  const keep = probe('?photo=park&page=msg', ['.msg__item.is-open'], ['.msg__item.is-open'],
    1200, {
      click: ['.msg__item', '.page__tab:nth-child(' + navTab + ')',
        '.page__tab:nth-child(' + msgTab + ')'],
      after: 400, js: ['EVA_HUD.page.value']
    });
  const kc = (keep && keep.counts) || {};
  const keepJ = (keep && keep.js) || {};
  assert(kc['.msg__item.is-open'] === 1 && keepJ['EVA_HUD.page.value'] === 'msg',
    '消息页展开一条 → 切到导航 → 切回来：展开状态还在（KeepAlive 保活，切页不卸载）',
    JSON.stringify({ open: kc['.msg__item.is-open'], page: keepJ['EVA_HUD.page.value'] }));

  const keep2 = probe('?photo=park&page=msg', ['.msg__item.is-open'], ['.msg__item.is-open'],
    1200, {
      click: ['.msg__item', '.page__close', '.rail .hexchip'],
      after: 400, js: ['EVA_HUD.page.value']
    });
  const k2c = (keep2 && keep2.counts) || {};
  const k2j = (keep2 && keep2.js) || {};
  assert(k2c['.msg__item.is-open'] === 1 && k2j['EVA_HUD.page.value'] === 'msg',
    '展开一条 → 关掉整页 → 从左灯塔芯片重新打开：展开状态**依然在**（跨关闭也保活）',
    JSON.stringify({ open: k2c['.msg__item.is-open'], page: k2j['EVA_HUD.page.value'] }));

  /* ---- 设置页分节（第 10 轮）：左栏五节、一次只显示一节、默认停在胎压 ---- */
  const setNav = probe('?photo=park&page=set',
    ['#set-tire-monitor', '.cells__c'], ['.setnav .hexchip', '.tlive__w'], 1200);
  const snc = (setNav && setNav.counts) || {};
  const sni = (setNav && setNav.items) || {};
  assert(snc['.setnav .hexchip'] === 5,
    '设置页左栏有 5 节芯片（胎压 / 感应 / BMS / 消息 / 软件信息）', snc['.setnav .hexchip']);
  assert(snc['.tlive__w'] === 2 && !!sni['#set-tire-monitor'] && !sni['.cells__c'],
    '默认停在「胎压胎温」那一节：两轮实时读数 + 监控开关都在、别的节不渲染',
    JSON.stringify({ live: snc['.tlive__w'], bms: sni['.cells__c'] }));

  /* 点左栏第 3 节（电池 BMS）→ 右栏换成 BMS 的内容（一次只显示一节，不再长滚动） */
  const setJump = probe('?photo=park&page=set',
    ['.setnav .hexchip.is-on'], ['.setnav .hexchip', '.cells__c', '.tlive__w'], 1200,
    { click: ['.setnav .hexchip:nth-child(3)'], after: 400 });
  const sjc = (setJump && setJump.counts) || {};
  const sji = (setJump && setJump.items) || {};
  assert(sjc['.setnav .hexchip'] === 5 && !!sji['.setnav .hexchip.is-on'],
    '左栏始终只有 1 个芯片是选中态（共 5 个）—— 选哪一节一目了然',
    JSON.stringify({ on: !!sji['.setnav .hexchip.is-on'], all: sjc['.setnav .hexchip'] }));
  assert(sjc['.cells__c'] === 16 && !sjc['.tlive__w'],
    '点第 3 节「电池 BMS」→ 右栏换成 16 串电压网格，胎压那一节收起',
    JSON.stringify({ cells: sjc['.cells__c'], live: sjc['.tlive__w'] }));

  /* ============================================================
   * 第 11 轮修的三件事，逐条钉住：
   *   ① 功率弧的 NaN（控制台 `<path> d` / `<circle> cx` 报 NaN）+ 弧永远画满
   *      —— 根因是量程读错了配置键（CONFIG.vehicle.modes 根本不存在 → powerMax = 0，
   *      0W 时 0/0 = NaN、有功率时 x/0 = Infinity → pct 恒为 1）。
   *   ② 媒体页「一屏装下」：操作条不许被挤到折叠线以下（以前要滚一下才点得到）。
   *      顺带把撞名的 .stage 改成 .player（base.css 里 .stage 是 HUD 缩放舞台）。
   *   ③ 刷新 = 重新上电：地址栏留着 #/set 时按 F5 回仪表本体；手打 #/set 照旧直达。
   * ============================================================ */

  /* ---- ① 功率弧：量程 = 挡位表里最大的 powerCap，弧按实际功率画 ---- */
  let capMax = 0;
  Object.keys(C.vehicle.gears).forEach(function (k) {
    const cap = Number(C.vehicle.gears[k].powerCap);
    if (cap > capMax) capMax = cap;
  });
  const powerScale = Math.ceil(capMax / 200) * 200;
  assert(powerScale === 10000,
    '功率表满量程 = 各挡位 powerCap 最大值取整（' + powerScale + 'W = 10kW，F 激烈模式最高）' +
    ' —— 量程为 0 时 0/0 = NaN、x/0 = Infinity（那次控制台 NaN 报错的根因）');

  /* 端点游标的角度 = 弧的终点角度：从 cx/cy 反算（圆心 150,156、半径 92） */
  const J_ANG = 'Math.round(((Math.atan2(Number(document.querySelector(".g-dot")' +
    '.getAttribute("cy"))-156,Number(document.querySelector(".g-dot").getAttribute("cx"))-150)' +
    '*180/Math.PI)+360)%360)';
  const J_NAN = 'document.querySelector(".g-arc").getAttribute("d").indexOf("NaN")' +
    '+document.querySelector(".g-dot").getAttribute("cx").indexOf("NaN")';
  const J_OPA = 'document.querySelector(".g-dot").getAttribute("opacity")';

  const arc780 = probe('?photo=power:780', [], [], 1200, { js: [J_ANG, J_NAN, J_OPA] });
  const a7 = (arc780 && arc780.js) || {};
  const deg780 = Math.round((140 + 260 * Math.min(1, 780 / powerScale)) % 360);
  assert(a7[J_NAN] === -2,
    '功率弧 / 端点游标的属性里没有 NaN（浏览器不再报 <path> d / <circle> cx 的 NaN）',
    String(a7[J_NAN]));
  assert(Math.abs(a7[J_ANG] - deg780) <= 2,
    '780W（' + powerScale + 'W 量程的 ' + Math.round(780 / powerScale * 100) + '%）时数值弧停在 ' +
    deg780 + '°，**不是画满一圈**', a7[J_ANG]);
  assert(a7[J_OPA] === '1', '有功率时端点游标可见（opacity = 1）', a7[J_OPA]);

  const arc0 = probe('?photo=park', [], [], 1200, { js: [J_ANG, J_NAN, J_OPA] });
  const a0 = (arc0 && arc0.js) || {};
  assert(a0[J_NAN] === -2 && a0[J_ANG] === 140 && a0[J_OPA] === '0',
    '0W（驻车）时：没有 NaN、数值弧停在起点 140°、游标隐藏 —— 以前这里是 0/0 = NaN',
    JSON.stringify([a0[J_NAN], a0[J_ANG], a0[J_OPA]]));

  /* ---- ② 媒体页一屏装下：操作条在可视区内、画面盒不溢出自己的槽位 ---- */
  const J_OVER = 'document.querySelector(".page__body").scrollHeight' +
    '-document.querySelector(".page__body").clientHeight';
  const mediaFit = probe('?photo=park&page=music',
    ['.page__body', '.playerwrap', '.player', '#media-bar'], [], 1200,
    { js: [J_OVER, 'EVA_HUD.page.value'] });
  const mfi = (mediaFit && mediaFit.items) || {};
  const mfj = (mediaFit && mediaFit.js) || {};
  const mBody = mfi['.page__body'] || null;
  const mBar = mfi['#media-bar'] || null;
  const mWrap = mfi['.playerwrap'] || null;
  const mPlay = mfi['.player'] || null;

  assert(!!mBody && mBody.overflowY === 'hidden',
    '媒体页正文区不滚动（AppPage fit → .page--fit → overflow: hidden）—— 页内自己分高度',
    mBody ? mBody.overflowY : 'null');
  assert(mfj[J_OVER] <= 1,
    '媒体页内容不超出可视高度（scrollHeight - clientHeight = ' + mfj[J_OVER] + 'px）',
    mfj[J_OVER]);
  assert(!!mBar && !!mBody && (mBar.y + mBar.h) <= (mBody.y + mBody.h) + 0.5,
    '播放器那条操作条在可视区内（底边 ' +
    (mBar ? (mBar.y + mBar.h).toFixed(1) : '?') + ' ≤ 正文区底边 ' +
    (mBody ? (mBody.y + mBody.h).toFixed(1) : '?') + '）—— 不用滚就能点「播放 / 停止」');
  assert(!!mPlay && !!mWrap && mPlay.h <= mWrap.h + 0.5,
    '画面盒不溢出自己的槽位（.player 高 ' + (mPlay ? mPlay.h : '?') +
    ' ≤ .playerwrap 高 ' + (mWrap ? mWrap.h : '?') +
    '）—— 撞上 base.css 里 HUD 缩放舞台的 .stage 时会被撑成 1300×760',
    JSON.stringify({ player: mPlay && mPlay.h, wrap: mWrap && mWrap.h }));

  /* ---- ③ 刷新 = 重新上电（F5 回仪表本体）；手打深链照旧直达 ---- */
  const deepLink = probe('?photo=park#/set', ['.page'], ['#page-set'], 1200,
    { js: ['EVA_HUD.page.value', 'location.hash'] });
  const dli = (deepLink && deepLink.items) || {};
  const dlc = (deepLink && deepLink.counts) || {};
  const dlj = (deepLink && deepLink.js) || {};
  assert(!!dli['.page'] && dlc['#page-set'] === 1 && dlj['EVA_HUD.page.value'] === 'set',
    '手打 …/index.html#/set 打开：照旧直达设置页（深链不受「刷新回 home」影响）',
    JSON.stringify({ page: dlj['EVA_HUD.page.value'], hash: dlj['location.hash'] }));

  const reload = probe('?photo=park', ['.page', '.pages'], [], 700,
    { reload: 400, reloadHash: 'set', after: 300, budget: 12000,
      js: ['EVA_HUD.page.value', 'location.hash'] });
  const rli = (reload && reload.items) || {};
  const rlj = (reload && reload.js) || {};
  assert(!!reload && rlj['EVA_HUD.page.value'] === '' && !rli['.page'] &&
    rlj['location.hash'] === '#/',
    '在 #/set 上按 F5（真刷新）→ 回仪表本体：没有页面、EVA_HUD.page.value = ""、地址栏变成 #/',
    JSON.stringify(rlj));

  /* ---- 胎压胎温已经从消息中心搬到设置页（第 10 轮） ---- */
  const msgNoTire = probe('?photo=park&page=msg',
    ['.tire__w', '#msg-list'], ['.msg__item'], 1200);
  const mnt = (msgNoTire && msgNoTire.items) || {};
  assert(mnt['.tire__w'] === null && !!mnt['#msg-list'],
    '消息中心不再画胎压胎温（那块读数搬到了「设置 → 胎压胎温」），只留消息列表',
    JSON.stringify(mnt['.tire__w'] || null));

  /* ============================================================
   * 第 12 轮：氛围灯带六态 / 连按换挡后中央还有图 / 字母挡位键
   * ============================================================ */

  /* ---- ① 氛围灯带：真 DOM 上的类名 + base.css 解出来的颜色 / 动画 ----
     两件事分开测：
       a) 真元素（.strip--l）有没有按 view.strip 挂上 is-<状态>（跑一条最简单的 real 链路）
       b) base.css 里六种状态各自解出来是不是「那个颜色 + 那个闪烁」
          —— b 用一次性注入六个类名的办法量：省 5 次无头浏览器，
             而且验的正是「base.css 真能解析出这些值」这件事。 */
  const stripLive = probe('?photo=gear:C,speed:40,throttle:.6,power:900',
    ['.strip--l', '.strip--r'], [], 1200,
    { js: ['EVA_HUD.view.strip', 'EVA_HUD.vehicle.throttle'] });
  const sli = (stripLive && stripLive.items) || {};
  const slj = (stripLive && stripLive.js) || {};
  assert(slj['EVA_HUD.view.strip'] === 'accel' && !!sli['.strip--l'] &&
    sli['.strip--l'].cls.indexOf('is-accel') >= 0 &&
    (sli['.strip--r'] || {}).cls &&
    (sli['.strip--r'] || { cls: '' }).cls.indexOf('is-accel') >= 0,
    '?photo 给定「加速」状态 → 左右两条灯带都挂上 is-accel（view.strip → 类名 全链路）',
    JSON.stringify({ strip: slj['EVA_HUD.view.strip'], l: sli['.strip--l'] && sli['.strip--l'].cls }));
  assert(!!sli['.strip--l'] && sli['.strip--l'].anim === 'none',
    '加速状态是**常亮**（animation: none，不闪）', sli['.strip--l'] && sli['.strip--l'].anim);
  assert(!!sli['.strip--l'] && /rgb\(\s*58,\s*160,\s*255/.test(String(sli['.strip--l'].bgImg)),
    '加速状态用的是蓝色（rgb(58,160,255)）—— 颜色真的来自 base.css 的 --sc',
    sli['.strip--l'] && String(sli['.strip--l'].bgImg).slice(0, 60));

  const J_STRIPS = 'JSON.stringify((function(){var out={};' +
    '["is-idle","is-accel","is-brake","is-park","is-boost","is-fault"].forEach(function(c){' +
    'var t=document.createElement("span");t.className="strip "+c;' +
    'document.querySelector(".screen").appendChild(t);' +
    'var cs=getComputedStyle(t);' +
    'out[c]=[String(cs.animationName),String(cs.backgroundImage).replace(/^linear-gradient\\(/,"").slice(0,60)];});' +
    'return out;})())';
  const stripAll = probe('?photo=park', [], [], 1200, { js: [J_STRIPS] });
  const sta = ((stripAll && stripAll.js) || {})[J_STRIPS] || '{}';
  let stMap = {};
  try { stMap = JSON.parse(sta); } catch (e) { stMap = {}; }
  /* 期望表 = 需求原文：蓝加速 / 绿减速 / 紫闪氮气 / 红闪故障 / 黄驻车 / 淡青静止 */
  const STRIP_WANT = [
    ['is-idle', 'stripIdle', 'rgb(127, 240, 224)', '静止 → 淡青'],
    ['is-accel', 'none', 'rgb(58, 160, 255)', '加速 → 蓝色常亮'],
    ['is-brake', 'none', 'rgb(57, 217, 138)', '减速 / 回收 → 绿色常亮'],
    ['is-park', 'stripBreath', 'rgb(255, 192, 46)', '驻车 → 黄色'],
    ['is-boost', 'stripFlash', 'rgb(168, 85, 247)', '烧氮气 → 紫色闪烁'],
    ['is-fault', 'stripFlash', 'rgb(255, 45, 61)', '故障 → 红色闪烁']
  ];
  STRIP_WANT.forEach(function (w) {
    const got = stMap[w[0]] || ['', ''];
    const animOk = w[1] === 'none' ? got[0] === 'none' : String(got[0]).indexOf(w[1]) >= 0;
    assert(animOk && String(got[1]).indexOf(w[2]) >= 0,
      '灯带 ' + w[3] + '（' + w[1] + ' / ' + w[2] + '）',
      JSON.stringify(got));
  });

  /* ---- ② 跨帧连按换挡后中央还有立绘（那个「图有概率消失」的 bug） ----
     ⚠ 探针的按键是**一次性派发**的（同一个 tick 里连按 6 个挡位键只会换一次），
     复现不了「连按」的时序 —— 所以诊断开关 `?gearburst=N` 每 220ms 换一次挡、
     换 N 次（跨帧！），并在每次换挡的下一帧检查「中央那一层还有没有东西」，
     把 empty / min / max 记在 window.__gearburst 里。
     修好之后应当：12 次跨帧换挡里 empty = 0，图层数永远 1~2，最后一次淡出后只剩 1 层。 */
  /* ⚠ 表达式里**不能出现 `|`**（probe.html 用 `|` 分隔多条 js 表达式）——
     所以这里用三元而不是 `||`，否则会被切成两条垃圾表达式、读回来是 undefined。 */
  const J_BURSTSTAT = 'window.__gearburst ? JSON.stringify(window.__gearburst) : "null"';
  const J_LAYER = 'JSON.stringify((function(){' +
    'var layers=document.querySelectorAll(".core__layer");' +
    'var cur=layers[0];var art=document.querySelector("#v-gear-art");' +
    'var veil=document.querySelector("#v-gear-veil");' +
    'var box=document.querySelector(".core__hex");' +
    'return {n:layers.length,gear:EVA_HUD.view.gear,art:!!art,' +
    'src:art?String(art.src).split("/").pop():"",artOp:art?getComputedStyle(art).opacity:"",' +
    'curOp:cur?getComputedStyle(cur).opacity:"",veil:veil?getComputedStyle(veil).opacity:"none",' +
    'hasChild:cur?!!cur.firstElementChild:false,' +
    'box:box?[Math.round(box.getBoundingClientRect().width),Math.round(box.getBoundingClientRect().height)]:[0,0]};' +
    '})())';
  const burst = probe('?nofreeze=1&boot=0&gearburst=12', [], [], 5000,
    { budget: 14000, js: [J_BURSTSTAT, J_LAYER] });
  let bj = {}, bs = {};
  try { bj = JSON.parse((((burst && burst.js) || {})[J_LAYER]) || '{}'); } catch (e) { bj = {}; }
  try { bs = JSON.parse((((burst && burst.js) || {})[J_BURSTSTAT]) || '{}') || {}; } catch (e) { bs = {}; }

  assert(bs.finished === true && bs.done === 12,
    '连按换挡压力测试真的跑完了（?gearburst=12 → ' + bs.done + ' 次跨帧换挡）',
    JSON.stringify(bs));
  assert(bs.empty === 0,
    '12 次跨帧换挡期间，中央**一次都没空**（empty = ' + bs.empty + '）—— 那个「图有概率消失」的 bug',
    JSON.stringify(bs));
  assert(bs.min >= 1 && bs.max <= 2,
    '图层数始终在 1~2 之间（min ' + bs.min + ' / max ' + bs.max + '：要么当前层，要么当前 + 正在淡出的旧层）',
    JSON.stringify(bs));
  assert(bj.n === 1 && bj.hasChild === true,
    '最后一次换挡的淡出结束后只剩 1 个图层、而且里面有东西（n ' + bj.n + ' / child ' + bj.hasChild + '）',
    JSON.stringify(bj));
  assert(bj.art === true && String(bj.src).indexOf('gear-' + String(bj.gear).toLowerCase()) >= 0,
    '中央六边形里是**当前挡位**的图（挡位 ' + bj.gear + ' → ' + bj.src + '）—— 不会再「换着换着图没了」',
    bj.src);
  assert(bj.curOp === '1' && bj.artOp === '0.95',
    '当前层不透明（层 opacity ' + bj.curOp + '、图 opacity ' + bj.artOp + '）', JSON.stringify(bj));
  assert(bj.veil === String(C.vehicle.gearArt.veil),
    '挡位图上的暗幕按 config 压着（veil ' + bj.veil + ' ← ' + C.vehicle.gearArt.veil + '）', bj.veil);
  assert(bj.box[0] > 300 && bj.box[1] > 300,
    '六边形裁切区有真实尺寸（' + bj.box[0] + '×' + bj.box[1] + '）', JSON.stringify(bj.box));

  /* ---- ③ 跑一段真实演示：换挡跨了很多帧，中央依旧不能空 ---- */
  const live = probe('?nofreeze=1&boot=0', [], [], 9000, { budget: 14000, js: [J_LAYER] });
  let lj = {};
  try { lj = JSON.parse((((live && live.js) || {})[J_LAYER]) || '{}'); } catch (e) { lj = {}; }
  assert(lj.n >= 1 && lj.n <= 2,
    '演示跑了 9 秒（期间会自己换挡）→ 图层只有 ' + lj.n + ' 层（最多「当前 + 正在淡出」两层）',
    JSON.stringify(lj));
  assert(lj.curOp === '1' && lj.hasChild === true,
    '跑了一段之后中央那一层依然可见、也还有东西（opacity ' + lj.curOp + '，图 / 徽记 = ' +
    (lj.art ? '图' : '徽记') + '）', JSON.stringify(lj));

  /* ---- 探针总账：每一次都真的量到了数据 ----
     「探针空手返回 null」是最阴的假绿灯：断言里的 `x && x.y` 短路会让那些条目
     悄悄消失（这次 CoreHex 的暗幕节点被删掉时就少了 4 条）。所以这里结个总账。 */
  assert(missProbes.length === 0,
    '每次探针都量到了数据（共 ' + probeCalls + ' 次无头浏览器调用' +
    (missProbes.length ? '；空手 ' + missProbes.length + ' 次：' + missProbes.join(' / ') :
      '，没有静默跳过') + '）');
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
