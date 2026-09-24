/*!
 * tools/cutout.js — 白底立绘 → 透明底立绘（零依赖，纯 Node）
 * ------------------------------------------------------------------
 *   node tools/cutout.js                     # 处理 config.boot.art 引用的那几张图 + src/assets/gear/ 里的挡位图
 *   node tools/cutout.js asuka_stand.png …   # 只处理指定的图（名字 = src/assets 或 src/assets/gear 里的文件名）
 *   选项：--out=src/assets/art  --src=src/assets  --seed=232  --floor=190
 *          --tol=14  --sat=30  --pad=0  --keep（不裁透明边）  --dry（只报告，不写文件）
 *
 * 两个来源目录（产物都写进 src/assets/art/，运行时只扫这一个目录）：
 *   src/assets/       立绘 / 徽记原图 → 产物同名（asuka_stand.png → art/asuka_stand.png）
 *   src/assets/gear/  中央六边形的挡位图（A/C/E/F）→ 产物加 gear- 前缀、字母小写
 *                     （A.png → art/gear-a.png，config.vehicle.gearArt.map 里填的就是它）
 *
 * 为什么需要这一步：自检页背景是近黑的红黑渐变，而网上的立绘多半是
 * **白底不透明 PNG**（colorType=2，根本没有 alpha）—— 直接铺上去就是两块白板，
 * 连 `mix-blend-mode: screen` 都会整块发白（白 = 最大值，screen 去掉的只有黑）。
 * 所以先把白底抠掉再进画面：
 *   ① 只吃「和四条边连通」的亮中性色 → 图**内部**的白色（白色战斗服之类）
 *      被线稿挡在泛洪区外，不会被误伤（这是不用全局色键的原因）；
 *   ② 泛洪允许渐变生长：和来源像素亮度差 ≤ --tol 就继续吃 → 能连片吃掉
 *      230 左右的灰白晕影，碰到线稿的大跳变就停；
 *   ③ 泛洪区外沿 2px 再按亮度给一次半透明 → 抗锯齿边不留白圈；
 *   ④ 裁掉透明边（--keep 关掉）→ 运行时 contain 缩放就是「立绘本体」的尺寸。
 * 产物统一写进 src/assets/art/，运行时只扫这一个目录（core/artslot.js）：
 * 于是「换立绘」= 把图丢进 art/ + 改一行 config，不用动任何组件代码。
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { CONFIG as C } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ==================================================================
 * PNG 解码：只支持 8-bit、非隔行的 灰度 / RGB / 灰度+A / RGBA
 * （这两张原图正好是 colorType=2 的 RGB，别的格式给出人话报错）
 * ================================================================== */
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a, b, c) {
  const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function unfilter(ft, cur, prev, bpp, stride) {
  for (let n = 0; n < stride; n++) {
    const a = n >= bpp ? cur[n - bpp] : 0;
    const b = prev[n];
    const c = n >= bpp ? prev[n - bpp] : 0;
    let v = cur[n];
    if (ft === 1) v += a;
    else if (ft === 2) v += b;
    else if (ft === 3) v += (a + b) >> 1;
    else if (ft === 4) v += paeth(a, b, c);
    cur[n] = v & 255;
  }
}

function decodePNG(buf) {
  if (!buf.slice(0, 8).equals(SIG)) throw new Error('不是 PNG（文件签名不对）');
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, inter = 0;
  const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bd = data[8];
      ct = data[9];
      inter = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('只支持 8-bit PNG（这张是 ' + bd + '-bit），请先另存为 8-bit');
  if (inter) throw new Error('不支持隔行（Adam7）PNG，请先另存为普通（非隔行）PNG');
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!bpp) throw new Error('不支持的 colorType=' + ct + '，请先转成 RGB / RGBA 8-bit');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const rgba = new Uint8Array(w * h * 4);
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  let off = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[off++];
    cur.set(raw.subarray(off, off + stride));
    off += stride;
    unfilter(ft, cur, prev, bpp, stride);
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      if (bpp >= 3) {
        rgba[d] = cur[s];
        rgba[d + 1] = cur[s + 1];
        rgba[d + 2] = cur[s + 2];
        rgba[d + 3] = bpp === 4 ? cur[s + 3] : 255;
      } else {
        rgba[d] = rgba[d + 1] = rgba[d + 2] = cur[s];
        rgba[d + 3] = bpp === 2 ? cur[s + 1] : 255;
      }
    }
    prev.set(cur);
  }
  return { w: w, h: h, rgba: rgba };
}

