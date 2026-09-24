<script setup>
/*!
 * NavPage.vue — 导航（左侧灯塔第 2 个芯片）
 * ==================================================================
 * 三家地图供应商 × 四种出行模式，界面只认 core/nav.js 归一化后的那一套数据：
 *   ① 供应商：高德 / 百度 / 腾讯（key 可填、存浏览器；config 里带了默认值）
 *   ② 模式：汽车 / 公交 / **骑行（默认优先）** / 步行
 *   ③ 起终点：默认取 config.apps.nav 的演示点，可搜地名（走供应商 POI 接口）、
 *      可用浏览器定位（navigator.geolocation）取「当前位置」
 *   ④ 规划：叫接口 → 归一化；被 CORS 拦 / 没 key / 结构不认识 → **直线估算兜底**
 *      （界面会明确标出是 api 还是 approx，绝不假装是真实路线）
 *   ⑤ 开始导航：按车辆实时车速在路线步骤上推进（剩余距离 / 下一步 / 进度条），
 *      到达目的地时往消息中心push一条 —— 这就是「导航和仪表联动」那条链路。
 */
import { computed, reactive, onBeforeUnmount } from 'vue';
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';
import {
  PROVIDERS, MODES, providerOf, modeOf, keyOf, maskKey, buildUrl, planRoute, searchPlace,
  approxRoute, formatDistance, formatDuration, geolocate, explain, haversineKm
} from '../core/nav.js';
/* ⚠ 必须显式 import <AppPage>（理由见 MsgCenter.vue 里的同一行注释） */
import AppPage from './AppPage.vue';

const hud = useHudContext();
const cfg = C.apps.nav;
const nav = hud.settings.state.nav;          // 响应式设置副本（provider / mode / keys / city）

/* ---------------------------- 本地 UI 状态 ---------------------------- */
const st = reactive({
  from: { name: cfg.origin.name, lng: cfg.origin.lng, lat: cfg.origin.lat },
  to: { name: cfg.dest.name, lng: cfg.dest.lng, lat: cfg.dest.lat },
  keyword: '',
  places: [],
  busy: false,
  step: '',                    // 正在干什么（界面上的状态行）
  error: '',
  route: null,                 // { kind, distance, duration, steps }
  picked: 0,
  guide: { on: false, left: 0, travel: 0, stepIdx: 0, done: false }
});

const provider = computed(function () { return providerOf(nav.provider); });
const mode = computed(function () { return modeOf(nav.mode); });
const keyNow = computed(function () { return keyOf(nav.keys, nav.provider); });
const keySaved = computed(function () {
  const fromCfg = String((cfg.keys || {})[nav.provider] || '');
  return !!fromCfg && fromCfg === keyNow.value;
});
const straightKm = computed(function () { return haversineKm(st.from, st.to); });

const status = computed(function () {
  if (st.busy) return 'PLANNING…';
  if (!st.route) return 'STANDBY';
  return (st.route.kind === 'api' ? 'API' : 'APPROX') + ' · ' + formatDistance(st.route.distance);
});

/* ---------------------------- 设置（自动存浏览器） ---------------------------- */
function setProvider(id) { nav.provider = id; st.route = null; st.error = ''; }
function setMode(id) { nav.mode = id; st.route = null; st.error = ''; }
function setKey(v) { nav.keys[nav.provider] = v; }
function clearKey() { nav.keys[nav.provider] = ''; }
function setTransport(t) { nav.transport = t; }
function setProxy(v) { nav.proxy = v; }
function swap() {
  const a = st.from;
  st.from = st.to;
  st.to = a;
  st.route = null;
}

/* ---------------------------- 规划路线 ---------------------------- */
function useApprox(why) {
  st.route = approxRoute(st.from, st.to, nav.mode);
  st.error = why + ' → 已用「直线估算」（不是真实路线）';
}

async function plan() {
  if (st.busy) return;
  st.busy = true;
  st.error = '';
  st.route = null;
  st.step = '请求 ' + provider.value.name + ' · ' + mode.value.name;
  try {
    if (!keyNow.value) {
      useApprox(provider.value.name + ' 没填 key');
    } else {
      const r = await planRoute({
        provider: nav.provider,
        mode: nav.mode,
        keys: nav.keys,
        city: nav.city,
        from: st.from,
        to: st.to,
        transport: nav.transport,
        proxy: nav.proxy
      });
      st.route = r;
      st.step = provider.value.name + ' 返回 ' + r.steps.length + ' 段路线';
    }
  } catch (e) {
    useApprox(explain(e));
  } finally {
    st.busy = false;
  }
}

/* 只算直线（不请求接口，断网也能看） */
function planStraight() {
  st.error = '';
  st.step = '本地直线估算';
  st.route = approxRoute(st.from, st.to, nav.mode);
}

