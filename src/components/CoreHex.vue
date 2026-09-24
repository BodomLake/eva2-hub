<script setup>
/*!
 * CoreHex.vue — 中央六边形核心（永远绝对居中）
 * ------------------------------------------------------------------
 * 平顶六边形：上/下两条边平行于屏幕横向（与左侧灯塔同一套比例）。
 * 一个「大字槽」承载两种语义（参考图行为）：
 *   停放（P 挡）→ 显示 P          骑行（A/E/C/F/X1/X2）→ 显示时速数字
 * 六边形「左下斜边」= ODO 总里程；「右下斜边」= 龙头锁（OFF 红 / ON 琥珀）；
 * 六边形内部下方 = 当前骑行挡位铭牌 —— 换挡时整个六边形做一次心跳缩放。
 * 六边形外框与机甲徽记是原创几何，由 core/emblem.js 生成（纯字符串）。
 */
import { computed, ref, watch, onUnmounted } from 'vue';
import { CONFIG as C } from '../config.js';
import { buildFrame, build as buildEmblem } from '../core/emblem.js';
import { useHudContext } from '../composables/useHud.js';

const { view } = useHudContext();

/* 只生成一次：外框在 <svg> 内，徽记在裁切层内 */
const frame = buildFrame();
const emblem = buildEmblem();

const readoutCls = computed(function () {
  return {
    'is-3': view.readoutWide,          // 3 位数时速自动缩小字号
    'is-park': view.isPark             // 驻车：显示 P
  };
});

/* ------------------------------------------------------------------
 * 换挡心跳：先缩到 0.88 再弹回当前尺寸（一小一大，像心跳）
 * 用「下一帧再加 class」的方式保证连续换挡也每次都能重放动画。
 * ------------------------------------------------------------------ */
const beat = ref(false);
let beatTimer = null;

function stopBeat() {
  if (beatTimer) { window.clearTimeout(beatTimer); beatTimer = null; }
  beat.value = false;
}
watch(function () { return view.gear; }, function () {
  stopBeat();
  window.requestAnimationFrame(function () {
    beat.value = true;
    beatTimer = window.setTimeout(function () { beat.value = false; }, 560);
  });
});
onUnmounted(stopBeat);
</script>

<template>
  <div class="core" :class="{ 'is-beat': beat }">
    <svg class="core__frame" id="core-frame" viewBox="0 0 470 440" aria-hidden="true" v-html="frame"></svg>

    <div class="core__hex" aria-hidden="true">
      <div class="core__emblem" id="v-emblem" v-html="emblem"></div>
    </div>

    <!-- 中央大字：P 挡显示 P，骑行时显示时速 -->
    <div class="core__readout" :class="readoutCls" id="v-readout-box">
      <b id="v-readout">{{ view.readout }}</b>
      <span class="core__units" id="v-units"><span>km/h</span></span>
    </div>

    <!-- 六边形「左下斜边」：ODO 总里程 -->
    <div class="core__odo" id="v-odo-box">
      <i>ODO</i><b id="v-odo">{{ view.odo }}</b><em>km</em>
    </div>

    <!-- 六边形「右下斜边」：龙头锁开关 OFF / ON（OFF = 红） -->
    <div
      class="core__lock"
      id="v-lock"
      :class="{ 'is-on': view.lockOn }"
      :title="'龙头锁 ' + (view.lockOn ? 'ON' : 'OFF')"
    >
      <svg class="ico"><use href="#i-steerlock" /></svg>
      <b id="v-lock-text">{{ view.lockOn ? 'ON' : 'OFF' }}</b>
    </div>

    <!-- 六边形内部：当前骑行挡位（换挡时整个六边形心跳一次） -->
    <div class="core__gear" :class="'gear-' + view.gear" id="v-gear-box">
      <b id="v-gear">{{ view.gear }}</b>
      <em id="v-gear-label">{{ view.gearLabel }}</em>
    </div>

    <div class="core__name" id="v-core-name"><span>{{ C.brand.coreLabel }}</span></div>
  </div>
</template>

<style scoped>
  /* 中央六边形核心：外框 / 徽记 / 大字槽 / ODO / 龙头锁 / 挡位铭牌 */
