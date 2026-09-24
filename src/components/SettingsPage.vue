<script setup>
/*!
 * SettingsPage.vue — 设置（左侧灯塔第 5 个芯片）
 * ==================================================================
 * 四组内容：
 *   ① 胎压胎温：实时读数 + 前后轮各自的上限/下限/温度阈值（改完存浏览器、
 *      立刻参与告警裁决）+ 三个演示开关（慢漏气 / 升温 / 传感器掉线）
 *   ② 感应开关：坐垫感应（没坐稳不给起步）/ 边撑感应（放下边撑不让挂挡）
 *   ③ BMS：先给「环境自检」结论（Web Bluetooth 到底能不能用、为什么），
 *      再选保护板（蚂蚁 / 极空 / 嘉百达 / 彦阳）、连接、看数据与原始帧日志；
 *      没有真板子时用**演示数据包**（16 串）把界面跑起来
 *   ④ 消息与推送 + 软件版权信息（版本 / 技术栈 / 许可 / 免责声明）
 * 所有改动都进 hud.settings.state（响应式副本），useHud 自动存盘并同步给车辆。
 */
import { computed, reactive, ref, onBeforeUnmount } from 'vue';
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';
import { BOARDS, boardOf, env, demoPack, connect, buildPoll, JBD_FIELDS } from '../core/ble.js';
/* ⚠ 必须显式 import <AppPage>（理由见 MsgCenter.vue 里的同一行注释） */
import AppPage from './AppPage.vue';

const hud = useHudContext();
const view = hud.view;
const set = hud.settings.state;
const about = C.apps.about;

