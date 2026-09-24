<script setup>
/*!
 * MsgCenter.vue — 消息中心（左侧灯塔第 1 个芯片）
 * ==================================================================
 * 「整个系统的提示都收在这里」——数据来自 core/messages.js，四条来源：
 *   · 胎压胎温异常：state.warnings() 裁决出来 → useHud 的桥接自动记一笔
 *   · 天气骤变预警：远程服务器推送（hud.pushAlert → window.EVA_HUD.pushAlert）
 *   · 历史故障码：上电时按 config.apps.faults.history 灌入（标记已读）
 *   · 系统提示：挂挡被拒 / 龙头锁 / 未连手机…（同样是告警桥接）
 * 实时胎压胎温读数（原来摆在这一页最上面）已经搬到「设置 → 胎压胎温」那一节，
 * 这里只留消息本身 + 一排「演示推送」把远程推送 / 故障码两条链路跑给人看。
 */
import { computed, ref } from 'vue';
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';
import { agoText, clockText } from '../core/messages.js';
/* ⚠ 必须显式 import：模板里写 <AppPage> 而没 import 时，Vue 会退化成运行期
   resolveComponent('AppPage')，生产构建里连警告都没有 —— 整页会静默渲染成空。 */
import AppPage from './AppPage.vue';

const hud = useHudContext();
const msg = hud.msg;
const pushAlert = hud.pushAlert;

/* 类别元数据：图标 + 中文短名（同时也是筛选按钮） */
const KINDS = [
  { id: 'all', icon: 'i-bell', label: '全部' },
  { id: 'tire', icon: 'i-tire', label: '胎压' },
  { id: 'weather', icon: 'i-cloud-bolt', label: '天气' },
  { id: 'fault', icon: 'i-history', label: '故障码' },
  { id: 'system', icon: 'i-warn', label: '系统' }
];
function kindMeta(k) {
  return KINDS.filter(function (x) { return x.id === k; })[0] || KINDS[0];
}

const kind = ref('all');
const onlyUnread = ref(false);
const openId = ref(0);

const list = computed(function () {
  return msg.list.filter(function (it) {
    if (kind.value !== 'all' && it.kind !== kind.value) return false;
    if (onlyUnread.value && it.read) return false;
    return true;
  });
});

function levelTag(level) {
  return level === 'red' ? 'tag--red' : (level === 'amber' ? 'tag--amber' : 'tag--dim');
}
function levelText(level) {
  return level === 'red' ? '危险' : (level === 'amber' ? '注意' : '提示');
}
function when(it) { return clockText(it.at) + ' · ' + agoText(it.at); }

function open(it) {
  openId.value = openId.value === it.id ? 0 : it.id;
  if (!it.read) hud.messages.markRead(it.id);
}
function markAll() { hud.messages.markAllRead(); }
function clearAll() { hud.messages.clear(); openId.value = 0; }
function drop(it) { hud.messages.remove(it.id); }

/* ---------------- 演示按钮：不用服务器也能把远程推送 / 故障码跑一遍 ----------------
   （胎压那个「立刻告警」按钮搬到了设置页 —— 那块实时读数也一起过去了） */
function demoWeather() { pushAlert(C.apps.push.demo[0]); }
function demoRoad() { pushAlert(C.apps.push.demo[1]); }
function demoFault() {
  hud.pushFault({ code: 'P0A2B', level: 'amber', title: '控制器限流保护', text: '瞬时电流超过保护阈值 · 已自动降功率', from: '整车自检' });
}
</script>

