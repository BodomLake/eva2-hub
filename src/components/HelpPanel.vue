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
      <li><kbd>↑</kbd>/<kbd>W</kbd> 加速 · <kbd>↓</kbd>/<kbd>S</kbd> 制动（触发能量回收） · <kbd>空格</kbd> 松油门</li>
      <li><kbd>←</kbd>/<kbd>→</kbd> 左 / 右转向（<b>按住</b>期间亮，松开就灭；两个一起按住 = <kbd>双闪</kbd>）</li>
      <li><kbd>A</kbd><kbd>E</kbd><kbd>C</kbd><kbd>F</kbd> 骑行挡位：A 助力推行 / E 经济 / C 滑行 / F 激烈（按下即换挡）</li>
      <li><kbd>P</kbd> 驻车 P 挡（参考图正中那个大字 P） · <kbd>G</kbd> 换下一挡位（中央六边形心跳一次）</li>
      <li><kbd>H</kbd> 双闪 · <kbd>L</kbd> 大灯 · <kbd>K</kbd> 龙头锁（OFF / ON） · <kbd>R</kbd> 定速巡航 · <kbd>B</kbd> 蓝牙 · <kbd>U</kbd> USB 供电 · <kbd>Y</kbd> 手机音源</li>
      <li><kbd>X</kbd> 边撑（放下后挂挡会被拒绝并告警） · <kbd>V</kbd> 充电枪</li>
      <li><kbd>M</kbd> 自动驾驶演示 开/关 · <kbd>O</kbd> 操作弹框（点按钮设定演示内容） · <kbd>?</kbd> 显示或关闭本帮助</li>
      <li>
        <kbd>I</kbd> 消息中心 · <kbd>N</kbd> 导航 · <kbd>J</kbd> 媒体播放器 · <kbd>T</kbd> 设置
        —— 也可以直接点左侧五个六边形芯片（再点一次关掉，<kbd>Esc</kbd> 逐层退出）
      </li>
    </ul>
    <p class="help__foot">转向灯在 READY 铭牌左右两侧 · 两侧灯带跟着驾驶状态变色（蓝加速 / 绿回收 / 紫烧氮气 / 红故障 / 黄驻车 / 淡青静止） · 上锁或放下边撑都无法挂挡 · 松开按键 6 秒后自动恢复巡航演示（按住不放则一直由你控制） · 按 <kbd>?</kbd> 关闭</p>
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
