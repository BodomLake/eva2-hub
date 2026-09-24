<script setup>
/*!
 * PowerGauge.vue — 右侧功率圆表（粗描边整圆）
 * ------------------------------------------------------------------
 * 0 → 满量程（各模式功率上限向上取整）对应 140° → 400°，
 * 数值弧半径 94、线宽 14；正功率走红橙渐变，负功率（回收）走绿色 + RECUP。
 * 中心读数 = 圆角铭牌（POWER 标签 / 自动宽度的数值牌 / W 单位 / 电机温度），
 * 数值牌按位数自动降字号 —— 四位数（>999）也不会突出圆外。
 *
 * 性能：SVG 由 core/gauges.js 在 onMounted 里一次性建好，之后每帧
 * 通过 registerFrame() 直接改 <path d> / <circle>，不经过 Vue diff。
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { power as buildPower } from '../core/gauges.js';
import { useHudContext } from '../composables/useHud.js';

const { view, registerFrame } = useHudContext();

const svgEl = ref(null);
let offFrame = null;

onMounted(function () {
  const gauge = buildPower(svgEl.value);
  gauge.set(0);
  offFrame = registerFrame(function (v) { gauge.set(v.power); });
});

onUnmounted(function () { if (offFrame) offFrame(); });
</script>

<template>
  <aside class="side">
    <div class="gauge">
      <svg class="gauge__svg" id="gauge-svg" viewBox="0 0 300 300" aria-hidden="true" ref="svgEl"></svg>

      <!-- <span class="gauge__tag gauge__tag--top">POWER</span> -->

      <div class="gauge__value" :class="{ 'is-regen': view.powerRegen }">
        <!--
          功率数值装在「自动宽度的圆角牌」里（和左侧圆盘的 TIME / RANGE 铭牌同一套画法）：
          3~4 位数时牌子自动变宽、字号自动降一档，永远不会突出圆环之外。
        -->
        <span class="gauge__plate" :class="'len-' + view.powerLen" id="v-power-box">
          <b id="v-power">{{ view.power }}</b>
        </span>
        <i class="gauge__unit">W</i>
        <span
          class="gauge__motor"
          :class="{ 'is-warn': view.tempWarn, 'is-critical': view.tempCrit }"
        >
          <em>MOTOR</em><b id="v-temp">{{ view.temp }}</b><em>℃</em>
        </span>
      </div>

      <span class="gauge__tag gauge__tag--bot">
        <!-- <em id="v-powermode">{{ view.gearLabel }}</em> -->
      </span>

      <!-- <span class="gauge__recup" :class="{ 'is-on': view.powerRegen }" id="v-recup">
        <svg class="ico"><use href="#i-regen" /></svg>RECUP
      </span> -->
    </div>
  </aside>
</template>

<style scoped>
  /* 右侧功率圆表：粗描边整圆 + 刻度 + 数值牌（SVG 由 core/gauges.js 生成） */
/* ============================ 右侧功率圆表（粗描边外圈） ============================ */
.gauge {
  position: relative;
  width: 268px;
  height: 268px;
}

.gauge__svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.gauge__tag {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .2em;
  text-indent: .2em;
  color: #ffd9d9;
  background: linear-gradient(180deg, #c8131f, #7d0a12);
  border: 1px solid rgba(255, 140, 140, .4);
  border-radius: 5px;
  padding: 3px 12px;
  box-shadow: 0 0 14px rgba(226, 0, 26, .5), inset 0 1px 0 rgba(255, 255, 255, .18);
}

.gauge__tag--top {
  top: 22px;
}

.gauge__tag--bot {
  bottom: 30px;
}

.gauge__tag--bot em {
  color: #fff;
  letter-spacing: .16em;
}

.gauge__value {
  position: absolute;
  left: 50%;
  top: 49%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

/* 数值牌：自动宽度 + 圆角（和左侧圆盘的 TIME / RANGE 铭牌同一套画法），
   len-3 / len-4 逐级降字号 —— 四位数也不会突出圆环 */
.gauge__plate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 84px;
  padding: 2px 14px;
  white-space: nowrap;
}

.gauge__plate b {
  font-size: 62px;
  font-weight: 700;
  letter-spacing: -.02em;
  color: #fff;
  text-shadow: 0 0 24px rgba(255, 160, 120, .45);
  /* 功率读数逐帧刷新 → 等宽数字，避免数字宽度抖动 */
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.gauge__plate.len-3 b {
  font-size: 49px;
}

.gauge__plate.len-4 b {
  font-size: 37px;
}

.gauge__plate.len-5 b {
  font-size: 30px;
}

.gauge__value i.gauge__unit {
  margin-top: 3px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: .3em;
  text-indent: .3em;
  color: var(--c-amber);
  text-shadow: var(--glow-amber);
}

.gauge__value.is-regen .gauge__plate b {
  color: var(--c-green-2);
  text-shadow: 0 0 24px rgba(57, 217, 138, .5);
}

.gauge__recup {
  position: absolute;
  right: 26px;
  bottom: 74px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .18em;
  color: var(--c-green-2);
  opacity: 0;
  transition: opacity .2s;
}

.gauge__recup .ico {
  width: 14px;
  height: 14px;
}

.gauge__recup.is-on {
  opacity: 1;
  animation: pulseGlow 1.1s ease-in-out infinite;
}

/* 电机温度读数（圆表中心、功率值下方；放在中心就不会压到数值弧） */
.gauge__motor {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 7px;
  font-weight: 700;
  color: var(--ink-3);
}

.gauge__motor em {
  font-size: 9px;
  letter-spacing: .16em;
}

.gauge__motor b {
  font-size: 14px;
  letter-spacing: .02em;
  color: #cfe0d6;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.gauge__motor.is-warn b {
  color: var(--c-amber);
}

.gauge__motor.is-critical b {
  color: #ff7070;
  animation: blinkHard 1s steps(1, end) infinite;
}

/* 仪表刻度（粗线） —— 这些 SVG 由 core/gauges.js 动态建出来后塞进 <svg>，
   拿不到 scoped 属性，所以统一用 .gauge__svg :deep(…) 选。 */
.gauge__svg :deep(.g-tick) {
  stroke-linecap: round;
}

.gauge__svg :deep(.g-tick--major) {
  stroke: #ff6a58;
  stroke-width: 5;
  opacity: .95;
}

.gauge__svg :deep(.g-tick--minor) {
  stroke: #a8372f;
  stroke-width: 2.8;
  opacity: .85;
}

.gauge__svg :deep(.g-tick--hot) {
  stroke: var(--c-amber);
}

.gauge__svg :deep(.g-ring) {
  fill: none;
}

.gauge__svg :deep(.g-ring-bg) {
  fill: none;
  stroke: rgba(255, 90, 82, .2);
  stroke-width: 2.4;
}

.gauge__svg :deep(.g-arc) {
  fill: none;
  stroke-linecap: round;
}

.gauge__svg :deep(.g-dot) {
  fill: #fff;
}

/* 动效收敛：闪烁 / 发光在「减少动效」环境下停掉 */
@media (prefers-reduced-motion: reduce) {
  .gauge__motor.is-critical b,
  .gauge__value.is-regen .gauge__plate b {
    animation: none;
  }
}
</style>
