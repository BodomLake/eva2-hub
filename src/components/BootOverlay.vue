<script setup>
/*!
 * BootOverlay.vue — 开机自检动画
 * ------------------------------------------------------------------
 * AT 力场环 → 两进制自检日志逐行写入 → 进度条走满 → 红闪 + 整屏向上擦除。
 *
 * 「等多久才进入主界面」（= 这一页停留多久）全部来自 config.boot：
 *   · minMs     写满进度条后**继续停在 100% 等满**这段时间（默认 3000 = 3s）
 *               到点才红闪擦除 → 想停久一点就调大它；
 *   · waitEnter true = 写满后**不自动进入**，停在「按任意键进入」等人操作；
 *   · holdMs    兜底上限（waitEnter = true 时不生效）。
 * 也能用地址栏临时覆盖：?boot=5000（毫秒）/ ?boot=wait（等按键）/ ?boot=0。
 *
 * 任意键 / 点击可随时跳过；另有 window.onerror 兜底，
 * 保证仪表永远不会卡在开机画面上。
 *
 * 两侧立绘（config.boot.art）：左 = 驾驶员 / 右 = 机体，从屏幕外「划入」。
 * 它是**预留位**：图放 src/assets/art/，config 里写文件名（core/artslot.js 解析）；
 * 名字空着 / 文件不在 → 这一侧安静地不显示（background-image 没有碎图标这回事）。
 * 立绘是绝对定位的子层（z-index 0），层级排成
 * 「立绘 0 < 能量线 1 < 压暗层 2 < 文字 3」，擦除时跟着 .is-done 的 clip-path 一起走。
 *
 * AT 力场环里那个六边形内部还挂着一枚徽记（config.boot.mark，默认 NERV）：
 * 它是环 SVG 里的一个 <image>，被 #boot-mark-clip 裁进六边形 → 只在六边形里可见，
 * 描边画在它之上；名字空着 / 文件不在同样安静地不画（?mark=off 关掉）。
 *
 * 结束时 emit('done') → App.vue 启动主循环，并在 1s 后卸载本组件
 * （留出擦除动画的时间）。
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { CONFIG as C } from '../config.js';
import { resolveArt, artNames } from '../core/artslot.js';

const emit = defineEmits(['done']);

const lines = ref([]);
const progress = ref(0.04);
const armed = ref(false);
const flash = ref(false);
const finished = ref(false);

/* 「等待进入主界面」的三个状态：holding = 写满后正在停留；waiting = 等按键；
   countdown = 还要几秒（停留期间显示在提示行上） */
const holding = ref(false);
const waiting = ref(false);
const countdown = ref(0);

/* 停留参数：config.boot 为准，地址栏 ?boot= 可临时覆盖（出图 / 演示用） */
function bootTiming() {
  const t = { minMs: C.boot.minMs, waitEnter: !!C.boot.waitEnter, holdMs: C.boot.holdMs };
  const m = /[?&]boot=([^&]*)/.exec((window.location && window.location.search) || '');
  if (!m) return t;
  const raw = decodeURIComponent(m[1]).trim().toLowerCase();
  if (raw === 'wait' || raw === 'enter') t.waitEnter = true;
  else if (raw === '0' || raw === 'off' || raw === 'skip') { t.minMs = 0; t.waitEnter = false; }
  else {
    const n = parseFloat(raw);
    if (isFinite(n) && n >= 0) t.minMs = n;
  }
  return t;
}
const BOOT = bootTiming();

/* ------------------------------------------------------------------
 * 两侧立绘（config.boot.art）：左 = 驾驶员 / 右 = 机体，会从屏幕外「划入」。
 * 图从 src/assets/art/ 里按文件名解析（core/artslot.js）：
 *   · src 填了名字 → 用那张图；名字写错 / 文件不在 → 这一侧不显示（安静降级）；
 *   · src 留空 → 这一侧压根不渲染（空着就是「预留位」本来的样子）。
 * flip = true 时水平镜像（图朝向屏幕外侧时用得上）。
 * 地址栏临时开关：?art=off / ?art=1。
 * ⚠ 立绘是绝对定位的独立层，**绝不参与 .boot 的 flex 排流** —— 一旦被
 *   通配选择器压成 static 掉进文档流，就会把自检日志和进度条顶开
 *   （第六轮「通配压掉子元素 position」那个坑的镜像版本，smoke 有断言盯着）。
 * ------------------------------------------------------------------ */
