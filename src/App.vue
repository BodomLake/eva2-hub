<script setup>
/*!
 * App.vue — 仪表外壳 + 三段式布局骨架
 * ------------------------------------------------------------------
 * 这里只负责「摆位置」：机身边框、侧灯带、顶栏 / 主体 / 底栏三段，
 * 以及告警横幅、帮助浮层、屏幕质感层、开机自检层。
 * 所有实时数据都来自 createHud()（provide 给所有子组件）。
 */
import { ref, onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import { CONFIG as C } from './config.js';
import { createHud } from './composables/useHud.js';
import { spriteMarkup } from './core/icons.js';

import TopBar from './components/TopBar.vue';
import LeftRail from './components/LeftRail.vue';
import TimeDial from './components/TimeDial.vue';
import CoreHex from './components/CoreHex.vue';
import PowerGauge from './components/PowerGauge.vue';
import BottomBar from './components/BottomBar.vue';
import WarningBanner from './components/WarningBanner.vue';
import HelpPanel from './components/HelpPanel.vue';
import ControlPanel from './components/ControlPanel.vue';
import BootOverlay from './components/BootOverlay.vue';

/* 五个应用页在 router.js 里注册（路由 = 页面 id = 左灯塔芯片 id）：
   页面切换由 <RouterView> + <KeepAlive> 负责，路由是「当前打开哪一页」的唯一真相 */
const router = useRouter();
const hud = createHud({ router });
const page = hud.page;          // 当前打开的应用页（'' = 都没开）
const view = hud.view;          // 8Hz 显示快照（侧边氛围灯带的状态就从这里读）
// const scale = hud.scale;
const scale = 1;
const sprite = spriteMarkup();

/* 开机自检层：出图模式（?photo=）直接跳过，方便截图工具抓取 */
const showBoot = ref(!hud.frozen && C.boot.enabled);

function onBootDone() {
  hud.start();                       // 主循环立刻开跑（擦除动画下面已经是活动画面）
  window.setTimeout(function () { showBoot.value = false; }, 1000);
}

onMounted(function () {
  if (!showBoot.value) hud.start();

  /* TEMP-PROBE: 把关键元素的几何信息塞进 document.title，配合无头 --dump-dom 读取 */
  if (/[?&]probe=1/.test(window.location.search)) {
    window.setTimeout(function () {
      const list = ['.topbar__c', '.plaque', '.mesh--tl', '.mesh--tr',
        '.battgauge', '.battgauge__rows', '.mesh--bl', '.mesh--br', '.battgauge__track'];
      const out = list.map(function (sel) {
        const el = document.querySelector(sel);
        if (!el) return { sel: sel, missing: true };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          sel: sel,
          x: +r.x.toFixed(1), y: +r.y.toFixed(1),
          w: +r.width.toFixed(1), h: +r.height.toFixed(1),
          clip: cs.clipPath, tf: cs.transform, top: cs.top, left: cs.left, right: cs.right,
          dy: cs.getPropertyValue('--mesh-dy').trim()
        };
      });
      document.title = 'PROBE' + JSON.stringify(out) + 'ENDPROBE';
    }, 400);
  }
});
</script>