<template>
  <AppPage pid="msg" :status="msg.unread + ' UNREAD'">
    <template #actions>
      <button class="btn btn--sm" type="button" @click="markAll">全部已读</button>
      <button class="btn btn--sm" type="button" @click="clearAll">
        清空 <svg class="ico"><use href="#i-trash" /></svg>
      </button>
    </template>

    <!-- 系统消息列表（胎压胎温的实时读数 + 那两个演示按钮已经搬到
         「设置 → 胎压胎温」那一节，这里只留消息本身） -->
    <section class="card">
      <header class="card__hd">
        <svg class="ico"><use href="#i-bell" /></svg>系统消息 · INBOX
        <small><b id="msg-unread">{{ msg.unread }}</b> 未读 / 共 {{ msg.total }} 条</small>
      </header>
      <div class="card__body">
        <div class="row">
          <span class="seg">
            <button
              v-for="k in KINDS" :key="k.id" class="seg__btn"
              :class="{ 'is-on': kind === k.id }" type="button" @click="kind = k.id"
            >
              <svg class="ico"><use :href="'#' + k.icon" /></svg>{{ k.label }}
            </button>
          </span>
          <span class="spacer"></span>
          <button class="btn btn--sm" :class="{ 'is-on': onlyUnread }" type="button" @click="onlyUnread = !onlyUnread">
            只看未读
          </button>
        </div>

        <!-- 演示推送：不用服务器也能把「远程推送 / 故障码」两条链路跑一遍 -->
        <div class="row row--tight">
          <button class="btn btn--sm" type="button" @click="demoWeather">
            <svg class="ico"><use href="#i-cloud-bolt" /></svg>演示：天气骤变
          </button>
          <button class="btn btn--sm" type="button" @click="demoRoad">演示：路段管制</button>
          <button class="btn btn--sm" type="button" @click="demoFault">演示：故障码</button>
        </div>

        <div id="msg-list" class="plist msg__list">
          <div v-if="!list.length" class="empty">没有消息 · 一切正常</div>
          <article
            v-for="it in list" :key="it.id"
            class="msg__item" :class="{ 'is-open': openId === it.id, 'is-unread': !it.read }"
            @click="open(it)"
          >
            <span class="msg__dot" aria-hidden="true"></span>
            <svg class="ico msg__ico"><use :href="'#' + kindMeta(it.kind).icon" /></svg>
            <div class="msg__mid">
              <div class="msg__title">
                <b>{{ it.title }}</b>
                <span class="tag" :class="levelTag(it.level)">{{ levelText(it.level) }}</span>
                <span v-if="it.code" class="tag tag--dim">{{ it.code }}</span>
                <span v-if="it.count > 1" class="tag tag--amber">×{{ it.count }}</span>
              </div>
              <p class="msg__text">{{ it.text }}</p>
              <p v-if="openId === it.id" class="msg__meta">
                来源 {{ it.from || '系统' }} · {{ kindMeta(it.kind).label }} · {{ when(it) }}
              </p>
            </div>
            <span class="msg__time">{{ agoText(it.at) }}</span>
            <button class="btn btn--sm btn--ghost" type="button" title="删除这条" @click.stop="drop(it)">✕</button>
          </article>
        </div>
      </div>
    </section>

    <p class="note">
      接真车：把整车的提示丢进同一条管道就行 ——
      <code>EVA_HUD.pushMessage({ kind:'system', level:'amber', title:'…' })</code>；
      远程推送用 <code>EVA_HUD.pushAlert({ code:'WEATHER_ALERT', … })</code>
      （<b>code 命中 config.warnings 的那几条会同时弹顶部横幅</b>）；
      故障码用 <code>EVA_HUD.pushFault({ code:'P0xxx', … })</code>。
      同一个 code 在 30 秒内重复出现只算一条（次数 ×n），不会刷屏。
    </p>
  </AppPage>
</template>

<style scoped>
/* 胎压两轮横排那套样式（.tire*）已经跟着读数搬到 SettingsPage.vue 的 scoped 块里 */
.msg__list { max-height: 296px; overflow: auto; }
.msg__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, .06);
  border-radius: 7px;
  background: linear-gradient(90deg, rgba(255, 122, 24, .06), rgba(255, 122, 24, 0));
  transition: border-color .15s, background .15s;
}
.msg__item + .msg__item { margin-top: 5px; }
.msg__item:hover { border-color: rgba(255, 171, 61, .45); }
.msg__item.is-open { border-color: rgba(255, 192, 46, .55); background: rgba(255, 122, 24, .12); }
.msg__item.is-unread { background: linear-gradient(90deg, rgba(226, 0, 26, .18), rgba(226, 0, 26, .02)); }
.msg__dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .16);
}
.msg__item.is-unread .msg__dot { background: var(--c-amber); box-shadow: 0 0 8px rgba(255, 192, 46, .9); }
.msg__ico { flex: none; margin-top: 1px; color: var(--c-orange-2); }
.msg__mid { flex: 1 1 auto; min-width: 0; }
.msg__title { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.msg__title b { font-size: 13px; color: var(--ink); }
.msg__text { margin: 2px 0 0; font-size: 12px; color: var(--ink-2); }
.msg__meta { margin: 3px 0 0; font-size: 11px; color: var(--ink-3); letter-spacing: .05em; }
.msg__time { flex: none; font-size: 11px; color: var(--ink-3); font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  .msg__item { transition: none; }
}
</style>