function artSide(side) {
  const a = C.boot.art[side] || {};
  return {
    src: a.src || '',
    img: resolveArt(a.src),
    w: a.w || 440,
    opacity: a.opacity == null ? 0.85 : a.opacity,
    blend: a.blend || 'normal',
    tag: a.tag || '',
    flip: a.flip ? -1 : 1
  };
}

function artCfg() {
  const a = C.boot.art || {};
  const m = /[?&]art=([^&]*)/.exec((window.location && window.location.search) || '');
  const raw = m ? decodeURIComponent(m[1]).trim().toLowerCase() : '';
  const on = (raw === 'off' || raw === '0') ? false : (raw ? true : !!a.enabled);
  const left = artSide('left');
  const right = artSide('right');
  if (on) {
    /* 名字写错时给一条人话提示（这一侧就不显示了）——找图最耗时间的就是这种拼写 */
    [['left', left], ['right', right]].forEach(function (pair) {
      if (pair[1].src && !pair[1].img) {
        console.warn('[boot.art] ' + pair[0] + ' 的图没找到：' + pair[1].src +
          '　art/ 里现在有：' + (artNames().join(' / ') || '（空）'));
      }
    });
  }
  return {
    on: on && !!(left.img || right.img),      // 一张图都没有 = 两侧都不渲染
    left: left,
    right: right,
    slideMs: a.slideMs || 900,
    scrim: a.scrim == null ? 0.55 : a.scrim
  };
}
const ART = artCfg();

/* ------------------------------------------------------------------
 * 环里六边形内部的徽记（config.boot.mark）—— 和上面两侧立绘同一套「预留位」。
 * 它被 <clipPath> 裁进那个六边形，所以只可能在六边形里出现：
 *   · src 填了名字 → 用那张图；名字写错 / 文件不在 → 六边形里什么都不画；
 *   · src 留空 → 六边形里什么都不画（预留位本来的样子，不报错也不留空框）。
 * 几何：先按六边形的包围盒定框（x/y/宽高），再交给 preserveAspectRatio：
 *   fit 'cover'   = slice（铺满六边形，溢出裁掉）/ 'contain' = meet（整体缩进）。
 * ⚠ 不透明度不要写进 animation 的 keyframes（`to { opacity: 1 }` 会盖掉行内值，
 *   因为动画优先级高于行内样式）—— 所以走 --mark-o，动画只动 transform。
 * 地址栏临时开关：?mark=off / ?mark=1。
 * ------------------------------------------------------------------ */
const HEX_R = 76;             /* 六边形外接半径（左右两个尖点） */
const HEX_FLAT = 0.936;       /* 平顶系数：平顶边到中心的距离 = r × 0.936 */
const HEX_BOX = {             /* 六边形的包围盒 —— 徽记按它定框 */
  x: 120 - HEX_R, y: 120 - HEX_R * HEX_FLAT,
  w: HEX_R * 2, h: HEX_R * HEX_FLAT * 2
};

