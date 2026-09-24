/*!
 * tools/_img.js — 临时比对工具：零依赖读/写 PNG + ASCII 色块图
 * ------------------------------------------------------------------
 * 只用来把 prototype/eva2.png 放大、转成文本，方便逐像素核对设计。
 * 不参与构建，也不被 npm scripts 引用；核对完可以删。
 *
 *   node tools/_img.js map  --in=prototype/eva2.png --x=202 --y=52 --w=288 --h=256 --step=4
 *   node tools/_img.js crop --in=prototype/eva2.png --x=96 --y=68 --w=60 --h=50 --z=16 --out=docs/_z_tl2.png
 *   node tools/_img.js edges --in=prototype/eva2.png --x=88 --y=60 --w=96 --h=62 --thr=60
 *
 * 图例：. 暗   o 中间调   R 红   Y 金/琥珀   W 白/银   P 紫   G 绿   C 青   B 蓝
 */
'use strict';

import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/* ------------------------------ 读 ------------------------------ */
export function readPng(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG：' + file);

  let off = 8, w = 0, h = 0, bd = 0, ct = 0, inter = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9]; inter = data[12];
    } else if (type === 'IDAT') { idat.push(data); }
    else if (type === 'IEND') { break; }
    off += 12 + len;
  }
  if (bd !== 8) throw new Error('只支持 8bit PNG，实际 ' + bd);
  if (inter) throw new Error('不支持隔行扫描 PNG');

  const ch = ct === 6 ? 4 : (ct === 2 ? 3 : (ct === 0 ? 1 : (ct === 4 ? 2 : null)));
  if (!ch) throw new Error('不支持的颜色类型 ' + ct);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { width: w, height: h, ch, data: out };
}

/* 取 RGB（返回 [r,g,b]） */
export function px(img, x, y) {
  const i = (y * img.width + x) * img.ch;
  if (img.ch === 1) return [img.data[i], img.data[i], img.data[i]];
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/* ------------------------------ 写 ------------------------------ */
const CRCT = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
export function writePng(file, w, h, rgb) {
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]));
}

/* ---------------------------- CLI ---------------------------- */
const argv = {};
process.argv.slice(2).forEach(function (a, i) {
  if (i === 0) { argv._ = a; return; }
  const m = /^--([a-z0-9]+)=(.*)$/i.exec(a);
  if (m) argv[m[1]] = m[2];
});
const num = (k, d) => (argv[k] === undefined ? d : Number(argv[k]));
const mode = argv._ || 'map';
const src = argv.in || 'prototype/eva2.png';

if (mode === 'runs') {
  /* 逐行列出「亮像素连续段」及其颜色分类，用来量元件的位置与宽度 */
  const img = readPng(src);
  const x0 = num('x', 0), y0 = num('y', 0);
  const w = num('w', img.width), h = num('h', 6), thr = num('thr', 80);
  const lines = [];
  for (let y = y0; y < Math.min(y0 + h, img.height); y++) {
    let runs = [], cur = null;
    for (let x = x0; x < Math.min(x0 + w, img.width); x++) {
      const [r, g, b] = px(img, x, y);
      const c = Math.max(r, g, b) > thr ? classify(r, g, b) : '';
      if (c) {
        if (cur && cur.c === c) { cur.to = x; cur.n++; }
        else { cur = { c: c, from: x, to: x, n: 1 }; runs.push(cur); }
      } else cur = null;
    }
    lines.push(String(y).padStart(4) + ' | ' + (runs.length
      ? runs.map(function (r2) { return r2.c + r2.from + '-' + r2.to + '(' + r2.n + ')'; }).join(' ')
      : '-'));
  }
  const out = 'docs/_r_' + (argv.name || 'runs') + '.txt';
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(out + '  y=' + y0 + ' h=' + h + ' thr=' + thr);

} else if (mode === 'map') {
  const img = readPng(src);
  const x0 = num('x', 0), y0 = num('y', 0);
  const w = num('w', 120), h = num('h', 60), step = num('step', 2);
  const lines = [];
  let ruler = '    |';
  for (let i = 0; i < w; i += step) ruler += ((x0 + i) % 10 === 0 ? '|' : ' ');
  lines.push(ruler);
  for (let y = y0; y < Math.min(y0 + h, img.height); y += step) {
    let line = '';
    for (let x = x0; x < Math.min(x0 + w, img.width); x += step) {
      line += classify(...px(img, x, y));
    }
    lines.push(String(y).padStart(4) + '|' + line);
  }
  const out = 'docs/_m_' + (argv.name || 'map') + '.txt';
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(out + '  ' + x0 + ',' + y0 + ' ' + w + 'x' + h + ' step ' + step);

} else if (mode === 'crop') {
  const img = readPng(src);
  const x0 = num('x', 0), y0 = num('y', 0);
  const w = num('w', 40), h = num('h', 40), z = num('z', 8);
  const out = 'docs/_z_' + (argv.name || 'crop') + '.png';
  const bw = w * z, bh = h * z;
  const buf = Buffer.alloc(bw * bh * 3);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const sx = Math.min(img.width - 1, x0 + Math.floor(x / z));
      const sy = Math.min(img.height - 1, y0 + Math.floor(y / z));
      const [r, g, b] = px(img, sx, sy);
      const i = (y * bw + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  }
  writePng(out, bw, bh, buf);
  console.log(out + '  ' + x0 + ',' + y0 + ' ' + w + 'x' + h + ' x' + z + ' -> ' + bw + 'x' + bh);

} else if (mode === 'edges') {
  const img = readPng(src);
  const x0 = num('x', 0), y0 = num('y', 0);
  const w = num('w', 120), h = num('h', 60), thr = num('thr', 60);
  const lines = [];
  for (let y = y0; y < Math.min(y0 + h, img.height); y++) {
    let lo = -1, hi = -1, count = 0, first = -1, last = -1;
    for (let x = x0; x < Math.min(x0 + w, img.width); x++) {
      const [r, g, b] = px(img, x, y);
      if (Math.max(r, g, b) > thr) {
        if (lo < 0) { lo = x; first = x; }
        hi = x; last = x; count++;
      }
    }
    if (count > 0) {
      lines.push(String(y).padStart(4) + ' | lo=' + String(lo).padStart(4) +
        ' hi=' + String(hi).padStart(4) + ' n=' + String(count).padStart(4) +
        ' | ' + '#'.repeat(Math.min(110, count)));
    }
  }
  const out = 'docs/_e_' + (argv.name || 'edges') + '.txt';
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(out + '  ' + lines.length + ' rows (first=' + (lines[0] || '') + ')');

} else {
  console.log('用法: node tools/_img.js map|crop|edges --in=... --x= --y= --w= --h= [--step=] [--z=] [--thr=] [--name=]');
}

export function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx < 38) return '.';
  if (mx - mn < 34) return mx >= 170 ? 'W' : 'o';
  if (r >= g && r >= b) {
    if (g >= r * 0.5 && b <= r * 0.5) return 'Y';
    if (b > g * 1.15) return 'P';
    return mx < 120 ? 'r' : 'R';
  }
  if (g >= r && g >= b) return b >= g * 0.7 ? 'C' : 'G';
  return r >= b * 0.5 ? 'P' : 'B';
}
