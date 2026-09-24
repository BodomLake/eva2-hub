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
 *   8. 立绘 / 徽记预留位：图名 → src/assets/art/，且必须带 alpha
 *   9. 组件引用契约：模板里的 <Foo> 必须在 <script setup> 里 import
 *  10. 应用页路由 / 换挡心跳 / 转场契约（router.js + CoreHex.vue + base.css）
 *  11. 功率量程、媒体页「一屏装下」、刷新回 home（第 11 轮）
 *  12. 10kW 量程 / 字母挡位键 / 方向键 / 氛围灯带六态 / 中央立绘不再消失（第 12 轮）
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

/* 中央六边形的挡位图（config.vehicle.gearArt，第 10 轮）：同一套「预留位」规则 ——
   名字要能在 art/ 里找到、必须带 alpha（忘了跑 npm run art 就是一块白板）。
   没配图的挡位（现在只剩驻车 P）是**正常**的：CoreHex.vue 会回落到原创徽记
   （fallbackEmblem），不会空一块。 */
const gearArt = (C.vehicle && C.vehicle.gearArt) || {};
if (gearArt.enabled === false) {
  ok('挡位图 gearArt.enabled=false：六边形里统一用原创徽记');
} else {
  const gmap = gearArt.map || {};
  const withArt = C.vehicle.gearOrder.filter((g) => gmap[g]);
  if (!withArt.length) {
    bad('config.vehicle.gearArt.map 是空的 → 六边形里永远不会出现挡位图',
      '按 npm run art 的产物名填，例如 A: \'gear-a.png\'');
  } else {
    withArt.forEach((g) => slotOf('挡位图 ' + g, gmap[g]));
  }
  const noArt = C.vehicle.gearOrder.filter((g) => !gmap[g]);
  if (noArt.length && gearArt.fallbackEmblem === false) {
    bad('gearArt.fallbackEmblem=false，但 ' + noArt.join(' / ') +
      ' 没有配图 → 这几种挡位的六边形里会是空的');
  } else if (noArt.length) {
    ok('没配挡位图的 ' + noArt.join(' / ') + ' 回落到原创徽记（fallbackEmblem）');
  }
}

/* 徽记的入场动画（@keyframes markIn）：「只动 transform」是个**必须静态盯住**的
   契约 —— 动画优先级高于行内样式，`to` 帧里只要写了 opacity，config 的
   `--mark-o` 就会被盖掉（第八轮踩过的坑）。from 帧仍可以写 .2 做淡入，
   因为 to 不写 opacity 就会落回 --mark-o（= config 的值）。 */