function markCfg() {
  const m = C.boot.mark || {};
  const q = /[?&]mark=([^&]*)/.exec((window.location && window.location.search) || '');
  const raw = q ? decodeURIComponent(q[1]).trim().toLowerCase() : '';
  const on = (raw === 'off' || raw === '0') ? false : (raw ? true : m.enabled !== false);
  const src = m.src || '';
  const img = on ? resolveArt(src) : '';
  if (on && src && !img) {
    console.warn('[boot.mark] 徽记的图没找到：' + src + '（art/ 里现有：' +
      (artNames().join(' / ') || '（空）') + '）');
  }
  const s = m.scale == null ? 1 : m.scale;   /* 1 = 正好贴住六边形包围盒 */
  return {
    src: src,
    img: img,
    box: { x: 120 - HEX_R * s, y: 120 - HEX_R * HEX_FLAT * s, w: HEX_BOX.w * s, h: HEX_BOX.h * s },
    par: (m.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'),
    style: {
      '--mark-o': String(m.opacity == null ? .92 : m.opacity),
      mixBlendMode: m.blend || 'normal'
    }
  };
}
const MARK = markCfg();

/* 尺寸 / 透明度 / 混合模式 / 入场时长 / 镜像 → 行内 CSS 变量（样式在 <style> 里） */
function artStyle(side) {
  const a = ART[side];
  return {
    '--art-w': a.w + 'px',
    '--art-o': String(a.opacity),
    '--art-blend': a.blend,
    '--art-flip': String(a.flip),
    '--art-ms': (ART.slideMs / 1000) + 's',
    '--art-delay': (side === 'right' ? 60 : 0) + 'ms'
  };
}

/* 立绘本体 = 一张 background-image（contain + bottom center，落在 <style> 里） */
function artBg(side) {
  return { backgroundImage: 'url("' + ART[side].img + '")' };
}

const logEl = ref(null);          // 自检日志的滚动容器
const logScroll = ref(false);     // 内容是否超出框（超出才加底部淡出）

/* 每次写入新行后：判断有没有溢出，并把视口跟到最新一行（滚动的关键一行） */
function syncLog() {
  nextTick(function () {
    const el = logEl.value;
    if (!el) return;
    logScroll.value = el.scrollHeight > el.clientHeight + 1;
    el.scrollTop = el.scrollHeight;
  });
}

let timers = [];
let done = false;

/* 环形刻度用的平顶六边形顶点（与中央核心同一套角度：上下两条边水平） */
function hexPoints(cx, cy, r) {
  const h = r * HEX_FLAT;
  const w = r;
  return [
    [cx - w, cy], [cx - w * 0.5, cy - h], [cx + w * 0.5, cy - h],
    [cx + w, cy], [cx + w * 0.5, cy + h], [cx - w * 0.5, cy + h]
  ].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
}
const hexPts = hexPoints(120, 120, HEX_R);

function clearTimers() {
  for (let i = 0; i < timers.length; i++) clearTimeout(timers[i]);
  timers = [];
}

/* quick = 被跳过：没写出来的行一次性补齐，看起来像被快进 */
function finish(quick) {
  if (done) return;
  done = true;
  clearTimers();
  if (quick) {
    lines.value = C.boot.lines.slice();
    progress.value = 1;
    syncLog();
  }
  flash.value = true;
  timers.push(setTimeout(function () {
    finished.value = true;
    emit('done');
  }, 240));
}

function skip() { finish(true); }

onMounted(function () {
  const t0 = Date.now();            // 「停留多久」从出现的这一刻开始算
  timers.push(setTimeout(function () { armed.value = true; }, 40));

  let i = 0;
  function next() {
    if (done) return;
    if (i < C.boot.lines.length) {
      i++;
      lines.value = C.boot.lines.slice(0, i);
      progress.value = 0.04 + 0.86 * (i / C.boot.lines.length);
      syncLog();
      timers.push(setTimeout(next, C.boot.stepMs));
    } else {
      /* 自检写满 → 停在 100% 等满 minMs 才进入主界面（这就是「等待进入」） */
      progress.value = 1;
      holding.value = true;
      if (BOOT.waitEnter) {
        waiting.value = true;                                  // 等一次按键 / 点击
      } else {
        const left = Math.max(200, BOOT.minMs - (Date.now() - t0));
        timers.push(setTimeout(function () { finish(false); }, left));
      }
      /* 停留期间每 250ms 更新提示行上的倒计时（finish() 会清掉这个链） */
      (function tick() {
        if (done || !holding.value) return;
        countdown.value = Math.max(0, Math.ceil((BOOT.minMs - (Date.now() - t0)) / 1000));
        timers.push(setTimeout(tick, 250));
      })();
    }
  }
  timers.push(setTimeout(next, 180));

  /* 兜底：任何情况下都不能卡在开机画面。
     waitEnter = true 时尊重「停下来等人」的意图，只留 window.onerror 那条兜底 */
  if (!BOOT.waitEnter) {
    timers.push(setTimeout(function () { finish(true); }, Math.max(BOOT.holdMs, BOOT.minMs + 1500)));
  }

  syncLog();

  document.addEventListener('keydown', skip, true);
  window.addEventListener('error', skip, false);
});

onUnmounted(function () {
  clearTimers();
  document.removeEventListener('keydown', skip, true);
  window.removeEventListener('error', skip, false);
});
</script>

<template>
  <div
    class="boot"
    id="boot"
    :class="{ 'is-armed': armed, 'is-flash': flash, 'is-done': finished,
              'is-hold': holding, 'is-wait': waiting }"
    @click="skip"
  >
    <!-- 两侧立绘：左 = 驾驶员 / 右 = 机体（config.boot.art 的预留位；?art=off 关掉）。
         绝对定位的独立层，不参与 flex 排流；入场从屏幕外「划入」，
         自检擦除时跟着 .is-done 的 clip-path 一起被擦走 -->
    <div
      v-if="ART.on && ART.left.img"
      class="boot__art boot__art--l"
      id="boot-art-l"
      :style="artStyle('left')"
      aria-hidden="true"
    >
      <i class="boot__artglow"></i>
      <i class="boot__ripple"></i>
      <div class="boot__artin" :style="artBg('left')"></div>
      <span class="boot__arttag">{{ ART.left.tag }}</span>
    </div>

    <div
      v-if="ART.on && ART.right.img"
      class="boot__art boot__art--r"
      id="boot-art-r"
      :style="artStyle('right')"
      aria-hidden="true"
    >
      <i class="boot__artglow"></i>
      <i class="boot__ripple"></i>
      <div class="boot__artin" :style="artBg('right')"></div>
      <span class="boot__arttag">{{ ART.right.tag }}</span>
    </div>

    <div class="boot__fx" aria-hidden="true"></div>

    <!-- 中列文字后面的压暗层（只在有立绘时出现；压在立绘之上、文字之下） -->
    <div
      v-if="ART.on"
      class="boot__scrim"
      :style="{ '--scrim': String(ART.scrim) }"
      aria-hidden="true"
    ></div>

    <svg class="boot__ring" id="boot-ring" viewBox="0 0 240 240" aria-hidden="true">
      <!-- 六边形内部的徽记（config.boot.mark 的预留位）：被下面这个 clipPath
           裁进那个六边形 → 只可能在六边形里出现。⚠ .b-hex 的描边要画在它**之后**
           （图上会盖掉半条描边），所以顺序是「圈 → 徽记 → 描边 → 刻度」 -->
      <defs>
        <clipPath id="boot-mark-clip"><polygon :points="hexPts" /></clipPath>
      </defs>
      <circle class="b-ring" cx="120" cy="120" r="112" />
      <circle class="b-ring b-ring--main" cx="120" cy="120" r="98" />
      <circle class="b-ring" cx="120" cy="120" r="64" stroke-dasharray="3 7" />
      <image
        v-if="MARK.img"
        class="b-mark"
        id="boot-mark"
        clip-path="url(#boot-mark-clip)"
        :href="MARK.img"
        :x="MARK.box.x"
        :y="MARK.box.y"
        :width="MARK.box.w"
        :height="MARK.box.h"
        :preserveAspectRatio="MARK.par"
        :style="MARK.style"
      />
      <polygon class="b-hex" :points="hexPts" />
      <path class="b-ring" d="M120 4v20M120 216v20M4 120h20M216 120h20" />
    </svg>

    <div class="boot__title">EVA<b>-02</b><span>VECTOR HUD SYSTEM</span></div>

    <!-- 自检日志：框高 = 行数 × 行高（由 config.boot.lines 决定）→
         文本永远装在自己的框里，绝不会压到下面的进度条；
         万一以后行数太多，框会内部滚动并自动跟到最后一行 -->
    <div
      class="boot__log"
      id="boot-log"
      ref="logEl"
      :class="{ 'is-scroll': logScroll }"
      :style="{ '--boot-rows': C.boot.lines.length }"
    ><template v-for="(l, i) in lines" :key="i"><span v-html="l"></span>{{ '\n' }}</template></div>

    <div class="boot__bar"><i id="boot-bar" :style="{ width: Math.round(progress * 100) + '%' }"></i></div>

    <!-- 提示行：写满前 = 跳过；写满后停留 = 倒计时；waitEnter = 等任意键进入 -->
    <div class="boot__hint" id="boot-hint">
      <template v-if="waiting">自检完成 · 按任意键 / 点击 进入主界面 · PRESS ANY KEY TO ENTER</template>
      <template v-else-if="holding">自检完成 · {{ countdown }}s 后进入主界面 · ENTERING MAIN HUD</template>
      <template v-else>点击 / 任意键 跳过 · PRESS ANY KEY TO SKIP</template>
    </div>
  </div>
