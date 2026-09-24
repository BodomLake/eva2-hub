/*!
 * artslot.js — 开机自检页的立绘「预留位」：把配置里的图名解析成能用的 URL
 * ------------------------------------------------------------------
 *   用法：把图丢进 src/assets/art/，然后在 config.js 里写文件名：
 *
 *     boot.art.left.src  = 'asuka_stand.png'   → src/assets/art/asuka_stand.png
 *     boot.art.right.src = 'eva-02-right'      → 不带扩展名也行（按主名匹配）
 *     boot.art.left.src  = './art/unit02.png'  → 路径样式：原样透传（放 public/）
 *     boot.art.left.src  = 'https://…/a.png'   → 协议样式：原样透传（挂 CDN）
 *     boot.art.left.src  = ''                  → 这一侧不显示（空着 = 真·预留位）
 *
 * 为什么用 import.meta.glob 而不是拼字符串路径：Vite 只认「静态可见」的资源
 * 引用，运行时拼出来的路径不会被构建进去（构建后就是 404）。glob 是**构建期**
 * 展开成 { '源路径': '带哈希的 URL' } 的映射，于是：
 *   · 图片被复制进 dist/assets/ 并带内容哈希（换图 = 换 URL，不会撞缓存）；
 *   · 目录里没人引用的图不会进 dist（谁引用谁进包）；
 *   · 名字写错了拿到空串 → 这一侧安静地不显示（background-image 天然没有
 *     碎图标，也不需要 onerror 兜底），控制台会给一条 warn 提示。
 *
 * 白底图先过一遍 tools/cutout.js（npm run art）抠成透明底再丢进 art/，
 * 否则黑底 HUD 上会出现两块白板。
 * 现在有两个用途：BootOverlay.vue 的**两侧立绘**（config.boot.art.left/right）
 * 和**环里六边形内部的徽记**（config.boot.mark）。
 */
'use strict';

/* 构建期展开：src/assets/art/ 下的所有图片 → { '原路径': '构建后的 URL' } */
const FILES = import.meta.glob('../assets/art/*.{png,webp,avif,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default'
});

const baseOf = (p) => String(p).replace(/^.*[\\/]/, '');
const stemOf = (p) => baseOf(p).replace(/\.[^.]+$/, '').toLowerCase();

/* '名字' / '名字.png' / 'art/名字.png' → art/ 里那张图的 URL；找不到返回 '' */
export function resolveArt(src) {
  const s = String(src == null ? '' : src).trim();
  if (!s) return '';
  /* 路径 / URL 样式：交给浏览器自己找（public/ 或远端），不掺和构建 */
  if (/^(https?:|data:|blob:|\/|\.\/|\.\.\/)/i.test(s)) return s;
  const want = stemOf(s);
  for (const k in FILES) {
    if (stemOf(k) === want) return FILES[k];
  }
  return '';
}

/* 预留位里现在有哪些图（控制台提示 / 自检用） */
export function artNames() {
  return Object.keys(FILES).map(baseOf).sort();
}
