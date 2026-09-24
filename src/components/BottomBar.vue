<script setup>
/*!
 * BottomBar.vue — 底栏
 * ------------------------------------------------------------------
 * 左：一整块「不规则五边形」装着三组状态图标 —— 网络信号（左上）/
 *     耳机蓝牙（左下）/ GPS（右下），格位由 config.cluster[].slot 决定
 * 中：双电电量表「并列一排两条」（左 = 容量读数 + 轨道、右 = 轨道 + 满电
 *     续航读数，两条轨道由同一套 grid 保证「尺寸永远一致」），垫在一条
 *     红色梯形背景框上；左右两侧各一块「灰黑斜纹平行四边形」装饰
 *     —— 装饰块与红框等高、同中线、左右严格镜像（参考图画法）
 * 右：紫色不规则五边形 = 氮气条（100% 读数 + 5 格紫色斜条），
 *     「NOS」字样用 SVG 画在五边形「外侧」（os 上方还有一道箭头）
 *
 * NOS 格子是 60fps 通道：核心模拟器里 state.nos 会随功率消耗 / 回收回充。
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { CONFIG as C } from '../config.js';
import { segments as buildSegments } from '../core/gauges.js';
import { useHudContext } from '../composables/useHud.js';

const { view, vehicle, registerFrame } = useHudContext();

const segsEl = ref(null);
let offFrame = null;

onMounted(function () {
  const segs = buildSegments(segsEl.value, C.nos.segments, C.nos.colors);
  segs.set(vehicle.nos, 100);
  offFrame = registerFrame(function (v) { segs.set(v.nos, 100); });
});

onUnmounted(function () { if (offFrame) offFrame(); });
</script>

<template>
  <footer class="bottombar">

    <!-- 左下角：一整块五边形，里面装 网络信号 / 耳机蓝牙 / GPS -->
    <div class="bottombar__l">
      <div class="clusterbox chip--bl" title="连接状态">
        <i class="chipbg"></i>
        <span
          v-for="c in C.cluster"
          :key="c.id"
          class="clusterbox__ico"
          :class="['is-' + c.slot, { 'is-on': view.lamps[c.lamp], 'is-dual': !!c.icon2 }]"
          :title="c.label"
        >
          <svg class="ico"><use :href="'#' + c.icon" /></svg>
          <svg v-if="c.icon2" class="ico ico--sub"><use :href="'#' + c.icon2" /></svg>
        </span>
      </div>
    </div>

    <!-- 中间：红色梯形背景框 + 双电两条「并列一排」 + ninebot -->
    <div class="bottombar__c">
      <div class="battgauge" id="v-battgauge" :class="view.battTier">
        <!-- 装饰块：形状与尺寸在 base.css（--mesh-w/-h/-sk），必须与
             ::before 红梯形框等高；--bl 在 left:0、--br 在 right:0，
             一对 ╱ ╲ 互为镜像、同中线（--mesh-dy:0）→ 严格左右对称 -->
        <div class="mesh mesh--bl" aria-hidden="true"></div>
        <div class="mesh mesh--br" aria-hidden="true"></div>

        <!-- 左行 = 容量读数 + 轨道；右行 = 轨道 + 满电续航读数。
             两行的轨道都落在各自 grid 的 1fr 列上 → 尺寸永远一致；
             参考图里两条电量条是紧挨着的（两端才挂读数），所以中间不再放备注 -->
        <div class="battgauge__rows">
          <div class="battgauge__row">
            <span class="battgauge__tag" id="v-soc-tag">{{ view.socText }}</span>
            <span class="battgauge__track">
              <i class="battgauge__fill" id="v-soc-fill" :style="{ width: view.socFill }"></i>
              <span class="battgauge__ticks" aria-hidden="true"></span>
            </span>
          </div>
          <div class="battgauge__row">
            <span class="battgauge__track">
              <i class="battgauge__fill" id="v-range-fill" :style="{ width: view.rangeFill }"></i>
              <span class="battgauge__ticks" aria-hidden="true"></span>
            </span>
            <!-- 满电续航（不是当前续航）：145km -->
            <span class="battgauge__cap" id="v-range-max">{{ view.rangeMax }}</span>
          </div>
        </div>
      </div>

      <div class="brand" id="v-brand">{{ C.brand.name }}</div>
    </div>

    <!-- 右下角：紫色不规则五边形 = NOS 氮气条（NOS 字标在五边形外侧） -->
    <div class="bottombar__r">
      <span class="sico" :class="{ 'is-on': view.lamps.usb }" title="USB 供电">
        <svg class="ico"><use href="#i-usb" /></svg>
      </span>

      <div class="nosbox chip--br" title="氮气条 NOS">
        <i class="chipbg chipbg--purple"></i>

        <!-- 「NOS」字标：SVG 几何字，装在五边形外侧（参考图里 os 上方带箭头） -->
        <span class="nosmark" aria-hidden="true">
          <svg class="nosmark__svg"><use href="#i-nos" /></svg>
        </span>

        <b class="nosbox__pct" id="v-nos-pct">{{ view.nosText }}</b>
        <span class="nosbox__segs" id="v-nos-segs" aria-hidden="true" ref="segsEl"></span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
  /* 底栏：左下五边形状态组 / 中间双电电量条 + 斜纹块 / 右下 NOS 氮气条 */