</template>

<style scoped>
/*
 * BootOverlay.vue 的样式 —— 开机自检：AT 力场环 + 自检日志 + 进度条 + 红闪擦除。
 * 自检日志的「框高 = 行数 × 行高」是关键：文本域永远装得下自己的文本
 * （config.boot.lines 有几行就多高），所以不会和进度条叠在一起。
 */
.boot {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  border-radius: 30px;
  overflow: hidden;
  background:
    radial-gradient(60% 50% at 50% 42%, rgba(226, 0, 26, .3) 0%, transparent 66%),
    linear-gradient(180deg, #0d0204 0%, #050102 100%);
  clip-path: inset(0 0 0 0);
  transition: clip-path .55s cubic-bezier(.7, 0, .2, 1), opacity .35s .35s;
}
.boot.is-done {
  clip-path: inset(0 0 100% 0);
  opacity: 0;
  pointer-events: none;
}

/* 背景：斜向能量线（压在两幅立绘之上、文字之下） */
.boot__fx {
  position: absolute;
  inset: -20%;
  z-index: 1;
  opacity: .28;
  background: repeating-linear-gradient(
    116deg,
    transparent 0 34px,
    rgba(255, 60, 40, .22) 34px 36px,
    transparent 36px 74px
  );
  animation: bootSlide 6s linear infinite;
}
@keyframes bootSlide {
  from { transform: translateX(0); }
  to   { transform: translateX(-148px); }
}

/* ==================================================================
 * 两侧立绘（config.boot.art）：左 = 驾驶员，右 = 机体
 * 四件事必须一起对：
 *   ① 绝对定位 —— 绝不参与 .boot 的 flex 排流（否则顶开日志与进度条）；
 *   ② z-index 0（能量线 1 / 压暗层 2 / 文字 3 都在它上面）；
 *   ③ 就在 .boot 里面 → 擦除时跟着 .is-done 的 clip-path 一起被擦走；
 *   ④ 内容是一张 background-image（config 里的图名 → artslot.js 解析成 URL），
 *      所以配色不用管：图本身带 alpha（白底图先过 tools/cutout.js）。
 * ================================================================== */
.boot__art {
  --art-w: 440px;            /* 宽度（行内 artStyle() 覆盖） */
  --art-o: .55;              /* 透明度 */
  --art-blend: normal;       /* 混合模式：想全息感就改 screen（暗底发光） */
  --art-flip: 1;             /* 1 = 原样 / -1 = 水平镜像（config 的 flip） */
  --art-ms: .9s;             /* 划入时长 */
  --art-delay: 0ms;          /* 右侧比左侧晚一点点 */
  --art-dir: -1;             /* 划入方向：左 -1 / 右 +1 */
  --art-drift: 6px;          /* 停留期向内漂移 */
  --art-mask: 90deg;         /* 朝屏幕中心那一侧羽化 */
  position: absolute;
  bottom: -16px;
  width: var(--art-w);
  height: 86%;
  z-index: 0;
  pointer-events: none;      /* 别挡住「点一下跳过自检」 */
  opacity: 0;
  mix-blend-mode: var(--art-blend);
  animation: bootArtIn var(--art-ms) cubic-bezier(.2, .7, .2, 1) var(--art-delay) both;
}
.boot__art--l { left: -24px;  --art-dir: -1; --art-drift: 6px;  --art-mask: 90deg; }
.boot__art--r { right: -24px; --art-dir: 1;  --art-drift: -6px; --art-mask: 270deg; }

/* 「划入」：从屏幕外侧平移进来（只动 transform / opacity → 走 GPU）
   ⚠ 方向靠 --art-dir：左 -1（从屏幕左边进）/ 右 +1（从屏幕右边进）。
   别写成 calc(-46% * var(--art-dir))——那是反的（左立绘会从屏幕中间往外滑） */
@keyframes bootArtIn {
  from { opacity: 0; transform: translateX(calc(46% * var(--art-dir))); }
  to   { opacity: 1; transform: none; }
}

/* 四角锁定框：每个立绘两个 L 形角标（左右镜像）。
   ⚠ 面板比屏幕外扩了 24px（left/right: -24px），所以内缩必须 > 24px，
   否则角标会被屏幕边缘切掉一半；下沿同理（面板底比屏幕下沿低 16px） */
.boot__art::before,
.boot__art::after {
  content: "";
  position: absolute;
  width: 26px;
  height: 26px;
  border: 2px solid rgba(255, 138, 61, .45);
}
.boot__art--l::before { left: 34px; top: 0; border-right: 0; border-bottom: 0; }
.boot__art--l::after  { right: 34px; bottom: 16px; border-left: 0; border-top: 0; }
.boot__art--r::before { right: 34px; top: 0; border-left: 0; border-bottom: 0; }
.boot__art--r::after  { left: 34px; bottom: 16px; border-right: 0; border-top: 0; }

/* 脚下地面辉光 */
.boot__artglow {
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 116%;
  height: 30%;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at 50% 100%,
    rgba(255, 122, 24, .38) 0%, rgba(255, 122, 24, .12) 44%, transparent 74%);
}