<template>
  <div class="viewport">
    <div class="stage" :style="{ transform: 'scale(' + scale.toFixed(4) + ')' }">

      <div class="bezel">
        <div class="bezel__bolts" aria-hidden="true"></div>

        <div class="screen" id="screen">

          <!-- 侧边氛围灯带（颜色 / 闪烁由 view.strip 决定：
               fault 红闪 · boost 紫闪 · accel 蓝常亮 · brake 绿常亮 · park 黄 · idle 淡青） -->
          <span class="strip strip--l" :class="'is-' + view.strip" aria-hidden="true"></span>
          <span class="strip strip--r" :class="'is-' + view.strip" aria-hidden="true"></span>

          <div class="hud">

            <!-- ===================== 顶栏 ===================== -->
            <TopBar />

            <!-- ===================== 主体 ===================== -->
            <main class="main">

              <!-- 左侧六边形功能灯塔：消息 / 导航 / NERV / 音乐 / 设置 -->
              <LeftRail />

              <!-- 六边形左侧的粗描边圆盘：TIME / TRIP -->
              <TimeDial />

              <!-- 六边形左侧灯具：近光灯（转向灯已移到 READY 左右两侧） -->
              <div class="lamps lamps--l">
                <span class="lamp" :class="{ 'is-on': hud.view.lamps.beamLow }" title="近光灯">
                  <svg class="ico"><use href="#i-beam" /></svg>
                </span>
              </div>

              <!-- 中央六边形核心（绝对居中，压在左右两个圆盘之上） -->
              <CoreHex />

              <!-- 右侧功率圆表 -->
              <PowerGauge />
            </main>

            <!-- ===================== 底栏 ===================== -->
            <BottomBar />
          </div><!-- /.hud -->

          <!-- 告警横幅 / 帮助浮层 / 操作弹框（O 键 · 左灯塔「设置」芯片 · ?panel=1 打开） -->
          <WarningBanner />
          <HelpPanel />
          <ControlPanel />

          <!-- ===================== 五个应用页（路由 + 保活） =====================
               左灯塔五个芯片 / 键盘 I N J T / 地址栏 ?page=xxx 或 #/xxx 打开。
               · `.pages` 是**常驻的实底容器**：页与页转场时透出来的是这层底色，
                 不会再像以前那样「v-if 卸载 + 重新淡入」闪一下仪表本体；
               · <KeepAlive> 缓存访问过的页面 → 切页 / 关页都不卸载
                 （播放器不断、导航路线不丢、设置里选的那一节还在）；
               · 没开页面时容器加 .is-off（visibility:hidden + 不吃点击），
                 所以 HUD 的 DOM 与「没有这一层」时完全一样。 -->
          <div class="pages" :class="{ 'is-off': !page }">
            <RouterView v-slot="{ Component, route }">
              <Transition name="pageSw">
                <KeepAlive>
                  <component :is="Component" :key="route.name" />
                </KeepAlive>
              </Transition>
            </RouterView>
          </div>

          <!-- 屏幕质感层 -->
          <div class="fx fx--grid" aria-hidden="true"></div>
          <div class="fx fx--scan" aria-hidden="true"></div>
          <div class="fx fx--vig" aria-hidden="true"></div>
        </div><!-- /.screen -->
      </div><!-- /.bezel -->

      <!-- ===================== 开机自检动画 ===================== -->
      <BootOverlay v-if="showBoot" @done="onBootDone" />
    </div>
  </div>

  <!-- 图标精灵：一次性注入，供 <use href> 按 id 引用（见 core/icons.js） -->
  <div class="sprite" aria-hidden="true" v-html="sprite"></div>
</template>

<style scoped>
/*
 * App.vue 的样式 = HUD 三段式骨架（顶栏 / 主体 / 底栏）+ 图标精灵容器。
 * 子组件根节点会带上本组件的 scope 属性，所以这里可以直接给
 * .rail / .core / .timedial / .side 这类「子组件根节点」定位置。
 */
.sprite {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.hud {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 62px minmax(0, 1fr) 104px;
  gap: 6px;
  padding: 12px 52px 10px;
  z-index: 2;
}

/* ============================ 主体区（绝对定位，互不干扰） ============================ */
.main {
  position: relative;
  min-height: 0;
}

/* 左侧六边形功能灯塔（5 个芯片）：垂直居中贴左，彼此挨得很近 */
.rail {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* 中央六边形：左右两侧不再参与排流 → 永远精确居中；
   z-index 高于左右两个圆盘 —— 参考图里六边形是「压住」圆形的 */
.core {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
}

/* 左侧 TIME / RANGE 圆盘：右边缘伸进六边形下方（与参考图一样有重叠） */
.timedial {
  position: absolute;
  right: calc(50% + 190px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

/* 左侧灯具组（只剩近光灯）：停在圆盘左侧的空档里 */
.lamps {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
}
.lamps--l { right: calc(50% + 452px); }

/* 右侧功率圆表：左边缘同样伸进六边形下方，与左侧圆盘镜像对称 */
.side {
  position: absolute;
  left: calc(50% + 190px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
}

/*
 * 近光灯：灭灯 = 灰，亮灯 = 绿 + 辉光（转向灯在 TopBar.vue，样式也在那边）
 */
.lamp {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #6b7680;
  transition: color .18s, filter .18s, opacity .18s;
}

.lamp .ico {
  width: 24px;
  height: 24px;
  stroke-width: 2.1;
}

.lamp.is-on {
  color: var(--c-green);
  filter: drop-shadow(0 0 8px rgba(57, 217, 138, .8));
}
</style>