/* ============ 双电电量表（容量 + 续航「并列一排」，垫在红色梯形框上） ============ */
/*
 * 参考图语义：底栏中间在一条横线上并排两条电量条，
 *   黄/绿/红 = 还没用完的（填充部分）
 *   灰       = 已经用完的（底槽部分）
 * 整组垫在一条「红色梯形背景框」上，左右两侧各压一块灰黑斜纹平行四边形。
 * 颜色只由 SOC 决定：> 60% 绿，60%~20% 黄，< 20% 红（红时闪烁）。
 */
.battgauge {
  position: relative;
  width: 100%;
  /* 高度 = 红色梯形框的高度 = 两侧装饰块的高度（同一个令牌，天然等高） */
  height: var(--mesh-h);
  /* 左右各让出一块装饰块的宽度 → 内容区与红框都天然左右对称 */
  padding: 0 var(--mesh-w);
  --fill-a: #ffd24a;
  --fill-b: #a87400;
  --glow: rgba(255, 192, 46, .5);
}

/* 红色梯形背景框（左边缘斜切 = 梯形；电量条压在它上面）
   高度 100% = .battgauge 的高度 = --mesh-h → 与两侧装饰块「永远等高」 */
.battgauge::before {
  content: "";
  position: absolute;
  inset: 0 128px;          /* 比装饰块内侧再缩 4px → 与装饰块轻微搭接 */
  z-index: 0;
  height: 100%;
  clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%);
  background: linear-gradient(180deg, #ef1a26 0%, #b60f1a 52%, #6e0810 100%);
  border-radius: 4px;
  box-shadow: 0 0 22px rgba(226, 0, 26, .45), inset 0 1px 0 rgba(255, 190, 170, .35);
}

/* 左右两块灰黑斜纹平行四边形：形状来自 base.css 的 --mesh-slash(-r)，
   这里只给位置 —— 贴住容器两端、与红框同中线（--mesh-dy 默认 0）→ 严格镜像对称 */
.battgauge .mesh--bl { left: 0; }
.battgauge .mesh--br { right: 0; }

/* 两条电量条：左行「读数 + 轨道」、右行「轨道 + 读数」，左右镜像排布。
 * 关键约束：两行的轨道都落在各自的 1fr 那一列 → **无论读数多长、
 * 是否显示备注，两个 .battgauge__track 的尺寸都完全一致**（永远一样大）。 */
.battgauge__rows {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;   /* 两条各占一半 → 宽度天然相同 */
  align-items: center;              /* 垂直居中 → 与红框同一条中线 */
  gap: 12px;
  width: 95%;
  height: 100%;
}

