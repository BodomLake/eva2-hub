<script setup>
/*!
 * WarningBanner.vue — 顶部告警横幅
 * ------------------------------------------------------------------
 * 有告警时出现：琥珀 = 提示级，红色 = 危险级（闪烁）。
 * 与顶栏铭牌（CHECK）、左侧「消息」芯片构成三重冗余。
 */
import { computed } from 'vue';
import { useHudContext } from '../composables/useHud.js';

const { view } = useHudContext();

const cls = computed(function () {
  const w = view.warning;
  if (!w) return {};
  return {
    'is-amber': w.level === 'amber',
    'is-blink': w.level !== 'amber'
  };
});
</script>

<template>
  <div v-if="view.warning" class="banner" id="banner" :class="cls">
    <svg class="ico"><use href="#i-warn" /></svg>
    <span id="banner-text">{{ view.warning.text }}</span>
  </div>
</template>

<style scoped>
  /* 顶部告警横幅（琥珀 = 提示，红色 = 危险并闪烁） */
/* ============================ 告警横幅 ============================ */
.banner {
  position: absolute;
  left: 50%;
  top: 72px;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 26px;
  border-radius: 9px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: .1em;
  color: #fff;
  background: linear-gradient(180deg, rgba(200, 19, 31, .95), rgba(90, 6, 12, .95));
  border: 1px solid rgba(255, 140, 140, .5);
  box-shadow: 0 0 30px rgba(226, 0, 26, .6);
}

.banner[hidden] {
  display: none;
}

.banner.is-amber {
  background: linear-gradient(180deg, rgba(216, 150, 10, .96), rgba(112, 70, 4, .96));
  box-shadow: 0 0 30px rgba(255, 192, 46, .55);
}

.banner.is-blink {
  animation: blinkHard 1.1s steps(1, end) infinite;
}

.banner .ico {
  width: 23px;
  height: 23px;
}

/* 动效收敛：危险级横幅的闪烁在「减少动效」环境下停掉（改为常亮红） */
@media (prefers-reduced-motion: reduce) {
  .banner.is-blink {
    animation: none;
  }
}
</style>
