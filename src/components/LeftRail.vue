<script setup>
/*!
 * LeftRail.vue — 左侧功能灯塔（5 个六边形芯片）
 * ------------------------------------------------------------------
 * 自上而下与参考图一致：消息 / 导航 / NERV / 音乐 / 设置。
 * 点亮条件：
 *   消息 → 存在告警（红闪 + 角标）   导航 → 行驶中（非 P 档）
 *   NERV → 上电常亮（核心心跳）      音乐 → 手机音源播放中
 *   设置 → 帮助浮层或操作弹框打开（点它可开操作弹框）
 */
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';

const { view, helpOpen, panelOpen } = useHudContext();

function chipCls(id) {
  if (id === 'msg') return { 'is-alert': !!view.warning };
  if (id === 'nav') return { 'is-on': !view.isPark };
  if (id === 'nerv') return { 'is-core': true };        // 核心芯片：常亮呼吸
  if (id === 'music') return { 'is-on': view.mediaPlaying };
  if (id === 'set') return { 'is-on': helpOpen.value || panelOpen.value };
  return {};
}

/* 设置芯片 = 操作弹框开关（面板里还有一整套演示按钮） */
function onClick(id) {
  if (id === 'set') panelOpen.value = !panelOpen.value;
}
</script>

<template>
  <aside class="rail">
    <span
      v-for="app in C.rail"
      :key="app.id"
      class="hexchip chip--hex"
      :class="[chipCls(app.id), { 'is-click': app.id === 'set' }]"
      :title="app.id === 'set' ? app.label + '（操作弹框 · 键盘 O）' : app.label"
      @click="onClick(app.id)"
    >
      <i class="chipbg"></i>
      <svg class="ico"><use :href="'#' + app.icon" /></svg>
      <b v-if="app.id === 'msg' && view.warning" class="hexchip__badge">1</b>
    </span>
  </aside>
</template>

<style scoped>
  /* 左侧功能灯塔：5 个平顶六边形芯片（消息 / 导航 / NERV / 音乐 / 设置） */
.hexchip {
  position: relative;
  display: grid;
  place-items: center;
  width: 58px;
  height: 50px;
  color: #7b8894;
  transition: color .22s;
}

.hexchip .ico {
  position: relative;
  z-index: 1;
  width: 23px;
  height: 23px;
  stroke-width: 1.9;
}

.hexchip.is-on {
  color: var(--c-amber);
}

.hexchip.is-on .chipbg {
  background: linear-gradient(180deg, #ffe08a 0%, #ff8a1e 55%, #c8131f 100%);
}

.hexchip.is-on .chipbg::after {
  background: linear-gradient(180deg, rgba(56, 20, 4, .92), rgba(14, 5, 2, .95));
}

.hexchip.is-on .ico {
  filter: drop-shadow(0 0 6px rgba(255, 192, 46, .8));
}

.hexchip.is-live {
  color: var(--c-green-2);
}

.hexchip.is-live .chipbg {
  background: linear-gradient(180deg, #b9ffd8 0%, #21bb69 55%, #0a7a42 100%);
}

.hexchip.is-live .chipbg::after {
  background: linear-gradient(180deg, rgba(4, 40, 22, .92), rgba(2, 14, 8, .95));
}

.hexchip.is-live .ico {
  filter: drop-shadow(0 0 6px rgba(57, 217, 138, .8));
}

/* 消息芯片：有告警时红闪 + 右上角未读角标 */
.hexchip.is-alert {
  color: #ff8a8a;
}

.hexchip.is-alert .chipbg {
  background: linear-gradient(180deg, #ffb0a0 0%, #e2001a 55%, #7d0a12 100%);
}

.hexchip.is-alert .chipbg::after {
  background: linear-gradient(180deg, rgba(58, 6, 10, .94), rgba(16, 2, 4, .96));
}

.hexchip.is-alert .ico {
  filter: drop-shadow(0 0 8px rgba(255, 45, 61, .9));
  animation: pulseGlow 1.2s ease-in-out infinite;
}

/* NERV 核心心跳：常亮 + 极缓呼吸，提示「系统在线」 */
.hexchip.is-core {
  color: var(--c-orange-2);
}

.hexchip.is-core .ico {
  animation: corePulse 3.4s ease-in-out infinite;
}

@keyframes corePulse {

  0%,
  100% {
    opacity: .72;
  }

  50% {
    opacity: 1;
    filter: drop-shadow(0 0 8px rgba(255, 122, 24, .9));
  }
}

.hexchip__badge {
  position: absolute;
  right: -4px;
  top: 2px;
  z-index: 2;
  min-width: 19px;
  height: 18px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #1a0507;
  background: var(--c-amber);
  border-radius: 5px;
  box-shadow: var(--glow-amber);
}

/* 动效收敛：告警红闪 / 核心芯片的呼吸在「减少动效」环境下停掉 */
@media (prefers-reduced-motion: reduce) {
  .hexchip.is-alert .ico,
  .hexchip.is-core .ico {
    animation: none;
  }
}

/* 「设置」芯片 = 操作弹框开关：只有它可点，所以给个手型 + 悬停辉光 */
.hexchip.is-click { cursor: pointer; }
.hexchip.is-click:hover { filter: drop-shadow(0 0 10px rgba(255, 122, 24, .85)); }
</style>