/* ============================ ① 胎压胎温 ============================ */
const wheels = C.apps.tire.wheels;
function live(w) {
  return w.id === 'front' ? view.tire.front : view.tire.rear;
}
function tireTier(w) {
  const L = set.tire.wheels[w.id];
  const x = live(w);
  if (x.kPa < L.kPaLow || x.temp >= L.tempHigh) return 'is-crit';
  if (x.kPa > L.kPaHigh || x.temp >= L.tempWarn) return 'is-warn';
  return 'is-ok';
}
function tirePct(w) {
  const x = live(w);
  const L = set.tire.wheels[w.id];
  const span = Math.max(1, L.kPaHigh - L.kPaLow);
  return Math.max(4, Math.min(100, Math.round((x.kPa - L.kPaLow) / span * 100)));
}
function num(v, lo, hi) {
  const n = Number(v);
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function resetTireLimits() {
  const d = hud.settings.defaults();
  wheels.forEach(function (w) {
    Object.assign(set.tire.wheels[w.id], d.tire.wheels[w.id]);
  });
}
function resetTireNow() {
  hud.vehicle.tire.wheels.front.kPa = C.apps.tire.seed.front.kPa;
  hud.vehicle.tire.wheels.rear.kPa = C.apps.tire.seed.rear.kPa;
  hud.vehicle.tire.wheels.front.temp = C.apps.tire.seed.front.temp;
  hud.vehicle.tire.wheels.rear.temp = C.apps.tire.seed.rear.temp;
  hud.refresh();
}

/* ============================ ③ BMS ============================ */
const bms = set.bms;
const board = computed(function () { return boardOf(bms.board); });
const capabilities = env();                 // 环境自检（只读一次，值不会变）
const poll = computed(function () { return buildPoll(bms.board); });

const st = reactive({
  pack: demoPack(bms.board, 0, { soc: 60, power: 0, name: bms.name }),
  source: 'demo',                          // demo | ble
  connected: false,
  link: null,
  log: [],
  error: '',
  note: poll.value.note
});

/* 演示数据随车走：放电变大电流、电量/温度跟着仪表走 */
let acc = 0;
const stopFrame = hud.registerFrame(function (v) {
  if (st.source !== 'demo' || !bms.demo) return;    // 关掉演示开关就冻住，等真机连接
  acc += 1 / 60;
  if (acc < 0.5) return;                   // 2Hz 足够
  acc = 0;
  st.pack = demoPack(bms.board, v.t, {
    soc: v.soc,
    power: v.power,
    temp: v.tire.wheels.rear.temp,
    name: bms.name
  });
});
onBeforeUnmount(function () { if (stopFrame) stopFrame(); });

/* 演示操作台（ControlPanel）是弹层：从设置页也能直接把它叫出来 */
const panelOpen = hud.panelOpen;
function openPanel() { panelOpen.value = true; }

function pickBoard(id) {
  bms.board = id;
  st.note = buildPoll(id).note;
  st.pack = demoPack(id, hud.vehicle.t, { soc: hud.vehicle.soc, power: hud.vehicle.power, name: bms.name });
  st.source = 'demo';
  st.log = [];
}

async function doConnect() {
  st.error = '';
  st.log = [];
  try {
    const link = await connect({
      board: bms.board,
      pollMs: Number(bms.pollMs) || 1500,
      namePrefix: '',
      onHex: function (line) {
        st.log.unshift(line);
        if (st.log.length > 30) st.log.pop();
      },
      onData: function (p) {
        st.pack = p;
        st.source = 'ble';
      },
      onState: function (s) {
        st.connected = s === 'online';
        if (!st.connected) st.source = 'demo';
      }
    });
    st.link = link;
    st.connected = true;
    st.note = link.pollNote;
  } catch (e) {
    st.error = '连接失败：' + (e.message || e);
  }
}

async function doDisconnect() {
  if (st.link) {
    try { await st.link.disconnect(); } catch (e) { /* 忽略 */ }
    st.link = null;
  }
  st.connected = false;
  st.source = 'demo';
}

function readOnce() {
  if (!st.link) { st.error = '先连上保护板'; return; }
  st.error = '';
  st.link.write().then(function (ok) {
    if (!ok) st.error = '这个型号没有可用的读取帧（见下方说明），只接收 BMS 主动上报';
  }).catch(function (e) {
    st.error = '写失败：' + (e.message || e);
  });
}

/* 每串电压：偏离平均值越多越红（压差那一列就是最大最小之差） */
const cells = computed(function () {
  const list = (st.pack && st.pack.cells) || [];
  const avg = list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : 0;
  return list.map(function (v, i) {
    const dev = v - avg;
    return {
      i: i + 1,
      v: v,
      dev: dev,
      tier: Math.abs(dev) > 0.03 ? 'is-crit' : (Math.abs(dev) > 0.015 ? 'is-warn' : 'is-ok')
    };
  });
});

const fmtV = function (v, d) { return v == null ? '—' : Number(v).toFixed(d == null ? 2 : d); };

/* ============================ 分节（第 10 轮） ============================
 * 设置页以前是「一列卡片往下排」，五项内容连成一条长滚动 —— 找一项要滚半天。
 * 现在按首页左灯塔那套平顶六边形芯片**分节**：左栏是节，右栏只显示当前这一节，
 * 每节都按正文高度（≈540px）排过版，所以整页不再上下滚。
 * ⚠ 选了哪一节是页面自己的界面状态 —— KeepAlive 让它切页 / 关掉之后再回来还在。 */
const SECTIONS = [
  { id: 'tire', icon: 'i-tire', label: '胎压胎温', en: 'TIRE' },
  { id: 'sensors', icon: 'i-seat', label: '感应开关', en: 'SENSORS' },
  { id: 'bms', icon: 'i-bms', label: '电池 BMS', en: 'BMS' },
  { id: 'msg', icon: 'i-bell', label: '消息推送', en: 'MESSAGES' },
  { id: 'about', icon: 'i-info', label: '软件信息', en: 'ABOUT' }
];
/* 初始分节：默认「胎压胎温」；地址栏 ?sec=bms 可以直达某一节（出图 / 冒烟用） */
function bootSec() {
  const hit = /[?&]sec=([a-z]+)/.exec(window.location.search || '');
  const id = hit ? hit[1] : '';
  return SECTIONS.filter(function (s) { return s.id === id; }).length ? id : 'tire';
}
const sec = ref(bootSec());

/* 「立刻胎压告警」（从消息中心搬过来的那个按钮）：直接把前轮气压压到下限以下，
   不用等「模拟漏气」的慢漏 —— 告警会立刻出现在横幅 + 消息中心。 */
function demoTire() {
  const t = hud.vehicle.tire.wheels.front;
  t.kPa = Math.max(80, Number(set.tire.wheels.front.kPaLow) - 12);
  hud.refresh();
}
</script>

<template>
  <AppPage pid="set" :status="view.tire.front.kPa + '/' + view.tire.front.temp + '℃'">
    <template #actions>
      <button class="btn btn--sm" type="button" title="演示操作台（键盘 O）" @click="openPanel()">操作台</button>
      <button class="btn btn--sm btn--ghost" type="button" @click="hud.settings.reset()">
        <svg class="ico"><use href="#i-refresh" /></svg>恢复默认
      </button>
    </template>

    <div class="setwrap">
      <!-- 左栏：分节芯片（和首页左灯塔同一套平顶六边形零件 + 同样的点亮色）。
           一次只显示一节 —— 设置页不再是「一条长滚动」。 -->
      <nav class="setnav">
        <button
          v-for="s in SECTIONS" :key="s.id"
          class="hexchip chip--hex" :class="{ 'is-on': sec === s.id }"
          type="button" :title="s.label + ' · ' + s.en"
          @click="sec = s.id"
        >
          <i class="chipbg"></i>
          <svg class="ico"><use :href="'#' + s.icon" /></svg>
          <span class="setnav__t">{{ s.label }}</span>
        </button>
      </nav>

      <div class="setbody">
        <template v-if="sec === 'tire'">
    <!-- ============================ ① 胎压胎温 ============================ -->
    <section class="card card--amber">
      <header class="card__hd">
        <svg class="ico"><use href="#i-tire" /></svg>胎压胎温监控 · TIRE MONITOR
        <small>{{ view.tire.sensor ? '传感器在线' : '信号丢失' }}</small>
      </header>
      <div class="card__body">
        <!-- 实时读数：从**消息中心**搬过来的那一块（两轮横排，一眼看到）
             + 两个「立刻见效」按钮（不用等「模拟漏气」那种慢漏） -->
        <div class="tlive">
          <div v-for="w in [view.tire.front, view.tire.rear]" :key="w.id" class="tlive__w">
            <b class="tlive__k">{{ w.name }}</b>
            <span class="tlive__v">{{ w.kPa }}<i>kPa</i></span>
            <span class="tlive__b">{{ w.bar }}<i>bar</i></span>
            <span class="tlive__t">{{ w.temp }}<i>℃</i></span>
            <span class="meter">
              <i
                class="meter__fill"
                :class="w.pct > 70 ? 'is-ok' : (w.pct > 45 ? 'is-warn' : 'is-crit')"
                :style="{ width: w.pct + '%' }"
              ></i>
            </span>
          </div>
        </div>
        <div class="row row--tight">
          <button class="btn btn--sm btn--hot" type="button" @click="demoTire">立刻胎压告警</button>
          <button class="btn btn--sm btn--ghost" type="button" @click="resetTireNow">
            <svg class="ico"><use href="#i-refresh" /></svg>恢复读数
          </button>
        </div>

        <div class="row">
          <button
            class="tgl" id="set-tire-monitor" :class="{ 'is-on': set.tire.monitor }" type="button"
            @click="set.tire.monitor = !set.tire.monitor"
          >
            <span class="tgl__track"><span class="tgl__dot"></span></span>
            <span class="tgl__txt">实时监控与上下限预警</span>
          </button>
          <span class="spacer"></span>
          <span class="tag" :class="set.tire.monitor ? 'tag--green' : 'tag--dim'">
            {{ set.tire.monitor ? '参与告警裁决' : '已关闭（不参与告警）' }}
          </span>
        </div>

        <div v-for="w in wheels" :key="w.id" class="trow">
          <div class="trow__live">
            <b class="trow__name">{{ w.name }}</b>
            <span class="trow__kpa">{{ live(w).kPa }}<i>kPa</i></span>
            <span class="trow__bar">{{ live(w).bar }}<i>bar</i></span>
            <span class="trow__temp">{{ live(w).temp }}<i>℃</i></span>
            <span class="meter trow__meter">
              <i class="meter__fill" :class="tireTier(w)" :style="{ width: tirePct(w) + '%' }"></i>
            </span>
          </div>
          <div class="tset">
            <label class="tset__f">
              <span>下限 kPa</span>
              <input
                class="fld fld--sm fld--num" type="number" min="80" max="400" step="5"
                :value="set.tire.wheels[w.id].kPaLow"
                @input="set.tire.wheels[w.id].kPaLow = num($event.target.value, 80, 400)"
              >
            </label>
            <label class="tset__f">
              <span>上限 kPa</span>
              <input
                class="fld fld--sm fld--num" type="number" min="150" max="450" step="5"
                :value="set.tire.wheels[w.id].kPaHigh"
                @input="set.tire.wheels[w.id].kPaHigh = num($event.target.value, 150, 450)"
              >
            </label>
            <label class="tset__f">
              <span>预警 ℃</span>
              <input
                class="fld fld--sm fld--num" type="number" min="20" max="100" step="1"
                :value="set.tire.wheels[w.id].tempWarn"
                @input="set.tire.wheels[w.id].tempWarn = num($event.target.value, 20, 100)"
              >
            </label>
            <label class="tset__f">
              <span>上限 ℃</span>
              <input
                class="fld fld--sm fld--num" type="number" min="25" max="120" step="1"
                :value="set.tire.wheels[w.id].tempHigh"
                @input="set.tire.wheels[w.id].tempHigh = num($event.target.value, 25, 120)"
              >
            </label>
          </div>
        </div>

        <div class="row row--tight">
          <button class="btn btn--sm" :class="{ 'is-on': set.tire.leak }" type="button" @click="set.tire.leak = !set.tire.leak">
            模拟漏气
          </button>
          <button class="btn btn--sm" :class="{ 'is-on': set.tire.heat }" type="button" @click="set.tire.heat = !set.tire.heat">
            模拟升温
          </button>
          <button class="btn btn--sm" :class="{ 'is-on': set.tire.drop }" type="button" @click="set.tire.drop = !set.tire.drop">
            模拟丢信号
          </button>
          <button class="btn btn--sm btn--ghost" type="button" @click="resetTireNow">复位读数</button>
          <button class="btn btn--sm btn--ghost" type="button" @click="resetTireLimits">阈值恢复默认</button>
        </div>
        <p class="note">
          阈值改完<b>立刻存浏览器</b>（键 <code>eva2.settings.v1</code>）并参与
          <code>state.warnings()</code> 的裁决：低于下限 → <code>TIRE_LEAK</code>、
          高于上限 → <code>TIRE_OVER</code>、到温度上限 → <code>TIRE_HOT</code>。
          关掉总开关后胎压不参与告警，读数照常显示。
        </p>
      </div>
    </section>

        </template>

        <template v-if="sec === 'sensors'">
    <!-- ============================ ② 感应开关 ============================ -->
    <section class="card">
      <header class="card__hd">
        <svg class="ico"><use href="#i-seat" /></svg>感应开关 · SENSORS
        <small>真车逻辑，不是显示开关</small>
      </header>
      <div class="card__body">
        <div class="row">
          <button
            class="tgl" id="set-sensors-seat" :class="{ 'is-on': set.sensors.seat }" type="button"
            @click="set.sensors.seat = !set.sensors.seat"
          >
            <span class="tgl__track"><span class="tgl__dot"></span></span>
            <span class="tgl__txt"><svg class="ico"><use href="#i-seat" /></svg>坐垫感应</span>
          </button>
          <span class="tag" :class="view.seatOn ? 'tag--green' : 'tag--amber'">
            {{ view.seatOn ? '已检测到人' : '无压力' }}
          </span>
          <span class="spacer"></span>
          <button
            class="tgl" id="set-sensors-kick" :class="{ 'is-on': set.sensors.kickstand }" type="button"
            @click="set.sensors.kickstand = !set.sensors.kickstand"
          >
            <span class="tgl__track"><span class="tgl__dot"></span></span>
            <span class="tgl__txt"><svg class="ico"><use href="#i-kickstand" /></svg>边撑感应</span>
          </button>
          <span class="tag" :class="view.kickstand ? 'tag--red' : 'tag--dim'">
            {{ view.kickstand ? '边撑已放下' : '边撑已收起' }}
          </span>
        </div>
        <p class="note">
          两个开关都<b>直接改车辆逻辑</b>：坐垫感应开着、又没坐稳时挂挡不给起步（
          <code>NO_SEAT</code> 红色告警，油门也被按住）；边撑感应开着时放下边撑挂挡被拒（
          <code>KICKSTAND</code>）。关掉感应就当「没有这个传感器」。键盘 <code>X</code>
          可以直接切换边撑状态来试。
        </p>
      </div>
    </section>

        </template>

        <template v-if="sec === 'bms'">
          <!-- BMS 两列：左边「连接 / 环境自检」，右边「实时数据 + 原始帧」 -->
          <div class="setcols">
    <!-- ============================ ③ BMS ============================ -->
    <section class="card">
      <header class="card__hd">
        <svg class="ico"><use href="#i-bms" /></svg>电池保护板 · BMS
        <small>{{ board.name }} · {{ st.source === 'ble' ? '真机数据' : '演示数据' }}</small>
      </header>
      <div class="card__body">

        <!-- 环境自检：先把「能不能连」说清楚 -->
        <div class="env" :class="'is-' + capabilities.verdict">
          <div class="env__hd">
            <svg class="ico"><use href="#i-info" /></svg>
            <b>环境自检 · {{ capabilities.headline }}</b>
            <span class="tag" :class="capabilities.verdict === 'yes' ? 'tag--green' : 'tag--red'">
              Web Bluetooth {{ capabilities.hasApi ? '已注册' : '不存在' }}
            </span>
            <span class="tag" :class="capabilities.secure ? 'tag--cyan' : 'tag--red'">
              安全上下文 {{ capabilities.secure ? 'OK' : '不满足' }}
            </span>
            <span class="tag tag--dim">{{ capabilities.browser }}</span>
          </div>
          <p class="note">{{ capabilities.advice }}</p>
        </div>

        <div class="row">
          <span class="seg">
            <button
              v-for="b in BOARDS" :key="b.id" class="seg__btn"
              :class="{ 'is-on': bms.board === b.id }" type="button" @click="pickBoard(b.id)"
            >
              <svg class="ico"><use href="#i-shield" /></svg>{{ b.name }} <i>{{ b.en }}</i>
            </button>
          </span>
        </div>
        <p class="note">
          {{ board.note }} —— UUID：<code>{{ board.notify }}</code>（通知）/
          <code>{{ board.write }}</code>（写入），{{ board.feature }}。
        </p>

        <div class="row">
          <button
            class="btn" :class="{ 'is-on': st.connected }" type="button"
            :disabled="capabilities.verdict !== 'yes'" @click="st.connected ? doDisconnect() : doConnect()"
          >
            <svg class="ico"><use href="#i-link" /></svg>{{ st.connected ? '断开保护板' : '连接保护板' }}
          </button>
          <button class="btn btn--sm" type="button" :disabled="!st.connected" @click="readOnce">
            <svg class="ico"><use href="#i-refresh" /></svg>读一帧
          </button>
          <span class="spacer"></span>
          <button class="tgl btn--sm" :class="{ 'is-on': bms.demo }" type="button" @click="bms.demo = !bms.demo">
            <span class="tgl__track"><span class="tgl__dot"></span></span>
            <span class="tgl__txt">演示数据</span>
          </button>
          <span class="fld__k">蓝牙名</span>
          <input class="fld fld--sm" style="max-width:132px" type="text" :value="bms.name" @input="bms.name = $event.target.value">
        </div>

        <p v-if="st.error" class="bms__msg is-err">{{ st.error }}</p>
        <p v-else-if="!st.connected" class="note">{{ st.note }}</p>
        <p v-if="st.connected" class="note">
          已连接 · {{ st.link && st.link.name }} · {{ st.note }}
        </p>
      </div>
    </section>

    <!-- ============================ ③b BMS 数据 ============================ -->
    <section class="card card--cyan">
      <header class="card__hd">
        <svg class="ico"><use href="#i-bms" /></svg>实时数据 · PACK
        <small>{{ st.pack.source === 'ble' ? '来自保护板' : '演示数据包' }}</small>
      </header>
      <div class="card__body">
        <div class="pk">
          <div class="pk__v"><span class="pk__k">总电压</span><b>{{ fmtV(st.pack.voltage) }}<i>V</i></b></div>
          <div class="pk__v">
            <span class="pk__k">电流</span>
            <b :class="{ 'is-neg': st.pack.current < 0 }">{{ fmtV(st.pack.current) }}<i>A</i></b>
          </div>
          <div class="pk__v"><span class="pk__k">功率</span><b>{{ fmtV(st.pack.power, 0) }}<i>W</i></b></div>
          <div class="pk__v">
            <span class="pk__k">压差</span>
            <b :class="{ 'is-warn': st.pack.delta > 0.03 }">{{ fmtV(st.pack.delta, 3) }}<i>V</i></b>
          </div>
          <div class="pk__v"><span class="pk__k">SOC</span><b>{{ st.pack.soc == null ? '—' : st.pack.soc }}<i>%</i></b></div>
          <div class="pk__v"><span class="pk__k">循环</span><b>{{ st.pack.cycles == null ? '—' : st.pack.cycles }}<i>次</i></b></div>
          <div class="pk__v">
            <span class="pk__k">剩余 / 额定</span>
            <b>{{ fmtV(st.pack.remainAh) }} / {{ fmtV(st.pack.designAh) }}<i>Ah</i></b>
          </div>
          <div class="pk__v">
            <span class="pk__k">温度 / MOS</span>
            <b>{{ fmtV(st.pack.temp, 1) }} / {{ fmtV(st.pack.mosTemp, 1) }}<i>℃</i></b>
          </div>
          <div class="pk__v"><span class="pk__k">SOH</span><b>{{ st.pack.soh == null ? '—' : st.pack.soh }}<i>%</i></b></div>
        </div>

        <div class="cells" id="set-bms-cells">
          <span
            v-for="c in cells" :key="c.i"
            class="cells__c" :class="c.tier"
            :title="'第 ' + c.i + ' 串 ' + fmtV(c.v, 3) + 'V（偏差 ' + fmtV(c.dev, 3) + 'V）'"
          >
            <em>{{ c.i }}</em>
            <b>{{ fmtV(c.v, 3) }}</b>
          </span>
        </div>

        <div class="row row--tight">
          <span class="tag" :class="st.pack.balanceOn ? 'tag--green' : 'tag--dim'">
            均衡 {{ st.pack.balanceOn ? '工作中' : '未工作' }}
          </span>
          <span class="tag" :class="st.pack.charge ? 'tag--green' : 'tag--dim'">充电 MOS</span>
          <span class="tag" :class="st.pack.discharge ? 'tag--green' : 'tag--dim'">放电 MOS</span>
          <span class="tag tag--amber">{{ st.pack.protector }}</span>
          <span class="tag tag--dim">截止 {{ st.pack.cutoffV }}V / 串</span>
        </div>

        <div class="log">
          <div class="log__hd">
            <b>原始帧</b>
            <span>{{ st.log.length }} 条 · {{ st.connected ? '实时' : '未连接' }}</span>
          </div>
          <pre class="log__body">{{ st.log.length ? st.log.join('\n') : '（连接保护板后这里会滚动显示收到的原始帧）' }}</pre>
        </div>

        <p class="note">
          <b>帧解析状态</b>：嘉百达 / 彦阳用的 DD A5 帧做了尽力解析（
          <code>verified: {{ JBD_FIELDS.verified }}</code> —— 字段偏移都写在
          <code>core/ble.js</code> 的 <code>JBD_FIELDS</code> 一处，实机抓包后对着改就行）；
          极空 / 蚂蚁目前<b>只记原始帧</b>（读取帧构造待实机校验），数据仍由演示包驱动。
          这就是「先做 UI」的意思：界面、字段、开关全就位，缺的只是实机核准偏移量。
        </p>
      </div>
    </section>

          </div><!-- /.setcols -->
        </template>

        <template v-if="sec === 'msg'">
    <!-- ============================ ④ 消息 + 推送 ============================ -->
    <section class="card">
      <header class="card__hd">
        <svg class="ico"><use href="#i-bell" /></svg>消息与推送 · MESSAGES
        <small>{{ hud.msg.unread }} 未读 / 共 {{ hud.msg.total }}</small>
      </header>
      <div class="card__body">
        <div class="row">
          <button class="tgl" :class="{ 'is-on': set.msg.push }" type="button" @click="set.msg.push = !set.msg.push">
            <span class="tgl__track"><span class="tgl__dot"></span></span>
            <span class="tgl__txt">接收远程推送（天气骤变预警等）</span>
          </button>
          <span class="spacer"></span>
          <button class="tgl" :class="{ 'is-on': set.msg.faults }" type="button" @click="set.msg.faults = !set.msg.faults">
            <span class="tgl__track"><span class="tgl__dot"></span></span>
            <span class="tgl__txt">记录历史故障码</span>
          </button>
          <button class="btn btn--sm btn--ghost" type="button" @click="hud.messages.markAllRead()">全部已读</button>
          <button class="btn btn--sm btn--ghost" type="button" @click="hud.messages.clear()">
            <svg class="ico"><use href="#i-trash" /></svg>清空消息
          </button>
        </div>
        <p class="note">
          远程推送入口是 <code>window.EVA_HUD.pushAlert(...)</code>（WebSocket / HTTP 拿到就调），
          <code>code</code> 命中 <code>config.warnings</code> 的会同时弹顶部横幅 ——
          <code>WEATHER_ALERT</code> 就是给「天气骤变预警」预留的那条。
        </p>
      </div>
    </section>

        </template>

        <template v-if="sec === 'about'">
    <!-- ============================ ⑤ 软件信息 ============================ -->
    <section class="card card--flat">
      <header class="card__hd">
        <svg class="ico"><use href="#i-info" /></svg>软件信息 · ABOUT
        <small id="set-about-version">{{ about.version }}</small>
      </header>
      <div class="card__body">
        <div class="kv">
          <span class="kv__k">名称</span>
          <span class="kv__v">{{ about.name }} <em>{{ about.cn }}</em></span>
        </div>
        <div class="kv">
          <span class="kv__k">版本</span>
          <span class="kv__v">{{ about.version }} <em>{{ about.stack }}</em></span>
        </div>
        <div class="kv"><span class="kv__k">作者</span><span class="kv__v">{{ about.author }}</span></div>
        <div class="kv"><span class="kv__k">许可</span><span class="kv__v">{{ about.license }}</span></div>
        <div class="kv">
          <span class="kv__k">第三方</span>
          <span class="kv__v">
            <span v-for="t in about.third" :key="t.name" class="tag tag--dim about__tag">{{ t.name }} · {{ t.license }}</span>
          </span>
        </div>
        <div class="kv">
          <span class="kv__k">浏览器缓存</span>
          <span class="kv__v">
            {{ hud.settings.storage ? '可用（设置与 key 都存在浏览器）' : '不可用（本次改动关掉页面就丢）' }}
          </span>
        </div>
        <p class="note about__copy">{{ about.copyright }}</p>
        <p class="note">{{ about.notice }}</p>
      </div>
    </section>
        </template>
      </div><!-- /.setbody -->
    </div><!-- /.setwrap -->
  </AppPage>
</template>

<style scoped>
/* ---------------- 胎压两行：实时读数 + 四个阈值输入 ---------------- */
.trow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 10px;
  padding: 7px 0;
  border-bottom: 1px dashed rgba(255, 255, 255, .07);
}
.trow:last-of-type { border-bottom: 0; }
.trow__live {
  display: grid;
  grid-template-columns: 42px 64px auto auto;
  align-items: baseline;
  gap: 6px;
  align-self: center;
}
.trow__name { font-size: 12px; color: var(--ink-2); }
.trow__kpa { font-family: var(--font-num); font-size: 18px; color: var(--c-amber); }
.trow__bar, .trow__temp { font-family: var(--font-num); font-size: 12px; color: var(--ink-2); }
.trow__live i { margin-left: 2px; font-size: 10px; color: var(--ink-3); }
.trow__meter { grid-column: 1 / -1; }

