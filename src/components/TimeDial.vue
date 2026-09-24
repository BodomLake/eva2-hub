<script setup>
/*!
 * TimeDial.vue — 六边形左侧的粗描边圆盘（TIME / TRIP）
 * ------------------------------------------------------------------
 * 粗线靠「conic-gradient 外环 + padding:7px + 深色内盘」两层实现，
 * 位置由 App.vue 的 .timedial 定（六边形外侧，绝不重叠）。
 */
import { useHudContext } from '../composables/useHud.js';

const { view } = useHudContext();
</script>

<template>
  <div class="timedial">
    <div class="timedial__in">
      <div class="timedial__row"><i>TIME</i><b id="v-ride">{{ view.ride }}</b></div>
      <div class="timedial__row"><i>TRIP</i><b id="v-trip">{{ view.trip }}</b></div>
    </div>
  </div>
</template>

<style scoped>
  /*
 * TimeDial.vue 的样式 —— 参考图里六边形左侧那个圆：
 * 用 conic-gradient 做「粗描边」，内层再盖一个深色圆盘，露出来的一圈就是粗线；
 * 圆盘内是「金字标签 + 白色读数」两行（TIME / TRIP）。
 * 定位在 App.vue 的 .timedial：右边缘伸进六边形下方（参考图有重叠）。
 *
 * ⚠ 左右两个圆的直径必须一模一样（参考图两个圆等大）：
 *   这里写死 240px；右侧 PowerGauge 的 RING=128 ×（268/300）+ 描边 = 239px，
 *   改任何一个都要同步另一个（目前靠肉眼核对 + 出图对比）。
 */
.timedial {
  width: 240px;
  height: 240px;
  padding: 8px;
  border-radius: 50%;
  background: conic-gradient(from 208deg,
      #ffe0a8 0deg, #ff8a1e 58deg, #e2001a 150deg,
      #ff5a2a 232deg, #ffb020 300deg, #ffe0a8 360deg);
  box-shadow: 0 0 30px rgba(226, 0, 26, .42), inset 0 0 12px rgba(0, 0, 0, .55);
}

.timedial__in {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: radial-gradient(72% 72% at 50% 36%, rgba(66, 12, 18, .97), rgba(8, 3, 5, .98));
  box-shadow: inset 0 0 20px rgba(226, 0, 26, .32);
}

.timedial__row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

/* 标签 = 金色斜边小铭牌（参考图里 TIME / RANGE 那一对金字牌） */
.timedial__row i {
  padding: 1px 10px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .18em;
  text-indent: .18em;
  color: #fff4dc;
  background: linear-gradient(180deg, #efab24, #8c4a06);
  border: 1px solid rgba(255, 226, 170, .5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .38), 0 1px 6px rgba(0, 0, 0, .6);
}

.timedial__row b {
  font-size: 23px;
  font-weight: 700;
  letter-spacing: .01em;
  color: #f4f8fb;
  text-shadow: 0 0 12px rgba(255, 255, 255, .38);
  /* 骑行时长 / 里程逐帧刷新 → 等宽数字，避免抖动 */
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}
</style>
