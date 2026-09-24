<script setup>
/*!
 * HelpPanel.vue — 按键说明浮层（按 ? 开关）
 * ------------------------------------------------------------------
 * 打开时左侧「设置」六边形芯片会一起点亮（LeftRail.vue）。
 */
import { useHudContext } from '../composables/useHud.js';

const { helpOpen } = useHudContext();
</script>

<template>
  <div v-if="helpOpen" class="help" id="help">
    <h4>按键控制 <small>CONTROL</small></h4>
    <ul>
      <li><kbd>W</kbd>/<kbd>↑</kbd> 加速 · <kbd>S</kbd>/<kbd>↓</kbd> 制动（触发能量回收） · <kbd>空格</kbd> 松油门</li>
      <li><kbd>P</kbd> 驻车 P 挡（参考图正中那个大字 P）</li>
      <li><kbd>1</kbd>~<kbd>6</kbd> 骑行挡位：A 助力推行 / E 经济 / C 滑行 / F 激烈 / X1 新国标 / X2 新国飚</li>
      <li><kbd>G</kbd> 换下一挡位（中央六边形会做一次心跳缩放）</li>
      <li><kbd>A</kbd> 左转向 · <kbd>F</kbd> 右转向 · <kbd>H</kbd> 双闪 · <kbd>L</kbd> 大灯 · <kbd>K</kbd> 龙头锁（OFF / ON）</li>
      <li><kbd>C</kbd> 定速巡航 · <kbd>B</kbd> 蓝牙 · <kbd>U</kbd> USB 供电 · <kbd>Y</kbd> 手机音源</li>
      <li><kbd>X</kbd> 边撑（放下后挂挡会被拒绝并告警） · <kbd>V</kbd> 充电枪</li>
      <li><kbd>M</kbd> 自动驾驶演示 开/关 · <kbd>O</kbd> 操作弹框（点按钮设定演示内容） · <kbd>?</kbd> 显示或关闭本帮助</li>
    </ul>
    <p class="help__foot">转向灯在 READY 铭牌左右两侧 · 龙头锁上锁时无法挂挡行驶 · 松开按键 6 秒后自动恢复巡航演示 · 按 <kbd>?</kbd> 关闭</p>
  </div>
</template>

<style scoped>
  /* 按键说明浮层（按 ? 开关） */
/* ============================ 快捷键说明 ============================ */
.help {
  position: absolute;
  z-index: 9;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 660px;
  padding: 20px 28px 14px;
  border-radius: 15px;
  background: linear-gradient(180deg, rgba(20, 6, 11, .975), rgba(8, 3, 5, .975));
  border: 1px solid rgba(255, 90, 42, .42);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .8), 0 0 44px rgba(226, 0, 26, .28);
  animation: riseIn .25s ease-out;
}

.help[hidden] {
  display: none;
}

.help h4 {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0 0 10px;
  font-size: 16px;
  letter-spacing: .16em;
  color: var(--c-orange-2);
}

.help h4 small {
  font-size: 10px;
  letter-spacing: .26em;
  color: var(--ink-3);
}

.help li {
  padding: 7px 0;
  font-size: 13px;
  color: var(--ink-2);
  border-bottom: 1px dashed rgba(255, 255, 255, .07);
}

.help li:last-child {
  border-bottom: 0;
}

.help__foot {
  margin: 10px 0 0;
  text-align: center;
  font-size: 11px;
  letter-spacing: .06em;
  color: var(--ink-3);
}

kbd {
  display: inline-grid;
  place-items: center;
  min-width: 23px;
  height: 23px;
  padding: 0 6px;
  margin: 0 2px;
  border-radius: 5px;
  font-family: var(--font-num);
  font-size: 11px;
  font-weight: 700;
  color: #ffe9d6;
  background: linear-gradient(180deg, #3d1a13, #190908);
  border: 1px solid rgba(255, 122, 24, .45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14);
}

/* 浮层入场：写在本组件里 → Vue 会连动画名一起 scoped 化，不会和别处重名 */
@keyframes riseIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: none; }
}

/* 动效收敛：减少动效时不做入场位移 */
@media (prefers-reduced-motion: reduce) {
  .help {
    animation: none;
  }
}
</style>