const bootVuePath = path.join(ROOT, 'src', 'components', 'BootOverlay.vue');
const bootVueSrc = fs.existsSync(bootVuePath) ? read(bootVuePath) : '';
const kfAt = bootVueSrc.search(/@keyframes\s+markIn\s*\{/);
if (!bootVueSrc) bad('读不到 src/components/BootOverlay.vue（徽记的入场动画在这里）');
else if (kfAt < 0) bad('找不到 @keyframes markIn（徽记的入场动画）');
else {
  let depth = 0, end = -1;
  const from = bootVueSrc.indexOf('{', kfAt);
  for (let j = from; j < bootVueSrc.length; j++) {
    if (bootVueSrc[j] === '{') depth++;
    else if (bootVueSrc[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  const body = bootVueSrc.slice(from + 1, end);
  const toFrame = /\bto\s*\{([^}]*)\}/.exec(body);
  if (!toFrame) bad('@keyframes markIn 里找不到 to 帧');
  else if (/opacity\s*:/.test(toFrame[1])) {
    bad('@keyframes markIn 的 to 帧写了 opacity → 会盖掉配置值 --mark-o',
      '不透明度只走 .b-mark 的 var(--mark-o)，入场动画只动 transform');
  } else ok('徽记入场动画的 to 帧不写 opacity（跑完落回 --mark-o = config 的值）');
}
/* 配置还得真的接到 CSS 变量上（否则 --mark-o 是个死的行内值） */
const markBlocks = [...bootVueSrc.matchAll(/\.b-mark\s*\{([^}]*)\}/g)].map((m) => m[1]);
if (markBlocks.some((b) => /opacity:\s*var\(--mark-o/.test(b))) {
  ok('徽记的不透明度走 var(--mark-o)（config.boot.mark.opacity → CSS 变量 → 观感）');
} else {
  bad('.b-mark 的 opacity 不是 var(--mark-o) → config 改不动徽记的浓淡');
}

/* ---------- 9. 组件引用契约 ---------- */
/* 模板里写了 <Foo> 却没在 <script setup> 里 import Foo → Vue 退化成运行期
   resolveComponent('Foo')：生产构建连警告都没有，整块内容静默渲染成空
   （第 9 轮就是这么挂的：五个应用页全都没 import AppPage.vue，出图只拍到仪表
   本体、冒烟又只断言 HUD 自己的结构 → 一路绿灯）。这个坑静态就能拦。 */
const VUE_BUILTIN = new Set(['Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'Component']);

vueFiles.forEach((f) => {
  const src = read(f);
  const tpl = (/<template>([\s\S]*)<\/template>/.exec(src) || [])[1] || '';
  const script = (/<script setup>([\s\S]*?)<\/script>/.exec(src) || [])[1] || '';

  /* script setup 里能被模板直接用的名字：默认导入 / 具名导入 / 解构 */
  const bound = new Set();
  for (const m of script.matchAll(/import\s+(?:([A-Za-z0-9_$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"][^'"]+['"]/g)) {
    if (m[1]) bound.add(m[1]);
    (m[2] || '').split(',').forEach((x) => {
      const n = x.split(/\s+as\s+/).pop().trim();
      if (n) bound.add(n);
    });
  }
  for (const m of script.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    m[1].split(',').forEach((x) => {
      const n = x.split(':').pop().trim();
      if (n) bound.add(n);
    });
  }

  /* 模板里的大写开头标签 = 组件（小写的是原生标签） */
  const wanted = new Set([...stripComments(tpl).matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]));
  const miss = [...wanted].filter((n) => !bound.has(n) && !VUE_BUILTIN.has(n));
  if (miss.length) {
    bad(rel(f) + ' 模板用到但没 import 的组件: ' + miss.join(', '),
      'Vue 会退化成运行期 resolveComponent() → 生产构建里静默渲染成空。\n补一行：' +
      "import " + miss[0] + " from './" + miss[0] + ".vue';");
  } else {
    ok('组件引用 ' + rel(f) + (wanted.size ? '（' + [...wanted].join(' / ') + '）' : '（无子组件）'));
  }
});

/* ---------- 10. 应用页路由 / 换挡心跳契约（第 10 轮） ---------- */
/* 页面组件是从 **src/router.js** 里 import 的（.js 文件不走上一条的 .vue 扫描），
   所以这里单独核对：rail 的每个 id 都要有路由，每条路由的组件都要真的 import 了
   （漏 import 就是运行期 resolveComponent → 整页静默渲染成空，第九轮那个坑）。 */
const routerPath = path.join(ROOT, 'src', 'router.js');
const routerSrc = fs.existsSync(routerPath) ? read(routerPath) : '';
if (!routerSrc) bad('找不到 src/router.js（五个应用页的路由表）');
else {
  const routeDefs = [...routerSrc.matchAll(/name:\s*'([a-z0-9_]+)'\s*,\s*component:\s*([A-Za-z0-9_$]+)/g)];
  const routeIds = routeDefs.map((m) => m[1]);
  const miss = C.rail.map((r) => r.id).filter((id) => routeIds.indexOf(id) < 0);
  if (miss.length) {
    bad('router.js 里没有这几条路由：' + miss.join(' / '),
      'config.rail = ' + C.rail.map((r) => r.id).join(' / '));
  } else {
    ok('router.js 给 config.rail 的 ' + C.rail.length + ' 个页面都建了路由（name = 页面 id）');
  }
  const imported = new Set([...routerSrc.matchAll(/import\s+([A-Za-z0-9_$]+)\s+from\s+['"]\.\/components\//g)]
    .map((m) => m[1]));
  /* 本文件里就地定义的组件（例如 HudHome = { render() {} }）不用 import */
  const localDefs = new Set([...routerSrc.matchAll(/(?:const|let|var|function)\s+([A-Za-z0-9_$]+)\s*[=(]/g)]
    .map((m) => m[1]));
  const unbound = routeDefs.map((m) => m[2])
    .filter((n) => !imported.has(n) && !localDefs.has(n));
  if (unbound.length) {
    bad('路由指向了没 import 的组件：' + unbound.join(' / '), '会静默渲染成空');
  } else {
    ok('每条路由的组件都在 router.js 里显式 import 了（' +
      routeDefs.map((m) => m[2]).join(' / ') + '）');
  }
  if (/KeepAlive/.test(read(path.join(ROOT, 'src', 'App.vue')))) {
    ok('App.vue 用 <KeepAlive> 缓存页面（切页 / 关页都不卸载）');
  } else {
    bad('App.vue 里没有 <KeepAlive> → 切页会把页面卸载掉（保活失效）');
  }
}

/* 换挡心跳 + 挡位图接线：第 10 轮把六边形里的图案换成挡位图时明确要求
   「切换挡位的动画效果要保留」。这里静态盯住 CoreHex.vue 的三件事：
   心跳动画还在、挂在 view.gear 变化上、图案真的从 config.vehicle.gearArt 解析。 */
const coreHexPath = path.join(ROOT, 'src', 'components', 'CoreHex.vue');
const coreHexSrc = fs.existsSync(coreHexPath) ? read(coreHexPath) : '';
if (!coreHexSrc) bad('读不到 src/components/CoreHex.vue（换挡心跳与挡位图在这里）');
else {
  if (/\.core\.is-beat\s*\{[^}]*animation:\s*coreBeat/.test(coreHexSrc) &&
      /@keyframes\s+coreBeat\s*\{/.test(coreHexSrc)) {
    ok('换挡心跳还在（.core.is-beat → @keyframes coreBeat）—— 换图没把动画弄丢');
  } else {
    bad('换挡心跳没了：CoreHex.vue 里找不到 .core.is-beat 的 coreBeat 动画',
      '换挡时六边形应该先缩一下再弹回（第 10 轮换挡位图时要求保留）');
  }
  if (/watch\(function\s*\(\)\s*\{\s*[\r\n ]*return\s+view\.gear/.test(coreHexSrc)) {
    ok('心跳挂在 view.gear 变化上（一换挡就播）');
  } else {
    bad('CoreHex.vue 里没有「watch view.gear → 播放心跳」的代码');
  }
  if (/resolveArt/.test(coreHexSrc) && /C\.vehicle\.gearArt/.test(coreHexSrc)) {
    ok('六边形里的图案读 config.vehicle.gearArt（按名字从 art/ 解析，core/artslot.js）');
  } else {
    bad('CoreHex.vue 没接 config.vehicle.gearArt / resolveArt → 挡位图不会生效');
  }
}

/* 转场契约：pageSw-* 必须写在**公共表**里 —— 这几个类名是 <Transition> 加在各页面
   组件根节点上的，写进 scoped 块会被改写成 .pageSw-xxx[data-v-…] → 打不中、没转场；
   而「不闪 home」靠的是 .pages 那层常驻实底（先前的毛病：.page 自己淡入，
   中途露出下面的仪表本体）。 */
const baseSrc = read(path.join(ROOT, 'src', 'styles', 'base.css'));
[
  [/\.pages\s*\{[^}]*background/, '.pages 有实底（页与页转场时透出来的是它，不是 home）'],
  [/\.pages\.is-off\s*\{[^}]*visibility:\s*hidden/, '.pages.is-off 整层藏起来（没开页面时不挡 HUD）'],
  [/\.pageSw-enter-active\s*,\s*\.pageSw-leave-active\s*\{[^}]*transition/, '.pageSw 转场带 transition'],
  [/\.pageSw-enter-from\s*\{[^}]*opacity:\s*0/, '.pageSw-enter-from 从透明 + 位移进入']
].forEach(([re, label]) => {
  if (re.test(baseSrc)) ok('应用页转场：' + label);
  else bad('应用页转场：' + label + ' —— base.css 里没找到对应规则');
});
const scopedPageSw = srcFiles.filter((f) => f.endsWith('.vue'))
  .filter((f) => /pageSw-(enter|leave)/.test(read(f)));
if (scopedPageSw.length) {
  bad('pageSw 转场类写进了组件的 scoped 块：' + scopedPageSw.map(rel).join(' / '),
    '类名加在别的组件根节点上，scoped 改写会打不中 → 必须留在 base.css');
} else {
  ok('pageSw 转场类只出现在公共表里（scoped 会让它打不中）');
}

/* ---------- 11. 第 11 轮：功率量程 / 媒体页一屏装下 / 刷新回 home ---------- */
/* 三件都是「不报错但明显不对」的毛病，静态这里各钉一条：
     ① 功率弧的 NaN + 弧永远画满 —— 根因是量程读错了配置键
        （CONFIG.vehicle.modes 不存在 → powerMax = 0 → 0/0 = NaN、x/0 = Infinity）
     ② 媒体页的操作条被挤到折叠线以下（画面盒按 16:9 定高 + 撞了 .stage 这个名字）
     ③ 地址栏留着 #/set 时按 F5 停在那页（车上重新上电应该在仪表本体） */
const gaugeSrc = read(path.join(ROOT, 'src', 'core', 'gauges.js'));
/* ⚠ 先剥掉注释再匹配：gauges.js 的说明里**会提到** CONFIG.vehicle.modes（讲这个坑），
   不能把「注释里提了一句」当成「代码里还在用」 */
const gaugeCode = gaugeSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
if (/CONFIG\.vehicle\.gears/.test(gaugeCode)) {
  ok('功率表量程读 CONFIG.vehicle.gears（挡位表就是量程的来源）');
} else {
  bad('gauges.js 没读 CONFIG.vehicle.gears → 量程可能算成 0（0/0 = NaN、x/0 = Infinity）');
}
if (/CONFIG\.vehicle\.modes/.test(gaugeCode)) {
  bad('gauges.js 又去读 CONFIG.vehicle.modes —— config 里没有这个键，量程会变成 0',
    '0W → NaN 弧（控制台 <path> d / <circle> cx 报 NaN）；有功率 → pct 恒为 1（弧永远画满）');
} else {
  ok('没再读那个不存在的 CONFIG.vehicle.modes');
}
let capMax = 0;
Object.keys(C.vehicle.gears || {}).forEach(function (k) {
  const cap = Number((C.vehicle.gears[k] || {}).powerCap);
  if (isFinite(cap) && cap > capMax) capMax = cap;
});
const powerScale = Math.ceil(capMax / 200) * 200;
if (powerScale === 10000) {
  ok('量程算得出来：各挡位 powerCap 最大值取整 = ' + powerScale + 'W（F 激烈模式 → 满量程 10kW）');
} else {
  bad('功率表量程异常：' + powerScale + 'W（期望 10000 —— 挡位表里最高的 powerCap 是 F 的 10000W）');
}
if (/if\s*\(!\(powerMax > 0\)\)\s*powerMax\s*=/.test(gaugeSrc) &&
    /num\(value, 0\)/.test(gaugeSrc) && /isFinite/.test(gaugeSrc)) {
  ok('功率弧两层兜底：量程为 0 时有默认值、进 SVG 的数字过 num()/isFinite（NaN 不再写进属性）');
} else {
  bad('gauges.js 少了 NaN / 零量程兜底（powerMax > 0 的兜底 或 num(value, 0) 或 isFinite）');
}

const appPageSrc = read(path.join(ROOT, 'src', 'components', 'AppPage.vue'));
const mediaSrc = read(path.join(ROOT, 'src', 'components', 'MediaPage.vue'));
if (/fit:\s*\{\s*type:\s*Boolean/.test(appPageSrc) && /'page--fit':\s*fit/.test(appPageSrc)) {
  ok('AppPage 有 fit 开关（页面外壳 → .page--fit：正文区不滚动，页内自己分高度）');
} else {
  bad('AppPage.vue 里找不到 fit 属性 / .page--fit 类（媒体页的「一屏装下」靠它）');
}
if (/\.page\.page--fit\s+\.page__body\s*\{[^}]*overflow:\s*hidden/.test(baseSrc)) {
  ok('base.css：.page--fit 的正文区 overflow: hidden（选择器压过 AppPage 里那条 scoped）');
} else {
  bad('base.css 里没有 .page.page--fit .page__body { overflow: hidden } → 正文区还会滚动');
}
if (/<AppPage[^>]*\sfit[\s>]/.test(mediaSrc)) {
  ok('媒体页用 <AppPage … fit> 打开「一屏装下」');
} else {
  bad('MediaPage.vue 的 <AppPage> 上没有 fit → 操作条又会被挤到折叠线以下');
}
if (/class="stage["\s]/.test(mediaSrc)) {
  bad('媒体页又用了 .stage 类名 —— base.css 里 .stage 是 HUD 缩放舞台（1300×760 + transform），' +
    '撞名会把画面盒撑成整块舞台，操作条被盖住');
} else {
  ok('媒体页的画面盒不叫 .stage（与 base.css 里 HUD 缩放舞台的类名不撞）');
}
if (/getEntriesByType\('navigation'\)/.test(routerSrc) && /type === 'reload'/.test(routerSrc)) {
  ok('router.js 用 Navigation Timing 的 type === \'reload\' 区分「刷新」和「新打开」');
} else {
  bad('router.js 里没有「刷新」判定（getEntriesByType(\'navigation\') / type === \'reload\'）');
}
const bootSrc = (routerSrc.match(/export function bootPath\(\)[\s\S]*?\n\}/) || [''])[0];
if (/!isReload\(\)/.test(bootSrc) && /return '\/';/.test(bootSrc)) {
  ok('bootPath：深链只在「不是刷新」时直达，其余（含刷新）一律归位到 /（地址栏 → …/#/）');
} else {
  bad('bootPath 的两个分支不齐（要么没接 !isReload()，要么没有归位到 / 的分支）',
    bootSrc.replace(/\n/g, ' ').slice(0, 160));
}
const smokeSrc = read(path.join(ROOT, 'tools', 'smoke.js'));
if (/reload:\s*400/.test(smokeSrc) && /\.g-dot/.test(smokeSrc) &&
    /#media-bar/.test(smokeSrc) && /\.playerwrap/.test(smokeSrc)) {
  ok('smoke.js 里有渲染断言：NaN 弧 / 操作条在可视区内 / 刷新回 home（静态契约有动态兜底）');
} else {
  bad('smoke.js 里少了第 11 轮那几条渲染断言（g-dot / #media-bar / reload: 400 / .playerwrap）');
}

/* ---------- 12. 第 12 轮：10kW / 挡位键 / 方向键 / 氛围灯带 / 中央立绘不再消失 ----------
 * 这一轮的每一条都是「界面看得见、但只有跑起来才知道对不对」的东西，
 * 静态这边盯的是**机制还在不在**（动态断言在 smoke.js 里，两边配套）：
 *   ① 功率上限 10kW：F 挡 powerCap = 10000（量程是从这里算出来的，别再写死）
 *   ② 挡位 = A/E/C/F 字母键（x1 / x2 暂停用；数字键那套已经删掉）
 *   ③ 方向键：← / → 转向（按住电平）、两个一起按 = 双闪；↑ / ↓ 加减速
 *   ④ 侧边氛围灯带：六种状态的颜色 / 闪烁必须在 base.css 里配齐
 *   ⑤ 换挡时中央立绘不许「空一拍」：不许再用 <Transition mode="out-in">
 *   ⑥ 右上角徽标第二行讲的是**挡位**，不是「双电 / ×2 模式」
 */
const inputSrc = read(path.join(ROOT, 'src', 'core', 'input.js'));
const stateSrc = read(path.join(ROOT, 'src', 'core', 'state.js'));
const topbarSrc = read(path.join(ROOT, 'src', 'components', 'TopBar.vue'));
const helpSrc = read(path.join(ROOT, 'src', 'components', 'HelpPanel.vue'));
const configSrc = read(path.join(ROOT, 'src', 'config.js'));

/* ① 10kW */
const gears = C.vehicle.gears || {};
if (gears.F && Number(gears.F.powerCap) === 10000) {
  ok('F 激烈模式 powerCap = 10000W（功率表满量程 10kW）');
} else {
  bad('F 挡 powerCap 不是 10000W（当前 ' + (gears.F && gears.F.powerCap) + '）→ 功率弧最多只画半圈');
}
if (gears.F && Number(gears.F.maxSpeed) > 100) {
  ok('F 挡 maxSpeed = ' + gears.F.maxSpeed + 'km/h（演示能破百）');
} else {
  bad('F 挡 maxSpeed ≤ 100 → 演示永远破不了百（当前 ' + (gears.F && gears.F.maxSpeed) + '）');
}
if (C.vehicle.gearOrder.join('') === 'AECF') {
  ok('挡位表 = A / E / C / F（X1 新国标、X2 新国飚暂停用）');
} else {
  bad('挡位表不对：' + C.vehicle.gearOrder.join(' / ') + '（本轮定的是 A / E / C / F）');
}

/* ②③ 键盘：字母挡位键 + 方向键（转向 / 加减速 / 双闪） */
if (/GEAR_KEYS\s*=\s*\{\s*a:\s*'A',\s*e:\s*'E',\s*c:\s*'C',\s*f:\s*'F',\s*p:\s*'P'\s*\}/.test(inputSrc)) {
  ok('键盘挡位键 = a/e/c/f（A/E/C/F）+ p（驻车）');
} else {
  bad('input.js 的 GEAR_KEYS 不是 a/e/c/f/p（数字键那套已经不用了）');
}
if (/'[1-6]'\s*:\s*'X[12]'/.test(inputSrc)) {
  bad('input.js 里还留着数字键 → X1 / X2 的映射（这两种挡位已暂停用）');
} else {
  ok('input.js 里没有残留的数字挡位键（1~6 → X1/X2）');
}
if (/const K_L = 'arrowleft'/.test(inputSrc) && /const K_R = 'arrowright'/.test(inputSrc) &&
    /const wantHaz = wantL && wantR/.test(inputSrc) && /cmd\.hazard = wantHaz/.test(inputSrc) &&
    /cmd\.turnL = wantHaz \? false : wantL/.test(inputSrc)) {
  ok('方向键：← / → 转向（电平），两个一起按 = 双闪（cmd.hazard）');
} else {
  bad('input.js 里没有「← / → 转向 + 两个一起按 = 双闪」的实现');
}
if (/keys\['arrowup'\]/.test(inputSrc) && /keys\['arrowdown'\]/.test(inputSrc)) {
  ok('↑ / ↓ 与 W / S 同源（加速 / 减速）');
} else {
  bad('input.js 没有把 ↑ / ↓ 接进油门');
}
if (/anyDown/.test(inputSrc)) {
  ok('按住不放的键也算「人工操作中」—— 长按加速不会被演示自动驾驶抢走');
} else {
  bad('input.js 少了对「还按着的键」的判断 → 长按 6 秒后控制权会被演示抢走');
}

/* ④ 氛围灯带：六种状态的颜色 / 闪烁 */
const STRIP_STATES = [
  ['is-fault', 'stripFlash', '故障 → 红色闪烁'],
  ['is-boost', 'stripFlash', '烧氮气 → 紫色闪烁'],
  ['is-accel', 'none', '加速 → 蓝色常亮'],
  ['is-brake', 'none', '减速 / 回收 → 绿色常亮'],
  ['is-park', 'stripBreath', '驻车 → 黄色'],
  ['is-idle', 'stripIdle', '静止 / 匀速 → 淡青']
];
STRIP_STATES.forEach(([cls, anim, label]) => {
  const rule = new RegExp('\\.strip\\.' + cls + '\\s*\\{([^}]*)\\}').exec(baseSrc);
  if (!rule) { bad('base.css 里没有 .strip.' + cls + '（' + label + '）'); return; }
  const body = rule[1];
  if (!/--sc:\s*#/.test(body)) { bad('.strip.' + cls + ' 没配主色 --sc（' + label + '）'); return; }
  if (anim === 'none') {
    if (/animation:\s*none/.test(body)) ok('灯带 ' + label);
    else bad('.strip.' + cls + ' 应该是常亮（animation: none）—— ' + label);
  } else if (new RegExp('animation:\\s*' + anim).test(body)) {
    ok('灯带 ' + label);
  } else {
    bad('.strip.' + cls + ' 的动画不是 ' + anim + '（' + label + '）');
  }
});
/* 六种状态各要有各的颜色（只写一套的话六种状态全一个色） */
const stripColors = new Set(
  (baseSrc.match(/\.strip\.is-[a-z]+\s*\{[^}]*--sc:\s*#[0-9a-f]{3,8}/gi) || [])
    .map((s) => (/--sc:\s*(#[0-9a-f]{3,8})/i.exec(s) || [])[1])
);
if (stripColors.size >= 6) {
  ok('六种灯带状态各有各的颜色（' + stripColors.size + ' 种）');
} else {
  bad('灯带颜色只有 ' + stripColors.size + ' 种（六种状态应该六个色）');
}
if (/\.strip\.is-boost/.test(baseSrc) && /\.strip\.is-fault/.test(baseSrc) &&
    /prefers-reduced-motion[\s\S]*?\.strip\.is-fault/.test(baseSrc)) {
  ok('「减少动效」环境下闪烁会被关掉（is-boost / is-fault 也在规则里）');
} else {
  bad('prefers-reduced-motion 里没把 .strip.is-boost / .strip.is-fault 的动画关掉' +
    '（优先级比 .strip 高，只写 .strip 压不住）');
}

/* 灯带状态机的优先级（判定在 state.js，顺序不能乱） */
const stripFn = (stateSrc.match(/function stripMode\(v\)[\s\S]*?\n  \}/) || [''])[0];
const stripOrder = [...stripFn.matchAll(/return '([a-z]+)'/g)].map((m) => m[1]).join('>');
if (stripOrder === 'fault>boost>accel>brake>park>idle') {
  ok('stripMode 优先级 = 故障 > 氮气 > 加速 > 减速 > 驻车 > 静止');
} else {
  bad('stripMode 的优先级不对：' + stripOrder + '（应为 fault>boost>accel>brake>park>idle）');
}
if (/C\.strip\.burnRatio/.test(stateSrc)) {
  ok('「在烧氮气」的阈值只有一份（config.strip.burnRatio：灯带变紫与氮气条掉同一个判据）');
} else {
  bad('state.js 的 burnRatio 没有从 config.strip 读（会和氮气条各写一份判据）');
}

/* ⑤ 中央立绘：不许再出现「换挡空一拍」 */
/* ⚠ 两处注释都要剥掉：CoreHex.vue 的 JS 块注释里写着「以前用 <Transition mode="out-in">」
   （讲这个坑），HTML 注释里也可能提 —— 不能把「注释里提了一句」当成「代码里还在用」 */
const coreHexTpl = stripComments(coreHexSrc).replace(/\/\*[\s\S]*?\*\//g, ' ');
if (!/<Transition/.test(coreHexTpl)) {
  ok('CoreHex.vue 不再用 <Transition> 叠换挡图（mode="out-in" 连按换挡会空一拍）');
} else {
  bad('CoreHex.vue 里又有 <Transition> 了 —— 连按换挡时中央会有一段时间没有图' +
    '（用户反馈的那个 bug 就是这么来的）');
}
if (/core__layer--out/.test(coreHexSrc) && /gearFadeOut/.test(coreHexSrc) &&
    /prevTimer/.test(coreHexSrc)) {
  ok('换挡交叉淡入 = 两层图层：当前层常显 + 旧层淡出（由定时器摘掉，不等 transitionend）');
} else {
  bad('CoreHex.vue 少了图层结构（.core__layer--out / gearFadeOut / prevTimer）');
}
if (/new Image\(\)/.test(coreHexSrc) && /onMounted/.test(coreHexSrc)) {
  ok('挂载时把四张挡位图预解码一遍（大图没解完时换过去会「透明」一段）');
} else {
  bad('CoreHex.vue 没有预解码挡位图（new Image()）→ 首次换到某挡可能白一下');
}
/* 当前层（第一个 .core__layer）不许带「把自己变透明」的动画：那正是空一拍的成因 */
const layerRule = (/\.core__layer\s*\{([^}]*)\}/.exec(coreHexSrc) || ['', ''])[1];
if (/animation/.test(layerRule)) {
  bad('.core__layer 上挂了动画（当前层必须无动画常显，否则换挡瞬间可能是透明的）');
} else {
  ok('.core__layer 当前层没有动画 / 过渡 —— 换挡瞬间就是可见的');
}
if (/id="v-gear-veil"/.test(coreHexSrc) && /gearArt \|\| \{\}\)\.veil/.test(coreHexSrc)) {
  ok('挡位图上的暗幕按 config.vehicle.gearArt.veil 真的画出来了（#v-gear-veil）');
} else {
  bad('CoreHex.vue 没画 #v-gear-veil → config.vehicle.gearArt.veil 是一句空配置' +
    '（smoke 会因此打 warn）');
}

/* ⑥ 右上角徽标第二行 = 挡位代号 */
if (/id="v-gear-code"/.test(topbarSrc) && /view\.gearShort/.test(topbarSrc)) {
  ok('右上角徽标第二行 = 当前挡位代号（view.gearShort），不是「×2 / 双电模式」');
} else {
  bad('TopBar.vue 的第二行没有显示挡位代号（#v-gear-code ← view.gearShort）');
}
if (/dualMode/.test(configSrc.replace(/\/\*[\s\S]*?\*\//g, ' '))) {
  bad('config.brand.dualMode 又回来了 —— 那块地方要显示的是挡位，不是双电 / 三电模式');
} else {
  ok('config 里没有 dualMode（「×2 模式」这个误解已经清掉）');
}

/* 帮助浮层必须写的是**现在**的按键 */
if (/arrowleft|←/.test(helpSrc) && /A<\/kbd><kbd>E/.test(helpSrc)) {
  ok('帮助浮层写的是新按键（← / → 转向 + A/E/C/F 挡位键）');
} else {
  bad('HelpPanel.vue 还是旧按键说明（没有 ← / → 或 A/E/C/F）');
}
if (/1<\/kbd>~<kbd>6|X1|X2/.test(helpSrc)) {
  bad('HelpPanel.vue 里还写着数字挡位键 / X1 / X2（这些已经不用了）');
} else {
  ok('帮助浮层里没有已停用的按键（1~6 / X1 / X2）');
}

if (/gearburst=12/.test(smokeSrc) && /view\.strip/.test(smokeSrc) &&
    /\.core__layer/.test(smokeSrc) && /__gearburst/.test(smokeSrc)) {
  ok('smoke.js 里有对应的动态断言：跨帧连按换挡后中央还有图、六种灯带状态');
} else {
  bad('smoke.js 里少了第 12 轮的渲染断言（gearburst / .core__layer / view.strip）');
}

/* ---------- 汇总 ---------- */
console.log('\n------------------------------------------------');
if (fails.length) {
  console.log('  ' + count + ' 项通过, ' + fails.length + ' 项失败');
  console.log('------------------------------------------------\n');
  process.exit(1);
}
console.log('  全部 ' + count + ' 项检查通过 ✓');
console.log('------------------------------------------------\n');
