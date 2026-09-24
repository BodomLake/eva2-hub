/*!
 * tools/shot.js — 给 HUD 出图（调用本机 Chrome / Edge 无头截图，零 npm 依赖）
 * ------------------------------------------------------------------
 * 前置：先构建 —— npm run build（dist/index.html 必须存在）
 *
 *   node tools/shot.js                        # 默认 cruise 姿态 → docs/preview.png
 *   node tools/shot.js --pose=park            # 车辆静止上电（= 参考照片那一帧）
 *   node tools/shot.js --pose=charge          # 充电中（龙头锁 ON）
 *   node tools/shot.js --pose=lowbatt         # 低电量（电量条红闪）
 *   node tools/shot.js --pose=full            # 高电量（电量条绿色档）
 *   node tools/shot.js --photo="speed:12,gear:X2,motorTemp:60" --out=docs/r.png
 *   node tools/shot.js --query=panel=1 --out=docs/preview-panel.png   # 连操作弹框一起拍
 *   node tools/shot.js --pose=park --query=boot=8000 --ms=2850 --out=docs/preview-boot.png
 *        # 开机自检「写满进度条后仍在停留」那一帧（?boot=8000 把停留拉长 → 出图稳定）
 *   node tools/shot.js --scale=2              # 2 倍分辨率出图（看细节）
 *
 * 原理：dist 是相对路径产物（vite.config.js 的 base:'./'），配合
 * --allow-file-access-from-files 可以直接用 file:// 打开并截图。
 */
'use strict';

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* 内置姿态：字段名与 state.js 完全一致（?photo= 参数的语法） */
const POSES = {
  cruise: 'speed:35,power:780,gear:X1,soc:51,auxSoc:100,odo:11971,' +
          'rideSec:3498,tripKm:28.1,rangeFull:145,rangeKm:74,nos:100,' +
          'motorTemp:116,ambient:35,lamp.beamLow:1,lamp.cruise:1,lamp.regen:1,lamp.turnR:1',
  park: '',
  charge: 'gear:P,charger:1,soc:31,power:0,speed:0,auxSoc:88,odo:11971,' +
          'rideSec:3498,tripKm:12.4,rangeFull:145,rangeKm:45,nos:64,' +
          'motorTemp:48,lamp.beamLow:1,lamp.lock:1,lamp.usb:1',
  lowbatt: 'gear:E,speed:22,power:420,soc:14,auxSoc:74,odo:11971,' +
           'rideSec:3498,tripKm:8.1,rangeFull:166.8,rangeKm:23.4,nos:22,' +
           'motorTemp:96,lamp.beamLow:1,lamp.usb:1',
  full: 'gear:F,speed:41,power:1180,soc:78,auxSoc:100,odo:11971,' +
        'rideSec:6120,tripKm:52.7,rangeFull:118.9,rangeKm:92.7,nos:46,' +
        'motorTemp:138,lamp.beamHigh:1,lamp.cruise:1',
  /* 转向灯演示三连：左转 / 右转 / 双闪（转向灯就在 READY 铭牌左右两侧） */
  left: 'turn:left,gear:X1,speed:19,power:430,soc:51,auxSoc:100,odo:11971,' +
        'rideSec:3498,tripKm:28.1,rangeFull:145,rangeKm:74,nos:96,' +
        'motorTemp:104,lamp.beamLow:1,lamp.cruise:1',
  right: 'turn:right,gear:X1,speed:21,power:470,soc:51,auxSoc:100,odo:11971,' +
         'rideSec:3498,tripKm:28.1,rangeFull:145,rangeKm:74,nos:96,' +
         'motorTemp:104,lamp.beamLow:1,lamp.cruise:1',
  haz: 'turn:hazard,gear:X1,speed:0,power:0,soc:51,auxSoc:100,odo:11971,' +
       'rideSec:3498,tripKm:28.1,rangeFull:145,rangeKm:74,nos:96,' +
       'motorTemp:88,lamp.beamLow:1',
  /* 四位数功率：看数值牌自动降字号（不会突出圆环） */
  bigpower: 'gear:X2,speed:48,power:1800,soc:72,auxSoc:100,odo:11971,' +
            'rideSec:6120,tripKm:44.2,rangeFull:113.1,rangeKm:81.4,nos:38,' +
            'motorTemp:132,lamp.beamHigh:1,lamp.cruise:1',
  off: 'powered:false,gear:P,speed:0,power:0'
};

const args = { pose: 'cruise', out: 'docs/preview.png', size: '1300,760', ms: 9000, scale: 1, photo: null, query: '' };
process.argv.slice(2).forEach(function (a) {
  const m = /^--([a-z]+)=(.*)$/.exec(a);
  if (m) args[m[1]] = m[2];
  else if (!args.photo) args.photo = a;
});

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
if (!exe) {
  console.log('\n  没找到 Chrome / Edge，可用环境变量 CHROME_PATH 指定路径\n');
  process.exit(2);
}

const photo = (args.photo !== null && args.photo !== undefined) ? args.photo : POSES[args.pose];
if (photo === undefined) {
  console.log('\n  未知姿态: ' + args.pose + '（可用: ' + Object.keys(POSES).join(' / ') + '）\n');
  process.exit(2);
}

const entry = path.join(ROOT, 'dist', 'index.html');
if (!fs.existsSync(entry)) {
  console.log('\n  dist/index.html 不存在，先执行：npm run build\n');
  process.exit(2);
}

const q = [];
if (photo) q.push('photo=' + photo);
if (args.query) q.push(String(args.query).replace(/^\?/, ''));
const url = 'file:///' + entry.replace(/\\/g, '/') + (q.length ? '?' + q.join('&') : '');
const out = path.resolve(ROOT, args.out);
fs.mkdirSync(path.dirname(out), { recursive: true });

/* 每次都用全新 profile：Chrome 会记住上次窗口尺寸，复用会导致截图被裁切 */
const profile = path.join(os.tmpdir(), 'eva2hud-shot-' + Date.now().toString(36));

const r = spawnSync(exe, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--force-device-scale-factor=' + args.scale,
  '--user-data-dir=' + profile,
  '--window-size=' + args.size,
  '--virtual-time-budget=' + args.ms,
  '--screenshot=' + out,
  url
], { encoding: 'utf8' });

try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }

if (!fs.existsSync(out)) {
  console.log('\n  截图失败\n' + (r.stderr || '') + '\n');
  process.exit(1);
}
console.log('\n  ' + path.relative(ROOT, out).replace(/\\/g, '/') + '  (' + fs.statSync(out).size + ' bytes)');
console.log('  pose=' + args.pose + '  size=' + args.size + '  scale=' + args.scale + '\n');