/* ============================ 中央六边形核心 ============================ */
.core {
  /* 居中定位（position:absolute + translate）由 App.vue 的 .core 负责，
     这里只负责尺寸与质感，不要再写 position，否则会覆盖居中规则 */
  width: 470px;
  height: 440px;
  filter: drop-shadow(0 10px 40px rgba(226, 0, 26, .3));
}

/* 换挡「心跳」：先缩一下再弹回现在的尺寸（CoreHex.vue 会挂 .is-beat） */
.core.is-beat {
  animation: coreBeat .56s cubic-bezier(.3, 1.35, .36, 1);
}

@keyframes coreBeat {
  0% {
    transform: translate(-50%, -50%) scale(1);
  }

  34% {
    transform: translate(-50%, -50%) scale(.88);
  }

  72% {
    transform: translate(-50%, -50%) scale(1.015);
  }

  100% {
    transform: translate(-50%, -50%) scale(1);
  }
}

.core__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* 六边形内容裁切区（与 core__frame 的多边形完全一致：平顶六边形） */
.core__hex {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  clip-path: polygon(25% 1.4%, 75% 1.4%, 98.6% 50%, 75% 98.6%, 25% 98.6%, 1.4% 50%);
  background:
    radial-gradient(58% 46% at 50% 46%, rgba(226, 0, 26, .28) 0%, rgba(120, 6, 16, .1) 46%, transparent 72%),
    linear-gradient(180deg, rgba(40, 6, 12, .9), rgba(8, 2, 4, .96));
}

.core__emblem {
  width: 350px;
  height: 350px;
  opacity: .96;
}

.core__emblem :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* ============================ 核心文字层 ============================ */
/*
 * 中央只有一个「大字槽」：
 *   停放（P 挡）→ 显示 P；骑行（A/E/C/F/X1/X2）→ 显示时速数字（参考图语义）
 * 六边形左下斜边 = ODO 总里程；右下斜边 = 龙头锁开关（OFF 红 / ON 琥珀）；
 * 六边形内部下方 = 当前骑行挡位铭牌。
 */
.core__readout,
.core__odo,
.core__lock,
.core__gear,
.core__name {
  position: absolute;
  z-index: 3;
}

.core__readout {
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: .88;
  color: #fff;
  text-shadow: 0 0 30px rgba(255, 220, 220, .5), 0 0 70px rgba(255, 45, 61, .35);
  transition: color .2s;
}