/* A.T. 力场六边形涟漪：入场时从脚下扩散一次 */
.boot__ripple {
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 260px;
  height: 84px;
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  box-shadow: inset 0 0 0 2px rgba(255, 138, 61, .7);
  opacity: 0;
  animation: bootArtRipple 1.7s ease-out .35s 1 both;
}
@keyframes bootArtRipple {
  0%   { opacity: 0; transform: translateX(-50%) scale(.5); }
  28%  { opacity: .9; }
  100% { opacity: 0; transform: translateX(-50%) scale(1.3); }
}

/* 立绘本体：一张 background-image（contain + 贴底居中），翻不翻转看 --art-flip */
.boot__artin {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: bottom center;
  background-size: contain;
  opacity: var(--art-o);
  transform: scaleX(var(--art-flip));
  filter: drop-shadow(0 0 26px rgba(226, 0, 26, .5));
  mask-image: linear-gradient(var(--art-mask), #000 58%, transparent 100%);
}

/* 扫描线：入场后自上而下扫过一次 */
.boot__artin::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0 46%,
    rgba(255, 192, 46, .45) 50%, transparent 54%);
  opacity: 0;
  animation: bootArtScan 1.15s ease-out .6s 1 both;
}
@keyframes bootArtScan {
  0%   { opacity: 0; transform: translateY(-100%); }
  22%  { opacity: .95; }
  100% { opacity: 0; transform: translateY(100%); }
}

