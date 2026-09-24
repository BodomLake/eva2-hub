<script setup>
/*!
 * TopBar.vue — 顶栏
 * ------------------------------------------------------------------
 * 左：天气 + 时间（同一个芯片：第一行天气、第二行时间）
 * 中：左转向 ← READY → 右转向（参考图里转向灯就贴在铭牌左右两侧；
 *     两个转向灯一起亮 = 双闪），身后是两块「灰黑斜纹平行四边形」装饰
 *     —— 离铭牌等距、上下错位 ±15px，形状取自 base.css 的 --mesh-slash(-r)
 * 右：骑行挡位徽标 —— 挡位名 + 「×2」，倒三角与 4 个电量点
 *
 * 轮廓（base.css 的令牌，四角互为镜像）：
 *   左上 chip--tl 外圆角左上 + 右下切角，右上 chip--tr 外圆角右上 + 左下切角
 */
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';

const { view } = useHudContext();
</script>

<template>
  <header class="topbar">
    <div class="topbar__l">
      <div class="timechip chip--tl" id="v-clock-box" :title="view.weatherText + ' · ' + view.clock">
        <i class="chipbg chipbg--amber"></i>
        <div class="timechip__wx">
          <svg class="ico"><use :href="'#' + view.weatherIcon" /></svg>
          <em id="v-weather">{{ view.weatherText }}</em>
        </div>
        <b id="v-clock">{{ view.clock }}</b>
      </div>
    </div>

    <div class="topbar__c">
      <!-- 装饰：READY 两侧的灰黑斜纹平行四边形（参考图画法） -->
      <span class="mesh mesh--tl" aria-hidden="true"></span>
      <span class="mesh mesh--tr" aria-hidden="true"></span>

      <!-- 左转向灯（双闪时左右一起闪） -->
      <span
        class="turn turn--l"
        id="v-turn-l"
        :class="{ 'is-on': view.lamps.turnL, 'is-haz': view.hazard }"
        :title="view.hazard ? '双闪' : '左转向'"
      >
        <svg class="ico"><use href="#i-arrow-l" /></svg>
      </span>

      <span class="plaque" id="v-ready" :class="view.readyCls">{{ view.readyText }}</span>

      <!-- 右转向灯 -->
      <span
        class="turn turn--r"
        id="v-turn-r"
        :class="{ 'is-on': view.lamps.turnR, 'is-haz': view.hazard }"
        :title="view.hazard ? '双闪' : '右转向'"
      >
        <svg class="ico"><use href="#i-arrow-r" /></svg>
      </span>
    </div>

    <div class="topbar__r">
      <div
        class="gearchip chip--tr"
        :class="view.battTier"
        :title="'骑行挡位 ' + view.gearShort + ' · ' + view.gearName"
      >
        <i class="chipbg chipbg--amber"></i>

        <span class="gearchip__box">
          <b class="gearchip__code" id="v-gear-code">{{ view.gearShort }}</b>
          <em class="gearchip__name" id="v-gear-name">{{ view.gearName }}</em>
        </span>

        <span class="gearchip__meta">
          <i class="gearchip__tri" aria-hidden="true"></i>
          <i class="gearchip__dots">
            <i
              v-for="n in 4"
              :key="n"
              class="leveldots__dot"
              :class="{ 'is-on': n <= view.dots }"
            ></i>
          </i>
        </span>

        <span class="gearchip__dual">
          <em id="v-dual">{{ C.brand.dualMode }}</em>
        </span>
      </div>
    </div>
  </header>
</template>

<style scoped>
/*
 * TopBar.vue 的样式（本组件自己的；公共令牌 / .chipbg / .ico / .mesh 在 src/styles/base.css）
 *   左：天气 + 时间芯片（chip--tl）
 *   中：左转向 ← READY 铭牌 → 右转向，身后一对「灰黑斜纹平行四边形」
 *   右：骑行挡位徽标（chip--tr）
 */
/* ============================ 左上角：天气 + 时间（同一块芯片） ============================ */
/*
 * 参考图左上角只有「天气 + 时间」两行：上一行天气图标、下一行时间；
 * 没有骑行状态 / 座桶之类的第三个图标。轮廓 = 左上圆角 + 右下切角。
 */
.timechip {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 124px;
  padding: 7px 16px 7px 18px;
}

/* 内容层压在 .chipbg 之上（注意排除 .chipbg 本身，否则会覆盖它的绝对定位） */
.timechip> :not(.chipbg) {
  position: relative;
  z-index: 1;
}

.timechip__wx {
  display: flex;
  align-items: center;
  gap: 6px;
}

.timechip__wx .ico {
  width: 18px;
  height: 18px;
  stroke-width: 2.1;
  color: var(--c-amber);
  filter: drop-shadow(0 0 7px rgba(255, 192, 46, .7));
}

.timechip__wx em {
  font-size: 11px;
  letter-spacing: .14em;
  color: var(--c-orange-2);
}