/* 单行 = 外侧固定宽度的读数槽 + 内侧吃满剩余空间的轨道槽 */
.battgauge__row {
  display: grid;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.battgauge__row:nth-child(1) { grid-template-columns: 62px minmax(0, 1fr); }  /* 读数在左 */
.battgauge__row:nth-child(2) { grid-template-columns: minmax(0, 1fr) 62px; }  /* 读数在右 */

.battgauge__row:nth-child(1) .battgauge__tag { grid-column: 1; }
.battgauge__row:nth-child(1) .battgauge__track { grid-column: 2; }
.battgauge__row:nth-child(2) .battgauge__track { grid-column: 1; }
.battgauge__row:nth-child(2) .battgauge__cap { grid-column: 2; }

/* 两个读数槽都是固定 62px（不是 min-width）——读数变长也不会挤窄轨道 */
.battgauge__tag {
  text-align: right;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
  color: #fff6e2;
  text-shadow: 0 0 10px rgba(0, 0, 0, .8), 0 0 6px var(--glow);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.battgauge__cap {
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .12em;
  color: #ffe9e2;
  text-shadow: 0 0 6px rgba(0, 0, 0, .85);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.battgauge__track {
  position: relative;
  height: 16px;
  border-radius: 3px;
  overflow: hidden;
  background: linear-gradient(180deg, #666d76, #383e45 52%, #23272c);
  border: 1px solid rgba(255, 120, 90, .3);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, .7);
}

.battgauge__fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 51%;
  border-radius: 3px;
  background: linear-gradient(180deg, #fff3bc, var(--fill-a) 44%, var(--fill-b));
  box-shadow: 0 0 15px var(--glow);
  transition: width .3s linear, background .3s;
}

.battgauge__ticks {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(90deg,
      transparent 0 9.2%,
      rgba(0, 0, 0, .0) 9.2% 10%);
}

/* 颜色档位（由 hud.js 打 class） */
.battgauge.is-high {
  --fill-a: #7dffb8;
  --fill-b: #0e8b4a;
  --glow: rgba(57, 217, 138, .55);
}

.battgauge.is-low {
  --fill-a: #ffd24a;
  --fill-b: #a87400;
  --glow: rgba(255, 192, 46, .5);
}

.battgauge.is-crit {
  --fill-a: #ff9a9a;
  --fill-b: #93060f;
  --glow: rgba(255, 45, 61, .62);
}

.battgauge.is-crit .battgauge__tag {
  animation: blinkHard 1s steps(1, end) infinite;
}

/* ============================ 右下角：紫色不规则五边形 = 氮气条 ============================ */
/*
 * 参考图画法：紫色框里**上面是 NOS 百分比读数、下面是那条斑马纹色带**，
 * 框外左上角贴一枚小「NOS」标签；切角在左上、圆角留在右下（与其它三角镜像）。
 */
.nosbox {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;      /* 读数贴上半、斜条色带贴下半（参考图排布） */
  gap: 4px;
  width: 158px;
  height: 92px;
  padding: 9px 13px 10px;
}

/* 内容层压在 .chipbg 之上：**点名**要抬高的两层，别用 `:not(.chipbg)` 通配。
   ⚠ 通配写法 `.nosbox> :not(.chipbg)` 的权重是 (0,3,0)，会压过下面
   `.nosmark[data-v]` 的 (0,2,0) → 「NOS」标签的 position:absolute 被改成
   relative，于是它退回文档流里占掉 41px，把 100% 和斜条一起挤出框外。 */
.nosbox > .nosbox__pct,
.nosbox > .nosbox__segs {
  position: relative;
  z-index: 1;
}

/* 「NOS」字标：SVG 几何字（os 上方带箭头），挂在五边形「外侧」—— 不压框 */
.nosmark {
  position: absolute;
  left: 8px;
  bottom: calc(100% + 4px);
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 3px 10px 4px;
  border-radius: 3px;
  background: linear-gradient(180deg, #b978ff 0%, var(--c-purple) 55%, #5b21b6 100%);
  box-shadow: 0 0 12px rgba(167, 139, 250, .7), inset 0 1px 0 rgba(255, 255, 255, .35);
  color: #f7eeff;
}

.nosmark__svg {
  width: 50px;
  height: 34px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nosbox__pct {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: .01em;
  color: #fff;
  text-shadow: 0 0 18px rgba(217, 70, 239, .9);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

/* NOS 斜条容器：贴在五边形下半部的一条「斑马纹」色带（参考图画法）。
 * ⚠ 条子本身（<i class="bar__seg">）是 gauges.js 用 JS 建的，拿不到 scoped
 *   属性 → 必须用 :deep() 选，否则整条色带是隐形的（只剩上面那个 100%）。 */
.nosbox__segs {
  display: flex;
  align-items: stretch;
  gap: 3px;
  width: 100%;
  height: 22px;
}

.nosbox__segs :deep(.bar__seg) {
  flex: 1;
  min-width: 0;
  border-radius: 1.5px;
  transform: skewX(-20deg);          /* 一条条斜条：╱╱╱╱╱ */
  background: linear-gradient(180deg, #33244d 0%, #1d1330 100%);
  border: 1px solid rgba(167, 139, 250, .22);
  transition: background .3s, box-shadow .3s, border-color .3s;
}

/* 点亮的格子：紫色实心 + 辉光（颜色由 gauges.js 注入的 --seg 决定） */
.nosbox__segs :deep(.bar__seg.is-on) {
  background: var(--seg, #8b5cf6);
  border-color: rgba(233, 213, 255, .55);
  box-shadow: 0 0 10px var(--seg, #8b5cf6), inset 0 1px 0 rgba(255, 255, 255, .35);
}

/* ==================== 左下角：一整块不规则五边形装三组状态 ==================== */
/*
 * 参考图画法：一个五边形里塞三组图标 —— 网络信号在上、耳机蓝牙 / GPS 在下，
 * 切角在「右上」（朝屏幕中心），圆角留在「左下」（屏幕外角），
 * 与其它三个角落的芯片互为镜像。
 */
.clusterbox {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, 40px);
  grid-template-rows: repeat(2, 34px);
  align-items: center;
  justify-items: center;
  gap: 0 6px;
  padding: 8px 16px 8px 14px;
  color: #6b7782;
}

/* 图标层压在 .chipbg 之上（点名 .clusterbox__ico；不要用 :not(.chipbg) 通配，
   它的权重会压过子元素自己的定位声明） */
.clusterbox > .clusterbox__ico {
  position: relative;
  z-index: 1;
}

.clusterbox__ico {
  display: grid;
  place-items: center;
  transition: color .2s;
}

/* 三个图标的位置由 config.cluster[].slot 决定：左上信号 / 左下耳机蓝牙 / 右下 GPS */
.clusterbox__ico.is-tl {
  grid-column: 1;
  grid-row: 1;
  justify-self: start;
}

.clusterbox__ico.is-bl {
  grid-column: 1;
  grid-row: 2;
  justify-self: start;
}

.clusterbox__ico.is-br {
  grid-column: 2;
  grid-row: 2;
  justify-self: center;
}

.clusterbox__ico .ico {
  width: 22px;
  height: 22px;
}

/* 「耳机带蓝牙」：同一格里放耳机 + 蓝牙两个图标 */
.clusterbox__ico.is-dual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.clusterbox__ico.is-dual .ico {
  width: 20px;
  height: 20px;
}

.clusterbox__ico.is-dual .ico--sub {
  width: 14px;
  height: 14px;
  opacity: .88;
}

.clusterbox__ico.is-on {
  color: var(--c-green);
}

.clusterbox__ico.is-on .ico {
  filter: drop-shadow(0 0 7px rgba(57, 217, 138, .8));
}

/* 独立状态小图标（USB 供电等） */
.sico {
  display: grid;
  place-items: center;
  color: #6b7782;
  transition: color .2s, filter .2s;
}

.sico .ico {
  width: 21px;
  height: 21px;
}

.sico.is-on {
  color: var(--c-green);
}

/* ninebot 品牌字（底栏中间、双电两条的下方居中） */
.brand {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: .34em;
  text-indent: .34em;
  color: #8e9aa4;
  text-shadow: 0 0 14px rgba(255, 255, 255, .1);
}

/* ============================ 底栏 ============================ */
.bottombar {
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr) 208px;
  align-items: center;
  gap: 16px;
  padding: 0 8px;
}

/* 左下角：一整块五边形（里面 1 上 2 下三组状态图标） */
.bottombar__l {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

/* 底栏中间：双电两条「并列一排」+ ninebot 品牌字 */
.bottombar__c {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
}

/* 底栏右侧：USB 指示灯 + 紫色氮气条（NOS 不规则五边形） */
.bottombar__r {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

/* 动效收敛：极低电量时容量读数的闪烁在「减少动效」环境下停掉 */
@media (prefers-reduced-motion: reduce) {
  .battgauge.is-crit .battgauge__tag {
    animation: none;
  }
}
</style>