/* 角上的小标签（把身份点出来）—— 贴在上角，跟锁定框同一侧；
   ⚠ 别放在面板底部：面板底比屏幕下沿还低 16px，标签会被压在屏幕外看不见 */
.boot__arttag {
  position: absolute;
  top: 34px;
  font-family: var(--font-num);
  font-size: 10px;
  letter-spacing: .2em;
  color: rgba(255, 138, 61, .7);
  white-space: nowrap;
}
.boot__art--l .boot__arttag { left: 34px; }
.boot__art--r .boot__arttag { right: 34px; }

/* 停留期：立绘极慢内移 + 辉光呼吸（等人按键时画面不呆）。
   两个属性写在同一条 keyframes 里 → 不用再给「发光件」单独做一条（图片没有
   可点名的零件），drop-shadow 的强度变化就是「呼吸」；镜像也一起带上 */
.boot.is-hold .boot__artin {
  animation: bootArtDrift 4.2s ease-in-out infinite alternate;
}
@keyframes bootArtDrift {
  from {
    transform: translateX(0) scaleX(var(--art-flip));
    filter: drop-shadow(0 0 22px rgba(226, 0, 26, .42));
  }
  to {
    transform: translateX(var(--art-drift)) scaleX(var(--art-flip));
    filter: drop-shadow(0 0 34px rgba(255, 60, 30, .62));
  }
}

/* 压暗层：中列文字后面压暗一点，读数始终清楚（z-index 2 → 在立绘之上） */
.boot__scrim {
  --scrim: .55;
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(5, 1, 2, var(--scrim)) 0 36%, rgba(5, 1, 2, 0) 64%),
    linear-gradient(270deg, rgba(5, 1, 2, var(--scrim)) 0 36%, rgba(5, 1, 2, 0) 64%);
}

/* 层级收口：立绘 0 / 能量线 1 / 压暗 2 / 文字 3 */
.boot__ring,
.boot__title,
.boot__log,
.boot__bar { position: relative; z-index: 3; }

/* 动效收敛：减少动效时立绘直接显示、不划入也不扫（项目统一惯例） */
@media (prefers-reduced-motion: reduce) {
  .boot__art { animation: none; opacity: 1; }
  .boot__artin,
  .boot__artin::after,
  .boot__ripple,
  .b-mark { animation: none; }
  .boot__artin::after,
  .boot__ripple { opacity: 0; }
}