.tset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px 8px; align-content: center; }
.tset__f { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 5px; }
.tset__f span { font-size: 10px; letter-spacing: .04em; color: var(--ink-3); }

/* ---------------- 环境自检卡 ---------------- */
.env {
  padding: 8px 10px;
  margin-bottom: 8px;
  border: 1px solid rgba(255, 122, 24, .3);
  border-radius: 8px;
  background: rgba(255, 122, 24, .07);
}
.env.is-yes { border-color: rgba(57, 217, 138, .5); background: rgba(57, 217, 138, .08); }
.env.is-insecure, .env.is-no-api { border-color: rgba(255, 45, 61, .45); background: rgba(226, 0, 26, .1); }
.env__hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; }
.env__hd b { color: var(--ink); }
.env__hd .ico { width: 16px; height: 16px; color: var(--c-orange-2); }

/* ---------------- 电池包读数 + 每串电压网格 ---------------- */
.pk { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; margin-bottom: 9px; }
.pk__v {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 7px;
  background: rgba(255, 255, 255, .035);
  border-radius: 6px;
}
.pk__k { font-size: 10px; letter-spacing: .04em; color: var(--ink-3); }
.pk__v b { font-family: var(--font-num); font-size: 14px; color: var(--ink); font-variant-numeric: tabular-nums; }
.pk__v b i { margin-left: 2px; font-size: 10px; color: var(--ink-3); }
.pk__v b.is-neg { color: var(--c-green-2); }
.pk__v b.is-warn { color: var(--c-amber); }