/* ==================================================================
 * PNG 编码：RGBA 8-bit，每行在 5 种滤镜里挑「绝对差之和」最小的那个
 * （和主流编码器同一套自适应滤波；抠掉白底后体积通常比原图还小）
 * ================================================================== */
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) c = CRC_TABLE[(c ^ buf[n]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const lines = Buffer.alloc((stride + 1) * h);
  const prev = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(function () { return new Uint8Array(stride); });
  let off = 0;
  for (let y = 0; y < h; y++) {
    const line = rgba.subarray(y * stride, y * stride + stride);
    let best = 0, bestScore = Infinity, bestBuf = cand[0];
    for (let ft = 0; ft < 5; ft++) {
      const out = cand[ft];
      let score = 0;
      for (let n = 0; n < stride; n++) {
        const a = n >= 4 ? line[n - 4] : 0;
        const b = prev[n];
        const c = n >= 4 ? prev[n - 4] : 0;
        let v = line[n];
        if (ft === 1) v -= a;
        else if (ft === 2) v -= b;
        else if (ft === 3) v -= (a + b) >> 1;
        else if (ft === 4) v -= paeth(a, b, c);
        v &= 255;
        out[n] = v;
        score += v < 128 ? v : 256 - v;        // 标准启发式：字节当有符号数取绝对值
      }
      if (score < bestScore) { bestScore = score; best = ft; bestBuf = out; }
    }
    lines[off++] = best;
    lines.set(bestBuf, off);
    off += stride;
    prev.set(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;                                  // bit depth
  ihdr[9] = 6;                                  // colorType 6 = RGBA（关键：多了 alpha）
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;     // 默认压缩 / 滤波 / 非隔行
  return Buffer.concat([SIG, chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(lines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ==================================================================
 * 抠白底：从四条边泛洪 + 渐变生长 + 边缘羽化 + 裁掉透明边
 * ================================================================== */
const lum = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;
const sat = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

function cutWhite(img, o) {
  const w = img.w, h = img.h, px = img.rgba, N = w * h;
  const gone = new Uint8Array(N);                 // 1 = 判定为背景
  const stack = new Int32Array(N);
  let sp = 0;

  const white = (i, t) => {
    const d = i * 4;
    return Math.min(px[d], px[d + 1], px[d + 2]) >= t && sat(px[d], px[d + 1], px[d + 2]) <= o.sat;
  };
  const push = (i) => { gone[i] = 1; stack[sp++] = i; };

  /* ① 种子：四条边上「接近纯白 + 中性」的像素 */
  for (let x = 0; x < w; x++) {
    const a = x, b = (h - 1) * w + x;
    if (!gone[a] && white(a, o.seed)) push(a);
    if (!gone[b] && white(b, o.seed)) push(b);
  }
  for (let y = 0; y < h; y++) {
    const a = y * w, b = y * w + w - 1;
    if (!gone[a] && white(a, o.seed)) push(a);
    if (!gone[b] && white(b, o.seed)) push(b);
  }

  /* ② 渐变生长：只要求「亮 + 中性」，但必须和来源像素亮度差 ≤ tol。
        线稿处是几十上百的跳变 → 一定停；灰白晕影每像素只变 1~2 → 一路吃过去。
        内部白色（战斗服）被线稿围住、和边不连通 → 吃不到，这是不做全局色键的原因 */
  while (sp > 0) {
    const i = stack[--sp];
    const x = i % w, y = (i - x) / w;
    const li = lum(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (gone[j] || !white(j, o.floor)) continue;
      const lj = lum(px[j * 4], px[j * 4 + 1], px[j * 4 + 2]);
      if (Math.abs(li - lj) > o.tol) continue;
      push(j);
    }
  }

  /* ③ 羽化：泛洪区外沿 2px 内、仍然亮且偏中性的像素 → 按亮度给半透明
        （抗锯齿边本来就是「白底 + 线稿」的混合，直接归零会留一圈白） */
  let feather = 0;
  for (let band = 0; band < 2; band++) {
    const snap = gone.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (snap[i]) continue;
        const near = (x > 0 && snap[i - 1]) || (x < w - 1 && snap[i + 1]) ||
                     (y > 0 && snap[i - w]) || (y < h - 1 && snap[i + w]);
        if (!near) continue;
        const d = i * 4, r = px[d], g = px[d + 1], b = px[d + 2];
        if (Math.min(r, g, b) < o.floor - 30 || sat(r, g, b) > o.sat * 2) continue;
        const a = Math.max(0, Math.min(255, Math.round(255 * (255 - lum(r, g, b)) / (255 - o.ink))));
        px[d + 3] = Math.min(px[d + 3], a);
        feather++;
      }
    }
  }

  /* ④ 背景 alpha 归零 */
  let removed = 0;
  for (let i = 0; i < N; i++) {
    if (gone[i]) { px[i * 4 + 3] = 0; removed++; }
  }

  /* ⑤ 裁掉透明边：运行时用 background-size: contain，裁过之后缩放的才是「立绘本体」。
        ⚠ 判「这一行/列是不是空的」用**计数阈值**而不是「有没有一个不透明像素」——
       否则背景上残留的几十个杂点会把边距全部撑住，裁了等于没裁 */
  let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
  if (o.crop) {
    const solid = (i) => px[i * 4 + 3] > 8;
    const rowMin = Math.max(2, Math.round(w * 0.003));
    const colMin = Math.max(2, Math.round(h * 0.003));
    while (y0 < y1 && !rowHas(solid, w, y0, x0, x1, rowMin)) y0++;
    while (y1 > y0 && !rowHas(solid, w, y1, x0, x1, rowMin)) y1--;
    while (x0 < x1 && !colHas(solid, w, y0, y1, x0, colMin)) x0++;
    while (x1 > x0 && !colHas(solid, w, y0, y1, x1, colMin)) x1--;
    x0 = Math.max(0, x0 - o.pad); y0 = Math.max(0, y0 - o.pad);
    x1 = Math.min(w - 1, x1 + o.pad); y1 = Math.min(h - 1, y1 + o.pad);
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const from = ((y + y0) * w + x0) * 4;
    out.set(px.subarray(from, from + cw * 4), y * cw * 4);
  }
  return { w: cw, h: ch, rgba: out, removed: removed, feather: feather, total: N, box: [x0, y0, x1, y1] };
}

function rowHas(solid, w, y, x0, x1, min) {
  let n = 0;
  for (let x = x0; x <= x1; x++) { if (solid(y * w + x) && ++n >= min) return true; }
  return false;
}
function colHas(solid, w, y0, y1, x, min) {
  let n = 0;
  for (let y = y0; y <= y1; y++) { if (solid(y * w + x) && ++n >= min) return true; }
  return false;
}

/* ==================================================================
 * --map：把结果缩成 ASCII 图（. 透明 / + 半透明 / w 残留的白灰背景 / # 立绘）
 * 调阈值时看这个最直观；顺手报一下四类像素的占比
 * ================================================================== */
function asciiMap(img, cols) {
  const { w, h, rgba } = img;
  const rows = Math.max(1, Math.round(cols * h / w / 2));      // 字符是 1:2 的，纵向折半
  const tally = { '.': 0, '+': 0, 'w': 0, '#': 0 };
  const lines = [];
  for (let ry = 0; ry < rows; ry++) {
    let line = '';
    for (let rx = 0; rx < cols; rx++) {
      const x = Math.min(w - 1, Math.round((rx + 0.5) * w / cols));
      const y = Math.min(h - 1, Math.round((ry + 0.5) * h / rows));
      const d = (y * w + x) * 4;
      const a = rgba[d + 3];
      let ch;
      if (a < 20) ch = '.';
      else if (a < 250) ch = '+';
      else if (Math.min(rgba[d], rgba[d + 1], rgba[d + 2]) >= 200 &&
               sat(rgba[d], rgba[d + 1], rgba[d + 2]) <= 40) ch = 'w';
      else ch = '#';
      tally[ch]++;
      line += ch;
    }
    lines.push(line);
  }
  return { lines: lines, tally: tally, total: rows * cols };
}

/* ==================================================================
 * 入口：默认处理 config.boot.art / config.boot.mark 里引用的那几张图
 * ================================================================== */
const argv = process.argv.slice(2);
const o = {
  src: 'src/assets',
  out: 'src/assets/art',
  seed: 232,      // 种子阈值：四条边上「至少这么白」才算背景
  floor: 190,     // 生长阈值：亮于此 + 中性 → 可以继续吃
  tol: 60,        // 生长时允许的相邻亮度差。要够大才能吃「背景自己的硬边」
                  // （透明区导出成棋盘格时，白/灰格之间有 ~50 的跳变），
                  // 又要小于「线稿边缘」的跳变（白底 255 → 黑线 20 ≈ 235）→ 线稿一定停
  sat: 30,        // 中性判定：max-min 超过它 = 有色，不吃
  ink: 90,        // 羽化换算用的「线稿亮度」参考
  pad: 0,
  crop: true,
  dry: false,
  map: false      // --map：打印 ASCII 透明度图 + 残留统计（调阈值时用）
};
const names = [];
argv.forEach(function (a) {
  const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
  if (!m) { names.push(a); return; }
  const k = m[1];
  if (k === 'keep') o.crop = false;
  else if (k === 'dry') o.dry = true;
  else if (k === 'map') o.map = true;
  else if (k === 'src' || k === 'out') o[k] = m[2];          // 路径参数：原样收
  else if (k in o && m[2] !== undefined) o[k] = Number(m[2]); // 阈值参数：转数字
  else { console.log('未知参数 --' + k); process.exit(1); }
});

/* 没点名 → 从 config 里取（.src 支持「文件名」/「./art/名字.png」/ URL）+ gear/ 里的挡位图 */
function fromConfig() {
  const art = (C.boot && C.boot.art) || {};
  const out = [];
  ['left', 'right'].forEach(function (side) {
    const s = (art[side] || {}).src;
    if (s && !/^(https?:|data:|\/)/.test(s)) out.push(path.basename(s));
  });
  /* 环里六边形内部的徽记（config.boot.mark）也是同一套「预留位」 */
  const mk = ((C.boot && C.boot.mark) || {}).src;
  if (mk && !/^(https?:|data:|\/)/.test(mk)) out.push(path.basename(mk));
  return out;
}

/* src/assets/gear/ 里的挡位图：放几张就抠几张（换图 = 丢进目录，不用改脚本） */
const GEAR_DIR = 'src/assets/gear';
function gearInDir() {
  const dir = path.join(ROOT, GEAR_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (f) { return /\.png$/i.test(f); })
    .map(function (f) { return path.join(GEAR_DIR, f); });
}

/* 一个待处理项 → { file 源文件名, from 源路径, out 产物名 }；两处都找不到就返回 null。
   挡位图（gear/ 目录）的产物加 gear- 前缀 + 字母小写，免得和自检页立绘混在一起。 */
function jobOf(name) {
  const base = path.basename(String(name));
  const file = /\.png$/i.test(base) ? base : base + '.png';
  const inArt = path.join(ROOT, o.src, file);
  if (fs.existsSync(inArt)) return { file: file, from: inArt, out: file };
  const inGear = path.join(ROOT, GEAR_DIR, file);
  if (fs.existsSync(inGear)) return { file: file, from: inGear, out: 'gear-' + file.toLowerCase() };
  return null;
}

/* 个别原图的背景「不够白」时在这里单独给参数（省得为了它一份文件改全局默认值）。
   C.png 的背景是 180~235 的浅蓝灰：默认 seed=232 一颗种子都种不下去（抠掉 0.6%），
   把种子 / 生长阈值放低才吃得动；线稿照样挡得住 —— 泛洪只从四条边的连通区生长。 */
const FILE_TUNING = {
  'c.png': { seed: 185, floor: 170, sat: 40 }
};

console.log('\nEVA-02 HUD · cutout（白底立绘 / 挡位图 → 透明底）\n');

const list = names.length ? names : fromConfig().concat(gearInDir());
const targets = [];
list.forEach(function (n) {
  const j = jobOf(n);
  if (j) targets.push(j);
  else console.log('  跳过 ' + path.basename(String(n)) + '：' + o.src + '/ 与 ' + GEAR_DIR + '/ 里都没有这个文件');
});
if (!targets.length) {
  console.log('  没有可处理的图：config.boot.art.left/right.src 都是空的，' + GEAR_DIR + '/ 里也没有图\n');
  process.exit(0);
}
if (!o.dry) fs.mkdirSync(path.join(ROOT, o.out), { recursive: true });

let done = 0;
targets.forEach(function (job) {
  const file = job.file;
  try {
    const t0 = Date.now();
    const img = decodePNG(fs.readFileSync(job.from));
    /* 单文件微调（FILE_TUNING）叠在命令行参数之上 */
    const res = cutWhite(img, Object.assign({}, o, FILE_TUNING[file.toLowerCase()] || {}));
    const png = encodePNG(res.w, res.h, res.rgba);
    const to = path.join(ROOT, o.out, job.out);
    if (!o.dry) fs.writeFileSync(to, png);
    done++;
    console.log('  ok   ' + file + '  ' + img.w + '×' + img.h + ' → ' + res.w + '×' + res.h +
      '  抠掉 ' + (res.removed / res.total * 100).toFixed(1) + '%（羽化 ' + res.feather + ' px）' +
      '  ' + (png.length / 1048576).toFixed(2) + 'MB' +
      (o.dry ? '  --dry（没写文件）' : '  → ' + path.relative(ROOT, to).replace(/\\/g, '/')) +
      '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    if (o.map) {
      const mm = asciiMap(res, 54);
      console.log(mm.lines.map(function (l) { return '       ' + l; }).join('\n'));
      const t = mm.tally, pc = function (k) { return Math.round(t[k] / mm.total * 100) + '%'; };
      console.log('       （透明 ' + pc('.') + ' / 半透明 ' + pc('+') + ' / 残留白灰 ' + pc('w') +
        ' / 立绘 ' + pc('#') + '）');
    }
  } catch (e) {
    console.log('  FAIL ' + file + '：' + e.message);
  }
});

if (done && !o.dry) {
  console.log('\n  下一步：config.boot.art.left/right.src（两侧立绘）与 config.boot.mark.src' +
    '\n  （环里六边形内部的徽记）填 art/ 里的文件名（如 \'asuka_stand.png\' / \'nerv2.png\'），' +
    '\n  config.vehicle.gearArt.map 填挡位图（如 \'gear-a.png\'）；' +
    '\n  组件按名字从 src/assets/art/ 解析（src/core/artslot.js），换图只改这一行。\n');
}
