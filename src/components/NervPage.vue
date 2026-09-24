<script setup>
/*!
 * NervPage.vue — NERV 终端（左侧灯塔第 3 个芯片）
 * ------------------------------------------------------------------
 * 这一页**还没想好要做什么**（使用者明确说了「咱们暂时不做」），
 * 所以只留一个占位：芯片照旧可点、页面照旧是同一套外壳，
 * 里面写清楚现状与「想好了往哪儿加」——不假装有功能，也不留死链。
 */
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';
/* ⚠ 必须显式 import <AppPage>（理由见 MsgCenter.vue 里的同一行注释） */
import AppPage from './AppPage.vue';

const hud = useHudContext();
const about = C.apps.about;
</script>

<template>
  <AppPage pid="nerv" status="STANDBY">
    <section class="card card--flat">
      <header class="card__hd">
        <svg class="ico"><use href="#i-nerv" /></svg>NERV 终端 · TERMINAL
        <small>{{ about.version }}</small>
      </header>
      <div class="card__body">
        <div class="empty">
          <p class="nerv__big">未启用</p>
          <p class="nerv__sub">这一页的功能还没定 —— 想好了再说，先把位置和外壳留好。</p>
        </div>
        <div class="kv"><span class="kv__k">现状</span><span class="kv__v">芯片可点、页面可开，里面是占位说明</span></div>
        <div class="kv"><span class="kv__k">下一步</span><span class="kv__v">想好要放什么（车辆诊断 / 数据回放 / 主题切换…）再加</span></div>
        <div class="kv"><span class="kv__k">当前仪表</span><span class="kv__v">{{ hud.view.readout }} <em>km/h · {{ hud.view.gearLabel }}</em></span></div>
        <div class="kv"><span class="kv__k">消息未读</span><span class="kv__v">{{ hud.msg.unread }} / {{ hud.msg.total }}</span></div>
        <p class="note">
          五个芯片（消息 / 导航 / NERV / 媒体 / 设置）用的是同一套页面外壳
          <code>AppPage.vue</code>，新页面只要在 <code>config.pages</code> 里加一条、
          再把组件挂进 <code>App.vue</code> 就行 —— 页签、关闭、Esc、<code>?page=</code> 出图都是现成的。
        </p>
      </div>
    </section>
  </AppPage>
</template>

<style scoped>
.nerv__big {
  margin: 0;
  font-family: var(--font-num);
  font-size: 40px;
  letter-spacing: .3em;
  color: var(--c-orange-2);
  text-shadow: 0 0 22px rgba(255, 122, 24, .45);
}
.nerv__sub { margin: 6px 0 12px; font-size: 12px; color: var(--ink-3); letter-spacing: .06em; }
</style>