.cells { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; margin-bottom: 9px; }
.cells__c {
  display: grid;
  gap: 1px;
  padding: 4px 2px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 6px;
  background: rgba(255, 255, 255, .03);
}
.cells__c em { font-size: 9px; font-style: normal; color: var(--ink-3); }
.cells__c b { font-family: var(--font-num); font-size: 11px; color: var(--ink); }
.cells__c.is-ok { border-color: rgba(57, 217, 138, .4); }
.cells__c.is-warn { border-color: rgba(255, 192, 46, .6); background: rgba(255, 192, 46, .1); }
.cells__c.is-crit { border-color: rgba(255, 45, 61, .7); background: rgba(226, 0, 26, .16); }
.cells__c.is-crit b { color: #ffb0a0; }

/* ---------------- 原始帧日志 ---------------- */
.log { margin-top: 8px; border: 1px dashed rgba(255, 122, 24, .28); border-radius: 7px; overflow: hidden; }
.log__hd {
  display: flex;
  justify-content: space-between;
  padding: 4px 9px;
  font-size: 10px;
  letter-spacing: .08em;
  color: var(--ink-3);
  background: rgba(255, 122, 24, .08);
}
.log__hd b { color: var(--c-orange-2); letter-spacing: .12em; }
.log__body {
  max-height: 92px;
  margin: 0;
  padding: 6px 9px;
  overflow: auto;
  font-family: var(--font-num);
  font-size: 10px;
  line-height: 1.5;
  color: #ffd9a0;
  background: rgba(0, 0, 0, .35);
  white-space: pre-wrap;
  word-break: break-all;
}
.bms__msg { margin: 8px 0 0; font-size: 11px; color: var(--c-amber); }
.bms__msg.is-err { color: #ffb0a0; }

.about__copy { color: var(--c-amber); letter-spacing: .08em; }
.about__tag { margin: 0 4px 0 0; }

/* ============================ 分节布局（左栏节 + 右栏正文） ============================
   左栏复用首页左灯塔的六边形零件（.hexchip / .chipbg 来自 base.css），
   右栏只放当前这一节 —— 整页不再上下滚（每节都按正文高度排过版）。 */
.setwrap {
  display: grid;
  grid-template-columns: 206px minmax(0, 1fr);
  gap: 14px;
  height: 100%;
}

.setnav {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 0;
  height: 100%;
  align-content: start;
}

.setnav .hexchip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 46px;
  padding: 0 10px 0 6px;
  cursor: pointer;
  color: var(--ink-2);
  background: none;
  border: 0;
  text-align: left;
  transition: color .18s;
}

.setnav .hexchip .ico {
  position: relative;
  z-index: 1;
  width: 20px;
  height: 20px;
  margin-left: 6px;
  stroke-width: 1.9;
}

/* 芯片本体只占左侧一小块（图标那格），文字在它右边 —— 和灯塔同款平顶六边形 */
.setnav .hexchip .chipbg {
  position: absolute;
  left: 0;
  top: 50%;
  right: auto;
  bottom: auto;
  width: 44px;
  height: 38px;
  margin-top: -19px;
}

.setnav__t {
  position: relative;
  z-index: 1;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .06em;
  margin-left: 6px;
}

.setnav__t::after {
  content: attr(data-en);
}

.setnav .hexchip:hover { color: #ffe9d6; }

.setnav .hexchip.is-on { color: var(--c-amber); }

.setnav .hexchip.is-on .chipbg {
  background: linear-gradient(180deg, #ffe08a 0%, #ff8a1e 55%, #c8131f 100%);
}

.setnav .hexchip.is-on .chipbg::after {
  background: linear-gradient(180deg, rgba(56, 20, 4, .92), rgba(14, 5, 2, .95));
}

.setnav .hexchip.is-on .ico { filter: drop-shadow(0 0 7px rgba(255, 192, 46, .85)); }

/* 右栏：当前节的正文（BMS 那节自己再分两列，见 .setcols） */
.setbody {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.setcols {
  display: grid;
  grid-template-columns: minmax(0, 400px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

/* 从消息中心搬过来的「实时读数」条（两轮横排：kPa / bar / ℃ + 细进度条） */
.tlive { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 9px; }
.tlive__w {
  display: grid;
  grid-template-columns: 42px 68px auto auto;
  align-items: baseline;
  gap: 6px;
  padding: 5px 8px;
  background: rgba(255, 122, 24, .08);
  border: 1px solid rgba(255, 122, 24, .2);
  border-radius: 7px;
}
.tlive__k { font-size: 12px; color: var(--ink-2); }
.tlive__v { font-family: var(--font-num); font-size: 18px; color: var(--c-amber); }
.tlive__b, .tlive__t { font-family: var(--font-num); font-size: 12px; color: var(--ink-2); }
.tlive__v i, .tlive__b i, .tlive__t i { margin-left: 2px; font-size: 10px; color: var(--ink-3); }
.tlive__w .meter { grid-column: 1 / -1; }

@media (prefers-reduced-motion: reduce) {
  .cells__c { transition: none; }
  .setnav .hexchip { transition: none; }
}
</style>