/* ---------------------------- 搜地名 / 定位 ---------------------------- */
async function search() {
  const kw = st.keyword.trim();
  if (!kw || st.busy) return;
  st.busy = true;
  st.error = '';
  st.step = '搜索「' + kw + '」';
  try {
    if (!keyNow.value) throw new Error('没填 ' + provider.value.name + ' 的 key');
    st.places = await searchPlace({
      provider: nav.provider, keys: nav.keys, city: nav.city, keyword: kw,
      transport: nav.transport, proxy: nav.proxy
    });
    st.step = '搜到 ' + st.places.length + ' 个地点';
    st.error = st.places.length ? '' : '没有结果（换个关键词或换城市）';
  } catch (e) {
    st.places = [];
    st.error = explain(e);
  } finally {
    st.busy = false;
  }
}

function pickPlace(p) {
  st.to = { name: p.name, lng: p.lng, lat: p.lat };
  st.places = [];
  st.keyword = '';
  st.route = null;
}

async function locate() {
  st.error = '';
  st.step = '读取浏览器定位…';
  try {
    const p = await geolocate();
    st.from = { name: '当前位置（±' + p.acc + 'm）', lng: p.lng, lat: p.lat };
    st.step = '定位成功';
    st.route = null;
  } catch (e) {
    st.error = String(e.message || e);
    st.step = '';
  }
}

/* ---------------------------- 开始导航（跟着车走） ---------------------------- */
/* 推进用的是 vehicle.odo 的增量 —— 和仪表上的总里程同一个来源，
   所以「车速快就前进快」是天然成立的，不用再猜帧率。 */
let unregister = null;
let lastOdo = 0;

function routeTotal(r) {
  let sum = 0;
  (r.steps || []).forEach(function (s) { sum += s.distance || 0; });
  return sum || r.distance || 0;
}

function startGuide() {
  if (!st.route) return;
  const total = routeTotal(st.route);
  st.guide.on = true;
  st.guide.done = false;
  st.guide.travel = 0;
  st.guide.total = total;
  st.guide.left = total;
  lastOdo = hud.vehicle.odo;
  st.step = '导航中 · 按车辆实时里程推进';
  if (!unregister) {
    unregister = hud.registerFrame(function (v) {
      if (!st.guide.on) return;
      const d = Math.max(0, (v.odo - lastOdo) * 1000);       // km → m
      lastOdo = v.odo;
      st.guide.travel += d;
      st.guide.left = Math.max(0, st.guide.total - st.guide.travel);
      if (st.guide.left <= 1) arrive();
    });
  }
}

function arrive() {
  st.guide.on = false;
  st.guide.done = true;
  st.guide.left = 0;
  hud.pushMessage({
    kind: 'system',
    level: 'info',
    title: '已到达目的地',
    text: st.to.name + ' · ' + provider.value.name + ' ' + mode.value.name + '导航结束',
    from: '导航'
  });
  if (unregister) { unregister(); unregister = null; }
}

function stopGuide() {
  st.guide.on = false;
  if (unregister) { unregister(); unregister = null; }
}

onBeforeUnmount(stopGuide);

/* 当前该走哪一段 / 还剩多远 */
const stepNow = computed(function () {
  const r = st.route;
  if (!r) return null;
  let acc = 0;
  for (let i = 0; i < r.steps.length; i++) {
    const s = r.steps[i];
    acc += s.distance || 0;
    if (st.guide.travel < acc) {
      return { idx: i, text: s.text, into: acc - st.guide.travel, total: r.steps.length };
    }
  }
  const last = r.steps[r.steps.length - 1];
  return { idx: r.steps.length - 1, text: last.text, into: 0, total: r.steps.length };
});

const progressPct = computed(function () {
  if (!st.route) return 0;
  const total = routeTotal(st.route) || 1;
  return Math.min(100, Math.round(st.guide.travel / total * 100));
});
</script>