.core__readout>b {
  font-size: 136px;
  font-weight: 700;
  letter-spacing: .02em;
  /* 时速 / P 是逐帧变的大字：等宽数字 + 数字字体，避免字符宽度跳动 */
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.core__readout.is-3>b {
  font-size: 116px;
}

.core__readout.is-park>b {
  font-size: 150px;
}

/* 车速单位（P 挡时也保留，和参考图一致） */
.core__units {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 6px;
  font-size: 15px;
  letter-spacing: .18em;
  color: #bfeee8;
}

/* 挡位铭牌：六边形内部中下方（换挡时整个六边形心跳一次） */
.core__gear {
  left: 50%;
  bottom: 72px;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 13px;
  border-radius: 5px;
  background: linear-gradient(180deg, rgba(10, 2, 4, .92), rgba(52, 10, 16, .72));
  border: 1px solid rgba(255, 122, 24, .45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1);
}

.core__gear b {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: .04em;
  color: var(--c-amber);
  text-shadow: var(--glow-amber);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.core__gear em {
  font-size: 11px;
  letter-spacing: .18em;
  color: #ffe9d6;
}

.core__gear.gear-P b {
  color: #ff8a8a;
  text-shadow: var(--glow-red);
}

/* ODO 总里程：贴住六边形「左下斜边」（平顶六边形的斜边落在中下部） */
.core__odo {
  right: calc(100% - 62px);
  bottom: 56px;
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 7px;
  white-space: nowrap;
}

.core__odo i {
  font-size: 10px;
  letter-spacing: .24em;
  color: var(--ink-3);
}

.core__odo b {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: .02em;
  color: var(--c-amber);
  text-shadow: var(--glow-amber);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.core__odo em {
  font-size: 11px;
  letter-spacing: .1em;
  color: var(--ink-2);
}

/* 龙头锁开关：贴住六边形「右下斜边」；OFF 用红色（参考图里那颗红锁） */
.core__lock {
  left: calc(100% - 62px);
  bottom: 56px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--c-red-2);
  transition: color .2s;
}

.core__lock .ico {
  width: 27px;
  height: 27px;
  stroke-width: 1.9;
}

.core__lock b {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .16em;
}

.core__lock:not(.is-on) .ico {
  filter: drop-shadow(0 0 8px rgba(255, 45, 61, .75));
}

.core__lock.is-on {
  color: var(--c-amber);
}

.core__lock.is-on .ico {
  filter: drop-shadow(0 0 8px rgba(255, 192, 46, .85));
}

.core__name {
  left: 50%;
  bottom: 1.6%;
  transform: translateX(-50%);
  padding: 2px 18px;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(10, 2, 4, .95), rgba(40, 8, 14, .8));
  border-top: 1px solid rgba(255, 90, 42, .45);
}

.core__name span {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: .42em;
  text-indent: .42em;
  color: var(--c-orange-2);
  text-shadow: 0 0 12px rgba(255, 122, 24, .6);
}


/* ============================ 核心 SVG 描边样式 ============================ */
/* ⚠ 这一组是 emblem.js 生成、经 v-html 注入的 SVG → 拿不到 scoped 属性，
   所以必须用 .core__frame :deep(…) 才能选中（见 base.css 顶部说明）。 */
.core__frame :deep(.cf-fill) {
  fill: url(#coreFill);
}

.core__frame :deep(.cf-outer) {
  fill: none;
  stroke: url(#coreStroke);
  stroke-width: 7;
  stroke-linejoin: round;
}

.core__frame :deep(.cf-inner) {
  fill: none;
  stroke: rgba(255, 150, 60, .55);
  stroke-width: 2;
  stroke-linejoin: round;
}

.core__frame :deep(.cf-tick) {
  stroke: var(--c-orange);
  stroke-width: 3;
  stroke-linecap: round;
  opacity: .85;
}

.core__frame :deep(.cf-tick--w) {
  stroke: #ffd0a0;
  opacity: .95;
}

.core__frame :deep(.cf-fin) {
  fill: url(#coreFin);
  stroke: rgba(255, 122, 24, .7);
  stroke-width: 1.5;
}

.core__frame :deep(.cf-chev) {
  fill: none;
  stroke: var(--c-orange-2);
  stroke-width: 3;
  stroke-linecap: round;
  opacity: .9;
}

/* ============================ 徽记细节 ============================ */
/* 机甲眼罩的呼吸发光（同样由 emblem.js 注入 → :deep） */
.core__emblem :deep(.em-eye) {
  animation: eyePulse 2.6s ease-in-out infinite;
}

@keyframes eyePulse {

  0%,
  100% {
    opacity: .92;
  }

  50% {
    opacity: 1;
    filter: drop-shadow(0 0 7px rgba(78, 240, 138, .95));
  }
}

/* 徽记整体极缓的呼吸，避免画面「死」 */
.core__emblem {
  animation: emblemBreath 6s ease-in-out infinite;
}

@keyframes emblemBreath {

  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-3px) scale(1.012);
  }
}

/* 中心大字的轻微辉光呼吸（P 或时速数字） */
.core__readout {
  animation: gearGlow 4.2s ease-in-out infinite;
}

@keyframes gearGlow {

  0%,
  100% {
    text-shadow: 0 0 26px rgba(255, 220, 220, .42), 0 0 60px rgba(255, 45, 61, .28);
  }

  50% {
    text-shadow: 0 0 34px rgba(255, 235, 235, .7), 0 0 84px rgba(255, 45, 61, .42);
  }
}

/* 动效收敛：核心的呼吸 / 心跳 / 大字发光在「减少动效」环境下全部停掉 */
@media (prefers-reduced-motion: reduce) {
  .em-eye,
  .core__emblem,
  .core__readout,
  .core.is-beat {
    animation: none;
  }
}
</style>
