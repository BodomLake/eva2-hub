<script setup>
/*!
 * AppPage.vue — 应用页外壳（第 9 轮新增，五个页面共用）
 * ------------------------------------------------------------------
 * 统一 EVA-02 风格：左上平顶六边形芯片标 + 中文标题 + 拉丁副标题 +
 * 右侧状态读数 + ✕，下面一行是五个芯片做的页签（随手切页），
 * 正文区宽度按 config.pages[id].body 居中收窄。
 *
 * 用法（每个页面组件只写自己的正文）：
 *   <AppPage pid="msg" :status="...">
 *     <template #actions><button class="btn">…</button></template>
 *     ……正文……</AppPage>
 *
 * fit = 「一屏装下」：正文区不滚动，页内自己用 flex 分配高度（媒体页用 ——
 * 播放器的画面会被撑成 16:9 的高盒子，把下面那条操作条推到折叠线以下）。
 */
import { computed } from 'vue';
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';

const props = defineProps({
  pid: { type: String, required: true },        // msg / nav / nerv / music / set
  status: { type: String, default: '' },        // 右上角那行状态读数（各页面自己算）
  fit: { type: Boolean, default: false }        // true = 正文区不滚动（一屏装下）
});

const { openPage, closePage } = useHudContext();

const meta = computed(function () {
  return C.pages[props.pid] || { title: '', en: '', hint: '', body: 900 };
});
const icon = computed(function () {
  const hit = C.rail.filter(function (r) { return r.id === props.pid; })[0];
  return hit ? hit.icon : 'i-msg';
});
const tabs = computed(function () {
  return C.rail.map(function (r) {
    const m = C.pages[r.id];
    return { id: r.id, icon: r.icon, label: m ? m.title : r.label };
  });
});
</script>

<template>
  <section class="page" :id="'page-' + pid" :class="{ 'page--fit': fit }">
    <span class="pmesh pmesh--l" aria-hidden="true"></span>
    <span class="pmesh pmesh--r" aria-hidden="true"></span>

    <header class="page__bar">
      <span class="page__ico"><svg class="ico"><use :href="'#' + icon" /></svg></span>
      <span class="page__titles">
        <b class="page__title">{{ meta.title }}</b>
        <em class="page__en">{{ meta.en }}</em>
      </span>
      <span class="page__hint">{{ meta.hint }}</span>
      <slot name="actions"></slot>
      <em v-if="status" class="page__status">{{ status }}</em>
      <button class="page__close" type="button" title="关闭（Esc）" @click="closePage()">✕</button>
    </header>

    <nav class="page__tabs">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="page__tab"
        :class="{ 'is-on': t.id === pid }"
        type="button"
        @click="openPage(t.id)"
      >
        <svg class="ico"><use :href="'#' + t.icon" /></svg>{{ t.label }}
      </button>
    </nav>

    <div class="page__body" :style="{ maxWidth: meta.body + 'px' }">
      <slot></slot>
    </div>
  </section>
</template>

<style scoped>
/* 页面外壳的样式全在公共表 styles/base.css 的「应用页框架」一节
   —— 五个页面 + 页面里的卡片按钮都要用，属于公共零件，这里不再重复。
   下面只留本组件特有的一点：正文区的上下留白由外壳统一控制。 */
.page__body { scrollbar-gutter: stable; }
</style>