.timechip b {
  font-size: 25px;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: .05em;
  color: #f4f8fb;
  text-shadow: 0 0 14px rgba(255, 255, 255, .38);
  /* 读数用等宽数字，逐帧刷新时不会左右抖 */
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

/* ============================ 转向灯（READY 铭牌左右两侧） ============================ */
/*
 * 贴在铭牌左右两侧（参考图画法），双闪时左右一起闪。
 * 灭灯 = 灰，亮灯 = 琥珀 + 辉光 + 呼吸；双闪时改用红色（警示）。
 */
.turn {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 5px;
  color: #6b7680;
  transition: color .18s, filter .18s, opacity .18s;
}

.turn .ico {
  width: 26px;
  height: 26px;
  stroke-width: 2.6;
}

.turn.is-on {
  color: var(--c-amber);
  filter: drop-shadow(0 0 10px rgba(255, 192, 46, .95));
  animation: pulseGlow .8s ease-in-out infinite;
}

.turn.is-haz.is-on {
  color: var(--c-red-2);
  filter: drop-shadow(0 0 11px rgba(255, 45, 61, .95));
}

/* ==================== 右上角：骑行挡位徽标（新国标 / ×2 模式） ==================== */
/*
 * 参考图里这是一整块芯片：左侧上下两块铭牌（当前挡位 + ×2 模式），
 * 右侧一列「倒三角 + 4 个电量点」—— 三角与圆点都在框里，不再拆到外面。
 * 轮廓 chip--tr：右上圆角 + 左下切角（与左上的天气时间芯片镜像对称）。
 */
.gearchip {
  position: relative;
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  justify-items: start;
  gap: 6px 12px;
  padding: 8px 16px 8px 18px;
}

/* 内容层压在 .chipbg 之上（注意排除 .chipbg 本身，否则会覆盖它的绝对定位） */
.gearchip> :not(.chipbg) {
  position: relative;
  z-index: 1;
}

/* 两块内嵌铭牌：都比外框小一圈（内框压到外五边形是上一版的毛病） */
.gearchip__box,
.gearchip__dual {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 106px;
  padding: 3px 10px;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(255, 233, 214, .14), rgba(255, 233, 214, .05));
  border: 1px solid rgba(255, 214, 160, .5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .16);
}

.gearchip__code {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: .04em;
  color: var(--c-amber);
  text-shadow: var(--glow-amber);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

.gearchip__name {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
  color: #ffe9d6;
}

/* 第二行只写「×2」（参考图没有「模式」两个字） */
.gearchip__dual {
  min-width: 62px;
  margin-left: 12px;
  font-size: 12px;
  letter-spacing: .06em;
  color: var(--c-orange-2);
}

.gearchip__dual em {
  font-weight: 700;
}

/* 右侧：倒三角（指向下）+ 4 个电量点，整体在框内 */
.gearchip__meta {
  grid-column: 2;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.gearchip__tri {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--ink-3);
  transition: border-top-color .25s;
}

.gearchip__dots {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.leveldots__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #3a4149;
  transition: background .25s, box-shadow .25s;
}

.leveldots__dot.is-on {
  background: var(--c-amber);
  box-shadow: 0 0 6px rgba(255, 192, 46, .9);
}

.gearchip.is-high .leveldots__dot.is-on {
  background: var(--c-green-2);
  box-shadow: 0 0 6px rgba(57, 217, 138, .9);
}

.gearchip.is-crit .leveldots__dot.is-on {
  background: #ff6a6a;
  box-shadow: 0 0 6px rgba(255, 45, 61, .95);
}

.gearchip.is-crit .gearchip__tri {
  border-top-color: #ff6a6a;
  animation: blinkHard 1s steps(1, end) infinite;
}


/* ============================ 顶栏 ============================ */
.topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}

.topbar__l { display: flex; align-items: center; gap: 12px; }

/* 中间：READY 左右两侧各一颗转向灯（双闪时一起闪），身后垫两块
   「灰黑斜纹平行四边形」装饰 —— 与铭牌左右等距（46px），且**两块共用同一条
   中线**（--mesh-dy: 0）＋形状是一对镜像多边形（╲ ╱）→ 严格左右镜像对称、等高 */
.topbar__c {
  position: relative;
  display: flex;
  align-items: center;
  gap: 28px;
}
.topbar__c .mesh--tl { right: calc(100% + 46px); --mesh-dy: 0px; }
.topbar__c .mesh--tr { left: calc(100% + 46px); --mesh-dy: 0px; }

.topbar__r { display: flex; align-items: center; gap: 9px; justify-self: end; }

/* READY 铭牌（身后垫着斜纹装饰块，所以自己要抬到装饰块之上） */
.plaque {
  position: relative;
  z-index: 1;
  padding: 5px 30px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .46em;
  text-indent: .46em;
  color: #c8d4dd;
  background: linear-gradient(180deg, #1d262e, #0d1418);
  border-radius: 6px;
  border: 1px solid #39464f;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12), 0 2px 10px rgba(0, 0, 0, .6);
  transition: color .25s, border-color .25s, box-shadow .25s;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}
.plaque.is-on {
  color: var(--c-green-2);
  border-color: rgba(57, 217, 138, .55);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12), var(--glow-green);
}
.plaque.is-warn {
  color: #ffb4b4;
  border-color: rgba(255, 45, 61, .7);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12), var(--glow-red);
}
.plaque.is-charge {
  color: #bde8ff;
  border-color: rgba(46, 214, 200, .6);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .12), var(--glow-cyan);
}

/* 动效收敛：转向灯呼吸 / 低电量红闪三角在「减少动效」环境下停掉 */
@media (prefers-reduced-motion: reduce) {
  .turn.is-on,
  .gearchip.is-crit .gearchip__tri {
    animation: none;
  }
}
</style>