<template>
  <AppPage pid="nav" :status="status">
    <template #actions>
      <button
        class="btn btn--sm" :class="{ 'is-on': nav.transport === 'jsonp' }" type="button"
        :title="'传输方式：' + nav.transport + '（fetch 失败自动退 JSONP）'"
        @click="setTransport(nav.transport === 'auto' ? 'jsonp' : (nav.transport === 'jsonp' ? 'fetch' : 'auto'))"
      >{{ nav.transport.toUpperCase() }}</button>
    </template>

    <div class="page__cols">

      <!-- ==================== 左列：供应商 / 模式 / 起终点 ==================== -->
      <div>
        <section class="card card--amber">
          <header class="card__hd">
            <svg class="ico"><use href="#i-key" /></svg>地图供应商 · PROVIDER
            <small>{{ provider.name }}</small>
          </header>
          <div class="card__body">
            <div class="row">
              <span class="seg">
                <button
                  v-for="p in PROVIDERS" :key="p.id" class="seg__btn"
                  :class="{ 'is-on': nav.provider === p.id }" type="button" @click="setProvider(p.id)"
                >
                  {{ p.short }} <i>{{ p.en }}</i>
                </button>
              </span>
              <span class="spacer"></span>
              <span class="tag" :class="keyNow ? 'tag--green' : 'tag--red'">{{ keyNow ? 'KEY 已就绪' : '缺 KEY' }}</span>
              <span v-if="keySaved" class="tag tag--amber">config 默认值</span>
            </div>

            <div class="row">
              <span class="fld__k">{{ provider.keyLabel }}</span>
              <input
                id="nav-key" class="fld" type="text" spellcheck="false" autocomplete="off"
                :value="keyNow" :placeholder="provider.keyHint"
                @input="setKey($event.target.value)"
              >
              <button class="btn btn--sm" type="button" title="清空这一家的 key" @click="clearKey">清除</button>
            </div>
            <p class="note">
              key <b>只在浏览器里用</b>（localStorage 缓存，键 <code>eva2.settings.v1</code>）——
              当前值 <code>{{ maskKey(keyNow) }}</code>，重新打开页面还在。
              {{ provider.note }}；申请入口 <code>{{ provider.reg }}</code>。
              被 CORS 拦下时可以在这儿填代理，或点右上角切到 JSONP。
            </p>
            <div class="row">
              <span class="fld__k">代理</span>
              <input
                class="fld" type="text" spellcheck="false"
                placeholder="http://127.0.0.1:8787/?url={url}（留空 = 直连）"
                :value="nav.proxy" @input="setProxy($event.target.value)"
              >
            </div>
          </div>
        </section>

        <section class="card">
          <header class="card__hd">
            <svg class="ico"><use href="#i-route" /></svg>出行模式 · MODE
            <small>骑行默认优先</small>
          </header>
          <div class="card__body">
            <div class="row">
              <span class="seg">
                <button
                  v-for="m in MODES" :key="m.id" class="seg__btn"
                  :class="{ 'is-on': nav.mode === m.id }" type="button" @click="setMode(m.id)"
                >
                  <svg class="ico"><use :href="'#' + m.icon" /></svg>{{ m.name }} <i>{{ m.en }}</i>
                  <small v-if="m.prefer">优先</small>
                </button>
              </span>
            </div>
            <p class="note">
              骑行 = 电动车 / 自行车（高德走 <code>v4/bicycling</code>、百度走 <code>riding</code>、
              腾讯走 <code>bicycling</code>）；公交需要城市名，当前 <code>{{ nav.city }}</code>。
            </p>
          </div>
        </section>

        <section class="card">
          <header class="card__hd">
            <svg class="ico"><use href="#i-locate" /></svg>起终点 · ORIGIN / DEST
            <small>直线 {{ straightKm.toFixed(2) }} km</small>
          </header>
          <div class="card__body">
            <div class="row">
              <span class="fld__k">起点</span>
              <input class="fld" type="text" :value="st.from.name" @input="st.from.name = $event.target.value">
              <button class="btn btn--sm" type="button" @click="locate">
                <svg class="ico"><use href="#i-locate" /></svg>定位
              </button>
            </div>
            <div class="row">
              <span class="fld__k">终点</span>
              <input class="fld" type="text" :value="st.to.name" @input="st.to.name = $event.target.value">
              <button class="btn btn--sm" type="button" title="起终点对调" @click="swap">⇅</button>
            </div>
            <div class="row">
              <span class="fld__k">搜地点</span>
              <input
                id="nav-keyword" class="fld" type="text" placeholder="例如：九号门店 / 加油站"
                :value="st.keyword" @input="st.keyword = $event.target.value" @keyup.enter="search"
              >
              <button class="btn btn--sm" type="button" @click="search">
                <svg class="ico"><use href="#i-search" /></svg>搜索
              </button>
            </div>

            <div v-if="st.places.length" class="plist nav__places">
              <button v-for="(p, i) in st.places" :key="i" class="plist__row" type="button" @click="pickPlace(p)">
                <svg class="ico"><use href="#i-route" /></svg>
                <b>{{ p.name }}</b><i>{{ p.address }}</i>
              </button>
            </div>

            <div class="row">
              <button class="btn" type="button" :disabled="st.busy" @click="plan">
                <svg class="ico"><use href="#i-search" /></svg>规划路线（{{ provider.short }} · {{ mode.name }}）
              </button>
              <button class="btn btn--ghost" type="button" @click="planStraight">本地直线</button>
              <span class="spacer"></span>
              <button v-if="!st.guide.on" class="btn" type="button" :disabled="!st.route" @click="startGuide">
                <svg class="ico"><use href="#i-play" /></svg>开始导航
              </button>
              <button v-else class="btn btn--hot is-on" type="button" @click="stopGuide">
                <svg class="ico"><use href="#i-pause" /></svg>结束导航
              </button>
            </div>

            <p v-if="st.step || st.error" class="nav__status" :class="{ 'is-err': !!st.error }">
              {{ st.error || st.step }}
            </p>
          </div>
        </section>
      </div>

      <!-- ==================== 右列：导航指引 + 路线步骤 ==================== -->
      <div>
        <section class="card" :class="{ 'card--amber': !!st.route }">
          <header class="card__hd">
            <svg class="ico"><use href="#i-nav" /></svg>导航指引 · GUIDE
            <small>{{ st.route ? (st.route.kind === 'api' ? st.route.provider.toUpperCase() : '直线估算') : '等待规划' }}</small>
          </header>
          <div class="card__body">
            <template v-if="st.route">
              <div class="guide">
                <span class="guide__now">{{ stepNow ? stepNow.text : '—' }}</span>
                <span v-if="stepNow" class="guide__into">
                  本段还剩 {{ formatDistance(stepNow.into) }} · 第 {{ stepNow.idx + 1 }}/{{ stepNow.total }} 段
                </span>
                <span class="guide__left">{{ formatDistance(st.guide.left) }}</span>
                <span class="guide__eta">
                  全程 {{ formatDistance(st.route.distance) }} · 约 {{ formatDuration(st.route.duration) }}
                </span>
                <span class="meter"><i class="meter__fill is-ok" :style="{ width: progressPct + '%' }"></i></span>
              </div>
            </template>
            <div v-else class="empty">先规划一条路线</div>
          </div>
        </section>

        <section v-if="st.route" class="card">
          <header class="card__hd">
            <svg class="ico"><use href="#i-route" /></svg>路线步骤 · STEPS
            <small>{{ st.route.steps.length }} 段</small>
          </header>
          <div class="card__body">
            <div class="plist nav__steps">
              <div
                v-for="(s, i) in st.route.steps" :key="i"
                class="plist__row" :class="{ 'is-on': st.guide.on && stepNow && stepNow.idx === i }"
              >
                <b class="nav__idx">{{ i + 1 }}</b>
                <span class="nav__txt">{{ s.text }}</span>
                <i>{{ formatDistance(s.distance) }}</i>
              </div>
            </div>
            <p v-if="st.route.kind === 'approx'" class="note">
              这是<b>直线估算</b>：距离 = 直线 × 道路系数（{{ mode.name }} {{ mode.factor }}），
              耗时按 {{ mode.speed }} km/h 估。填对 key（或配上代理）就会换成真实路线。
            </p>
          </div>
        </section>
      </div>
    </div>
  </AppPage>