.boot__ring {
  width: 190px;
  height: 190px;
  filter: drop-shadow(0 0 18px rgba(255, 60, 40, .7));
}
.b-ring { fill: none; stroke: rgba(255, 90, 42, .35); }
.b-ring--main { stroke: var(--c-orange); stroke-width: 2.5; stroke-dasharray: 640; stroke-dashoffset: 640; }
.b-hex { fill: none; stroke: var(--c-red-2); stroke-width: 3; stroke-dasharray: 900; stroke-dashoffset: 900; }
.boot.is-armed .b-ring--main { animation: dash 1.5s cubic-bezier(.2, .7, .2, 1) forwards; }
.boot.is-armed .b-hex { animation: dash 2.1s cubic-bezier(.2, .7, .2, 1) forwards; }
@keyframes dash { to { stroke-dashoffset: 0; } }

/* 环里六边形内部的徽记（config.boot.mark）：几何（x/y/宽高、铺满还是缩进）由行
   内属性给，这里只管观感。不透明度走 --mark-o、动画只动 transform —— 原因见
   <script> 里 markCfg() 上面那条注释（keyframes 的 to{opacity:1} 会盖掉行内值） */
.b-mark {
  opacity: var(--mark-o, .92);
  filter: drop-shadow(0 0 5px rgba(226, 0, 26, .55));
  transform-box: view-box;                 /* 缩放绕环心（120,120），不是元素左上角 */
  transform-origin: 120px 120px;
}
.boot.is-armed .b-mark { animation: markIn 1.1s cubic-bezier(.2, .7, .2, 1) .3s both; }
@keyframes markIn {
  from { transform: scale(.88); opacity: .2; }
  to   { transform: none; }                /* ← 不写 opacity：落在 --mark-o 上 */
}

.boot__title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 34px;
  font-weight: 700;
  letter-spacing: .18em;
  color: #fff;
  text-shadow: 0 0 24px rgba(255, 45, 61, .8);
}
.boot__title b { color: var(--c-red-2); }
.boot__title span {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .34em;
  color: var(--ink-3);
}

.boot__log {
  width: 460px;
  /* 关键：高度 = 行数 × 行高（行数由 config.boot.lines 通过 --boot-rows 传进来）
     —— 自检文本永远装在自己框里，不会再压到下面的进度条上 */
  height: calc(var(--boot-rows, 7) * 1.7em);
  max-height: 46vh;                 /* 行数特别多时的兜底：改为内部滚动 */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;            /* 仪表上不要出现系统滚动条 */
  font-family: var(--font-num);
  font-size: 12px;
  line-height: 1.7;
  letter-spacing: .06em;
  color: var(--c-orange-2);
  text-align: left;
  white-space: pre;
}

.boot__log::-webkit-scrollbar { width: 0; height: 0; }

/* 只有真的滚起来了，才在底部加一层淡出（否则最后一行会被糊掉） */
.boot__log.is-scroll {
  mask-image: linear-gradient(180deg, #000 0 calc(100% - 16px), transparent 100%);
}

.boot__log b { color: var(--c-green-2); }

.boot__bar {
  width: 460px;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 90, 42, .3);
}
.boot__bar i {
  display: block;
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, var(--c-red), var(--c-orange), var(--c-amber));
  box-shadow: 0 0 14px rgba(255, 122, 24, .8);
  transition: width .2s linear;
}

.boot__hint {
  position: absolute;
  bottom: 22px;
  z-index: 3;
  font-size: 11px;
  letter-spacing: .16em;
  color: var(--ink-3);
  animation: pulseGlow 1.8s ease-in-out infinite;
}

/* 自检写满、正在「等待进入主界面」：提示行转琥珀常亮 + 进度条加辉光 */
.boot.is-hold .boot__hint {
  color: var(--c-amber);
  animation: none;
}

.boot.is-hold .boot__bar i {
  box-shadow: 0 0 20px rgba(255, 192, 46, .95);
}

/* waitEnter = true（停住等人工进入）：提示行保持呼吸，提醒「该你了」 */
.boot.is-wait .boot__hint {
  animation: pulseGlow 1.2s ease-in-out infinite;
  letter-spacing: .2em;
}

/* 自检结束的红色闪光 */
.boot.is-flash::after {
  content: "";
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  animation: bootFlash .34s ease-out;
}
@keyframes bootFlash {
  0%   { opacity: .0; }
  22%  { opacity: .55; }
  100% { opacity: 0; }
}
</style>
