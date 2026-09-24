/*!
 * tools/check.js — 静态自检（零依赖）
 * ------------------------------------------------------------------
 *   npm run check   /   node tools/check.js
 *
 * 检查内容：
 *   1. src/**\/*.js、tools/*.js、vite.config.js 的语法（node --check）
 *   2. 每个 .vue 的结构与 <script setup> 语法（提取后单独 --check）
 *   3. index.html / main.js 引用的资源是否存在
 *   4. 图标契约：模板里用到的 #i-名称 必须都已定义，且没有定义了没用上的
 *   5. DOM id 契约：id 在模板里唯一，且 tools/smoke.js 里引用的 id 都存在
 *   6. 旧结构残留：js/、css/、server.js 不应再存在，src 里不应再出现 EVA. 全局
 *   7. CSS 变量契约：var(--x) 必须有定义（防止改名漏改）
 */
'use strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { CONFIG as C } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
let count = 0;

function ok(msg) { count++; console.log('  ok   ' + msg); }
function bad(msg, detail) {
  fails.push(msg);
  console.log('  FAIL ' + msg + (detail ? '\n       ' + String(detail).trim().split('\n').join('\n       ') : ''));
}
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const read = (f) => fs.readFileSync(f, 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else out.push(f);
  }
  return out;
}

console.log('\nEVA-02 HUD · self check（Vue 3 + Vite）\n');

/* ---------- 1. JS 语法 ---------- */
const srcFiles = walk(path.join(ROOT, 'src'));
const toolFiles = walk(path.join(ROOT, 'tools'));
const jsFiles = srcFiles.concat(toolFiles)
  .filter((f) => f.endsWith('.js') && !/node-check\.js$/.test(f));   // 闸门脚本单独在最后跑
if (!jsFiles.length) bad('没有找到任何 .js 文件');

jsFiles.forEach((f) => {
  const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) bad('语法错误 ' + rel(f), r.stderr);
  else ok('语法 ' + rel(f));
});

/* ---------- 2. .vue 结构 + script setup 语法 ---------- */
const vueFiles = srcFiles.filter((f) => f.endsWith('.vue'));
if (!vueFiles.length) bad('src/ 下没有找到 .vue 组件');

let vmCheck = 0;
vueFiles.forEach((f) => {
  const src = read(f);
  const name = rel(f);
  const need = ['<template>', '</template>'];
  const miss = need.filter((t) => src.indexOf(t) < 0);
  if (miss.length) { bad(name + ' 缺少 ' + miss.join(' / ')); return; }

  const m = /<script setup>([\s\S]*?)<\/script>/.exec(src);
  if (!m) { bad(name + ' 缺少 <script setup>'); return; }

  /* 把 <script setup> 抽出来单独做语法检查（Vue 的编译器宏在语法上是合法标识符） */
  const tmp = path.join(os.tmpdir(), 'evacheck-' + (vmCheck++) + '.mjs');
  fs.writeFileSync(tmp, m[1], 'utf8');
  const r = cp.spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  try { fs.rmSync(tmp, { force: true }); } catch (e) { /* 忽略 */ }
  if (r.status !== 0) bad('组件脚本语法错误 ' + name, r.stderr);
  else ok('组件 ' + name);
});

/* ---------- 3. 资源引用 ---------- */
const html = read(path.join(ROOT, 'index.html'));
const mainJs = read(path.join(ROOT, 'src/main.js'));

if (html.indexOf('/src/main.js') >= 0 && exists('src/main.js')) ok('index.html → /src/main.js');
else bad('index.html 没有引用 /src/main.js');