</template>

<style scoped>
/* 导航页专属排版：搜出的地点列表 / 路线步骤 / 指引卡（其余用公共零件） */
.nav__places { max-height: 150px; overflow: auto; margin-top: 8px; }
.nav__places b { font-size: 12px; color: var(--ink); }
.nav__places i { margin-left: auto; font-size: 10px; }

.nav__status { margin: 8px 0 0; font-size: 11px; letter-spacing: .04em; color: var(--c-amber); }
.nav__status.is-err { color: #ffb0a0; }

.guide { display: grid; gap: 5px; }
.guide__now { font-size: 14px; font-weight: 600; color: var(--ink); }
.guide__into { font-size: 11px; color: var(--ink-2); }
.guide__left {
  font-family: var(--font-num);
  font-size: 30px;
  line-height: 1.05;
  color: var(--c-amber);
  text-shadow: 0 0 16px rgba(255, 192, 46, .45);
}
.guide__eta { font-size: 11px; color: var(--ink-3); }
.guide .meter { margin-top: 3px; }

.nav__steps { max-height: 326px; overflow: auto; }
.nav__steps .plist__row { align-items: baseline; }
.nav__idx {
  flex: none;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  font-family: var(--font-num);
  font-size: 11px;
  color: var(--c-amber);
  border: 1px solid rgba(255, 192, 46, .5);
  border-radius: 5px;
}
.nav__txt { flex: 1 1 auto; min-width: 0; }
.nav__steps i { flex: none; }

.nav__places::-webkit-scrollbar,
.nav__steps::-webkit-scrollbar { width: 7px; }
.nav__places::-webkit-scrollbar-thumb,
.nav__steps::-webkit-scrollbar-thumb { background: rgba(255, 171, 61, .55); border-radius: 4px; }
</style>