const cssRefs = [...mainJs.matchAll(/import\s+'([^']+\.css)'/g)].map((m) => m[1]);
if (!cssRefs.length) bad('src/main.js 没有引入任何样式');
cssRefs.forEach((u) => {
  const p = path.join(ROOT, 'src', u.replace(/^\.\//, ''));
  if (fs.existsSync(p)) ok('样式存在 src/' + u.replace(/^\.\//, ''));
  else bad('样式缺失 src/main.js -> ' + u);
});

/* ---------- 4. 图标契约 ---------- */
const iconsPath = path.join(ROOT, 'src', 'core', 'icons.js');
const iconsSrc = fs.existsSync(iconsPath) ? read(iconsPath) : '';
const defined = new Set([...iconsSrc.matchAll(/<symbol[^>]*id="([^"]+)"/g)].map((m) => m[1]));
if (!defined.size) bad('src/core/icons.js 里没有找到任何 <symbol id="i-名称">');

const used = new Map();
srcFiles.concat(toolFiles).forEach((f) => {
  if (f === iconsPath || !/\.(js|vue|css)$/.test(f)) return;
  const src = read(f);
  for (const m of src.matchAll(/\bi-[a-z0-9]+(?:-[a-z0-9]+)*\b/g)) {
    if (!used.has(m[0])) used.set(m[0], rel(f));
  }
});

used.forEach((file, id) => {
  if (defined.has(id)) ok('图标 #' + id);
  else bad('图标未定义 src/core/icons.js -> #' + id + '（' + file + '）');
});
defined.forEach((id) => {
  if (!used.has(id)) bad('图标定义了但没人用 -> #' + id);
});

/* ---------- 5. DOM id 契约 ---------- */
/* 只认「真的会渲染」的 id：先去掉 HTML 注释，避免把 <!-- … --> 里的 id 也算进来 */
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const ids = new Map();
const dup = [];
vueFiles.forEach((f) => {
  const src = stripComments(read(f));
  for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
    if (ids.has(m[1])) dup.push(m[1] + '（' + ids.get(m[1]) + ' / ' + rel(f) + '）');
    else ids.set(m[1], rel(f));
  }
});
if (dup.length) bad('.vue 模板存在重复 id: ' + dup.join(', '));
else ok('模板 id 唯一（' + ids.size + ' 个）');

/* tools/smoke.js 里读的 id 必须存在（DOM 契约） */
const smokePath = path.join(ROOT, 'tools', 'smoke.js');
if (fs.existsSync(smokePath)) {
  const smokeSrc = read(smokePath);
  const refIds = new Set();
  for (const m of smokeSrc.matchAll(/(?:textOf|styleWidthOf|getElementById)\(\s*'([^']+)'/g)) refIds.add(m[1]);
  refIds.forEach((id) => {
    if (ids.has(id)) ok('id #' + id + '（被 tools/smoke.js 引用）');
    else bad('tools/smoke.js 引用了不存在的 id -> #' + id);
  });
}

/* ---------- 6. 旧结构残留 ---------- */
[['js', '原生脚本目录'], ['css', '原生样式目录'], ['server.js', '零依赖静态服务器']].forEach((pair) => {
  if (exists(pair[0])) bad('旧结构仍在：' + pair[0] + '/（' + pair[1] + '）应已迁移到 src/');
  else ok('旧结构已清理 ' + pair[0]);
});

const legacy = [];
srcFiles.forEach((f) => {
  if (!f.endsWith('.js')) return;
  const src = read(f);
  if (/EVA\.(CONFIG|Vehicle|Hud|Boot|Input|Gauges|Emblem|icons)/.test(src)) legacy.push(rel(f));
});
if (legacy.length) bad('仍有旧的 EVA.* 全局引用（未完成 ESM 化）: ' + legacy.join(', '));
else ok('src/ 里没有残留的 EVA.* 全局引用');

/* ---------- 7. CSS 变量契约 ---------- */
/* 组件样式现在写在各自的 <style scoped> 里 → 这里要把带属性的 style 标签也读进来 */
const cssFiles = srcFiles.filter((f) => f.endsWith('.css'));
const styleBlocks = (src) => {
  const out = [];
  for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) out.push(m[1]);
  return out.join('\n');
};
const cssText = cssFiles.map(read).join('\n') +
  vueFiles.map((f) => styleBlocks(read(f))).join('\n');

const declaredVars = new Set([...cssText.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
/* 运行期才会写进去的变量：
   --seg      gauges.js 用 el.style.setProperty('--seg', …) 注入
   --boot-rows  BootOverlay.vue 用行内 :style="{ '--boot-rows': … }" 注入 → 下面从模板里自动收集 */
const runtimeVars = new Set(['seg']);
vueFiles.forEach((f) => {
  for (const m of read(f).matchAll(/'--([a-z0-9-]+)'\s*:/g)) runtimeVars.add(m[1]);
});
const usedVars = new Set([...cssText.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1]));
const missing = [...usedVars].filter((v) => !declaredVars.has(v) && !runtimeVars.has(v));
if (missing.length) bad('CSS 变量未定义: ' + missing.map((v) => '--' + v).join(', '));
else ok('CSS 变量全部有定义（' + usedVars.size + ' 个被引用）');

/* ---------- 8. 立绘 / 徽记预留位（config.boot.art / config.boot.mark） ---------- */
/* 图名写错时运行期只是「这一处安静地不显示」，很难注意到 → 在这里按 artslot.js
   的规则把「名字 → 文件」提前对一遍；顺便拦一下「忘了抠白底」：art/ 里的图
   必须带 alpha（PNG 的 IHDR colorType 6），否则黑底 HUD 上会是一块白板。 */
const artCfg = (C.boot && C.boot.art) || {};
const markCfg = (C.boot && C.boot.mark) || {};
const artDir = path.join(ROOT, 'src', 'assets', 'art');
const artFiles = fs.existsSync(artDir) ? fs.readdirSync(artDir) : [];
const stemOf = (s) => path.basename(String(s)).replace(/\.[^.]+$/, '').toLowerCase();

/* 一处「预留位」：留空 → 不显示；文件名 → art/ 里找同名图；路径 / URL → 放行 */
function slotOf(label, src) {
  const s = String(src || '').trim();
  if (!s) { ok(label + '：留空（这里不显示）'); return; }
  if (/^(https?:|data:|blob:|\/|\.\/|\.\.\/)/i.test(s)) {
    ok(label + '：外部路径 ' + s + '（交给浏览器，构建不掺和）');
    return;
  }
  const hit = artFiles.find((f) => stemOf(f) === stemOf(s));
  if (!hit) {
    bad(label + ' 找不到图 src/assets/art/' + s,
      'art/ 里现有：' + (artFiles.join(' / ') || '（空）'));
    return;
  }
  const buf = fs.readFileSync(path.join(artDir, hit));
  const isPng = buf.length > 25 && buf.toString('latin1', 12, 16) === 'IHDR';
  if (isPng && buf[25] !== 6) {
    bad(label + ' 的 ' + hit + ' 不带 alpha（PNG colorType=' + buf[25] + '）→ 白底会变成白板',
      '先跑 npm run art（tools/cutout.js）把它抠成透明底再放进 art/');
  } else {
    ok(label + ' → src/assets/art/' + hit +
      (isPng ? '（RGBA ' + buf.readUInt32BE(16) + '×' + buf.readUInt32BE(20) + '）' : ''));
  }
}

slotOf('立绘预留位 left', artCfg.left && artCfg.left.src);
slotOf('立绘预留位 right', artCfg.right && artCfg.right.src);
slotOf('环里徽记（六边形内部）', markCfg.src);

/* ---------- 汇总 ---------- */
console.log('\n------------------------------------------------');
if (fails.length) {
  console.log('  ' + count + ' 项通过, ' + fails.length + ' 项失败');
  console.log('------------------------------------------------\n');
  process.exit(1);
}
console.log('  全部 ' + count + ' 项检查通过 ✓');
console.log('------------------------------------------------\n');
