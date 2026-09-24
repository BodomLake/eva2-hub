<script setup>
/*!
 * ControlPanel.vue — 操作弹框（演示台）
 * ==================================================================
 * 点按钮决定「现在演示什么」：挡位 / 车速 / 仪表提示 / 消耗氮气 /
 * 急加速 / 急减速 / 滑行 / 车灯开关 / 电量温度 / 自动驾驶 开关。
 *
 * 两条写入路径，全部复用真车那套物理与业务规则，不另造一套假状态：
 *   ① send(cmd) + dispatch() → 塞进 input 的指令队列并立刻走一帧，
 *      交给 state.update() 处理（挡位、转向灯、双闪、龙头锁、USB、音源、
 *      强制告警 forceWarn …）
 *   ② 直接写 vehicle 字段 + refresh() → 用于滑块这类「连续量」
 *      （电量 soc、氮气 nos、电机温度 motorTemp、定速目标 cruiseSpeed …）
 * 任何一次操作都会先暂停「演示自动驾驶」（vehicle.auto.enabled = false），
 * 否则它会在几秒后重新抢走方向盘；面板顶部有开关可以随时恢复。
 *
 * 打开：左灯塔「设置」六边形芯片 / 键盘 O / ?panel=1（出图、冒烟测试）。
 * 关闭：右上角 ✕ / 键盘 O / Esc。
 */
import { computed } from 'vue';
import { CONFIG as C, clamp } from '../config.js';
import { useHudContext } from '../composables/useHud.js';

const hud = useHudContext();
const view = hud.view;
const vehicle = hud.vehicle;
const panelOpen = hud.panelOpen;
const send = hud.send;
const hold = hud.hold;
const refresh = hud.refresh;      // 纯重绘（写完字段用）
const dispatch = hud.dispatch;    // 消费指令 + 刷一帧（send 之后用）

/* ============================ 基础动作 ============================ */

/* 面板一动，就暂停自动驾驶演示（不然它几秒后又把挡位 / 车速改回去） */
function pauseAuto() { vehicle.auto.enabled = false; }

/* 走 cmd 通道：交给 state.update() 按真车规则处理（可能被拒绝并告警）。
   dispatch() 让「出图模式（不跑主循环）」下也能立刻看到结果 */
function act(cmd) {
  pauseAuto();
  send(cmd);
  dispatch();
}

/* 直接改车辆状态（滑块 / 瞬时量） */
function apply(patch) {
  pauseAuto();
  for (const k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) vehicle[k] = patch[k];
  }
  refresh();
}

function close() { panelOpen.value = false; }

/* ============================ 挡位 ============================ */
const gears = computed(function () {
  return [{ code: C.vehicle.parkGear, name: '驻车' }].concat(
    C.vehicle.gearOrder.map(function (code) {
      return { code: code, name: C.vehicle.gears[code].name };
    })
  );
});

function setGear(code) { act({ gear: code }); }

/* 想动起来但还挂在 P 挡时：自动切回上次的骑行挡位（没有就退到挡位表第一个） */
function ensureRide(prefer) {
  if (vehicle.gear !== C.vehicle.parkGear) return;
  const last = C.vehicle.gearOrder.indexOf(vehicle.gearLast) >= 0
    ? vehicle.gearLast : C.vehicle.gearOrder[0];
  act({ gear: prefer || last });
}

/* ============================ 车速 / 定速 ============================ */
/* 车速不是「直接赋值」出来的：写巡航目标，再由 update() 的物理去逼近。
   目标 ≤ 3km/h 视为停车（巡航自动退出，靠滑行 / 制动停下） */
function setCruise(kmh) {
  const v = clamp(Number(kmh) || 0, 0, 60);
  pauseAuto();
  vehicle.cruiseSpeed = v;
  vehicle.lamps.cruise = v > 3;
  if (v > 3) ensureRide();
  refresh();
}

function releaseCruise() {
  vehicle.lamps.cruise = false;
  vehicle.cruiseSpeed = 0;
}

/* 急加速：切到功率上限最高的挡位 + 满油门脉冲（功率弧会直接打满） */
function hardAccel() {
  pauseAuto();
  releaseCruise();
  ensureRide('F');
  const ride = vehicle.gear === C.vehicle.parkGear ? vehicle.gearLast : vehicle.gear;
  const def = C.vehicle.gears[ride];
  /* 不在最高功率的挡位上就先切过去（把上限从 config 读出来，别写死 1500：
     功率表满量程 10kW 之后，C 挡的 3200W 也算「不够猛」） */
  const maxCap = C.vehicle.gears[C.vehicle.gearOrder[C.vehicle.gearOrder.length - 1]].powerCap;
  if (!def || def.powerCap < maxCap) act({ gear: 'F' });
  hold(1, 2600);
  refresh();
}

/* 急减速：满制动 → 触发能量回收（功率弧走绿、氮气回充） */
function hardBrake() {
  pauseAuto();
  releaseCruise();
  hold(-1, 2400);
  refresh();
}

/* 松油门滑行 */
function coast() {
  pauseAuto();
  releaseCruise();
  hold(0, 2800);
  refresh();
}

/* ============================ 仪表提示（告警） ============================ */
/* 直接点 config.warnings 里的任意一条：走 cmd.forceWarn，横幅 / READY 铭牌 /
   左下「消息」芯片 三处会同时响应（和真告警完全一样的显示链路） */
const warnList = Object.keys(C.warnings)
  .sort(function (a, b) { return C.warnings[b].priority - C.warnings[a].priority; })
  .map(function (id) {
    return { id: id, label: C.warnings[id].label, level: C.warnings[id].level };
  });

function setWarn(id) { act({ forceWarn: id }); }
function clearWarn() { act({ forceWarn: null }); }

/* ============================ 能量 / 环境 ============================ */
function setSoc(v) { apply({ soc: clamp(Number(v) || 0, 0, 100) }); }
function setNos(v) { apply({ nos: clamp(Number(v) || 0, 0, 100) }); }
function drainNos() { apply({ nos: clamp(Math.round(vehicle.nos) - 15, 0, 100) }); }
function setTemp(v) { apply({ motorTemp: clamp(Number(v) || 0, C.thermal.ambient, C.thermal.max) }); }

const weatherKeys = Object.keys(C.weather.icons);
function setWeather(k) { apply({ weather: k }); }

/* ============================ 车灯 / 开关 ============================ */
function toggleLamp(k) { act({ toggleLamp: k }); }
function toggleMedia() { act({ mediaFlip: true }); }
function turn(dir) { act({ turn: dir }); }
function hazard() { act({ hazardFlip: true }); }
function toggleHigh() {
  const high = !vehicle.lamps.beamHigh;
  act({ setLamp: { beamHigh: high, beamLow: !high } });
}

/* ============================ 演示 / 整车 ============================ */
function resumeAuto() {
  vehicle.auto.enabled = true;
  refresh();
}
function togglePower() { apply({ powered: !vehicle.powered }); }
/* 回到 config.seed = 参考照片那一帧（P 挡 / 51% / 100% 氮气 / 116℃…） */
function resetSeed() { apply(Object.assign({ forceWarn: null }, C.seed)); }
</script>

<template>
  <div v-if="panelOpen" class="panel" id="panel" role="dialog" aria-modal="true" aria-label="操作台">
    <header class="panel__bar">
      <b>操作台</b>
      <span class="panel__en">DEMO CONTROL</span>
      <em class="panel__auto" :class="{ 'is-off': !view.autoDemo }">
        {{ view.autoDemo ? '自动驾驶演示中' : '演示已暂停（操作优先）' }}
      </em>
      <button class="panel__close" id="panel-close" type="button" title="关闭（O / Esc）" @click="close">✕</button>
    </header>

    <div class="panel__body">

      <!-- ============ 挡位 ============ -->
      <section class="pgroup">
        <h5>挡位 · GEAR</h5>
        <div class="prow prow--wrap">
          <button
            v-for="g in gears"
            :key="g.code"
            class="pbtn pbtn--gear"
            :class="{ 'is-on': view.gear === g.code || (g.code === 'P' && view.isPark) }"
            type="button"
            @click="setGear(g.code)"
          >{{ g.code }} <i>{{ g.name }}</i></button>
        </div>
        <p class="pnote">
          当前：<b>{{ view.gearShort }} {{ view.gearName }}</b> ·
          边撑 / 龙头锁 / 充电枪 未解除时会拒绝挂挡（顶部横幅给出原因）
        </p>
      </section>

      <!-- ============ 车速 / 急加速 急减速 ============ -->
      <section class="pgroup">
        <h5>车速 · SPEED</h5>
        <div class="psl">
          <span class="psl__k">定速</span>
          <input
            id="panel-speed" type="range" min="0" max="60" step="1"
            :value="view.cruiseSpeed" @input="setCruise($event.target.value)"
          >
          <b class="psl__v">{{ view.cruiseSpeed }}<i>km/h</i></b>
        </div>
        <div class="prow">
          <button class="pbtn" type="button" @click="setCruise(0)">停车</button>
          <button class="pbtn" type="button" @click="setCruise(12)">12</button>
          <button class="pbtn" type="button" @click="setCruise(25)">25</button>
          <button class="pbtn" type="button" @click="setCruise(35)">35</button>
          <button class="pbtn" type="button" @click="setCruise(45)">45</button>
        </div>
        <div class="prow">
          <button class="pbtn pbtn--hot" id="panel-accel" type="button" @click="hardAccel">急加速</button>
          <button class="pbtn pbtn--hot" id="panel-brake" type="button" @click="hardBrake">急减速</button>
          <button class="pbtn" type="button" @click="coast">松油门滑行</button>
        </div>
        <p class="pnote">
          实测车速 <b>{{ view.readout === 'P' ? 0 : view.readout }}</b> km/h ·
          功率 <b>{{ view.power }}</b> W（急减速会走能量回收：功率为负、氮气回充）
        </p>
      </section>

      <!-- ============ 仪表提示 ============ -->
      <section class="pgroup">
        <h5>仪表提示 · ALERT</h5>
        <div class="prow prow--wrap">
          <button
            v-for="w in warnList"
            :key="w.id"
            class="pbtn pbtn--alert"
            :class="['is-' + w.level, { 'is-on': view.forceWarn === w.id }]"
            type="button"
            @click="setWarn(w.id)"
          >{{ w.label }}</button>
          <button class="pbtn pbtn--ghost" id="panel-alert-clear" type="button" @click="clearWarn">清除提示</button>
        </div>
        <p class="pnote">当前横幅：<b>{{ view.warning ? view.warning.text : '（无）' }}</b></p>
      </section>

      <!-- ============ 能量 ============ -->
      <section class="pgroup">
        <h5>能量 · ENERGY</h5>
        <div class="psl">
          <span class="psl__k">电量</span>
          <input id="panel-soc" type="range" min="0" max="100" step="1"
            :value="view.soc" @input="setSoc($event.target.value)">
          <b class="psl__v">{{ view.soc }}<i>%</i></b>
        </div>
        <div class="psl">
          <span class="psl__k">氮气</span>
          <input id="panel-nos" type="range" min="0" max="100" step="1"
            :value="view.nos" @input="setNos($event.target.value)">
          <b class="psl__v">{{ view.nos }}<i>%</i></b>
        </div>
        <div class="prow">
          <button class="pbtn pbtn--hot" id="panel-nos-burn" type="button" @click="drainNos">消耗氮气 −15%</button>
          <button class="pbtn" type="button" @click="setNos(100)">充满氮气</button>
          <button class="pbtn" :class="{ 'is-on': view.lamps.usb }" type="button" @click="toggleLamp('usb')">USB 供电</button>
        </div>
        <div class="psl">
          <span class="psl__k">电机温</span>
          <input id="panel-temp" type="range" :min="C.thermal.ambient" :max="C.thermal.max" step="1"
            :value="view.temp" @input="setTemp($event.target.value)">
          <b class="psl__v">{{ view.temp }}<i>℃</i></b>
        </div>
        <p class="pnote">
          ≥{{ C.thermal.warn }}℃ = 电机偏热 · ≥{{ C.thermal.critical }}℃ = 电机过热（功率表数值变红闪烁）
        </p>
      </section>

      <!-- ============ 车灯 / 开关 ============ -->
      <section class="pgroup">
        <h5>车灯与开关 · SWITCH</h5>
        <div class="prow prow--wrap">
          <button class="pbtn" :class="{ 'is-on': view.lamps.beamLow }" type="button" @click="toggleLamp('beam')">大灯</button>
          <button class="pbtn" :class="{ 'is-on': view.lamps.beamHigh }" type="button" @click="toggleHigh">远光</button>
          <button class="pbtn" :class="{ 'is-on': view.lamps.cruise }" type="button" @click="toggleLamp('cruise')">定速巡航</button>
          <button class="pbtn" :class="{ 'is-on': view.lamps.lock }" type="button" @click="toggleLamp('lock')">龙头锁</button>
          <button class="pbtn" :class="{ 'is-on': view.lamps.bt }" type="button" @click="toggleLamp('bt')">蓝牙</button>
          <button class="pbtn" :class="{ 'is-on': view.mediaPlaying }" type="button" @click="toggleMedia">手机音源</button>
          <button class="pbtn" :class="{ 'is-on': view.kickstand }" type="button" @click="act({ kickstandFlip: true })">边撑</button>
          <button class="pbtn" :class="{ 'is-on': view.charger }" type="button" @click="act({ chargerFlip: true })">充电枪</button>
          <button class="pbtn pbtn--hot" :class="{ 'is-on': view.powered }" type="button" @click="togglePower">整车电源</button>
        </div>
        <div class="prow">
          <button class="pbtn" :class="{ 'is-on': view.lamps.turnL }" type="button" @click="turn('turnL')">左转向</button>
          <button class="pbtn" :class="{ 'is-on': view.lamps.turnR }" type="button" @click="turn('turnR')">右转向</button>
          <button class="pbtn pbtn--hot" :class="{ 'is-on': view.hazard }" type="button" @click="hazard">双闪</button>
        </div>
        <p class="pnote">龙头锁 ON / 边撑放下 / 插着充电枪时挂挡会被拒绝并弹出提示 —— 这是真车逻辑</p>
      </section>

      <!-- ============ 演示控制 ============ -->
      <section class="pgroup">
        <h5>演示 · DEMO</h5>
        <div class="prow">
          <button class="pbtn" :class="{ 'is-on': view.autoDemo }" type="button" @click="resumeAuto">继续自动驾驶演示</button>
          <button class="pbtn pbtn--hot" id="panel-pause" type="button" @click="pauseAuto">暂停演示</button>
        </div>
        <div class="prow">
          <button
            v-for="k in weatherKeys"
            :key="k"
            class="pbtn"
            :class="{ 'is-on': view.weatherText === C.weather.text[k] }"
            type="button"
            @click="setWeather(k)"
          >{{ C.weather.text[k] }}</button>
        </div>
        <div class="prow">
          <button class="pbtn pbtn--ghost" id="panel-reset" type="button" @click="resetSeed">重置为参考图那一帧</button>
        </div>
        <p class="pnote">
          O 开 / 关本面板 · Esc 关闭 · ? 看键盘说明 ·
          ODO <b>{{ view.odo }}</b> km · TRIP <b>{{ view.trip }}</b>
        </p>
      </section>

    </div>
  </div>
</template>

<style scoped>
/*
 * 操作弹框：和仪表同一套配色（深底 + 琥珀字 + 红橙描边），
 * 双列分组、超出内部滚动；数字读数用等宽数字。
 */
.panel {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;
  width: 1010px;
  max-height: 620px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(24, 7, 11, .985), rgba(8, 2, 4, .99));
  border: 1px solid rgba(255, 122, 24, .5);
  box-shadow:
    0 0 0 1px rgba(226, 0, 26, .35),
    0 0 50px rgba(226, 0, 26, .38),
    inset 0 1px 0 rgba(255, 255, 255, .1);
  font-size: 12px;
  color: var(--ink);
  animation: panelIn .18s ease-out;
}

@keyframes panelIn {
  from { opacity: 0; transform: translate(-50%, -50%) scale(.985); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}

/* ---------------- 标题栏 ---------------- */
.panel__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px 8px 16px;
  background: linear-gradient(180deg, rgba(255, 122, 24, .22), rgba(226, 0, 26, .12));
  border-bottom: 1px solid rgba(255, 122, 24, .45);
}
.panel__bar b {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: .18em;
  color: var(--c-amber);
  text-shadow: var(--glow-amber);
}
.panel__en {
  font-size: 10px;
  letter-spacing: .3em;
  color: var(--ink-3);
}
.panel__auto {
  margin-left: auto;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: .06em;
  color: var(--c-green-2);
  border: 1px solid rgba(57, 217, 138, .5);
  background: rgba(57, 217, 138, .12);
}
.panel__auto.is-off {
  color: #ffb4b4;
  border-color: rgba(255, 45, 61, .55);
  background: rgba(255, 45, 61, .12);
}
.panel__close {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  cursor: pointer;
  color: #ffd9c0;
  font-size: 13px;
  background: linear-gradient(180deg, #4a1410, #24070a);
  border: 1px solid rgba(255, 122, 24, .55);
  transition: color .15s, border-color .15s, box-shadow .15s;
}
.panel__close:hover {
  color: #fff;
  border-color: var(--c-orange-2);
  box-shadow: 0 0 10px rgba(255, 122, 24, .6);
}

/* ---------------- 内容区 ---------------- */
.panel__body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
  padding: 12px 16px 14px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.panel__body::-webkit-scrollbar { width: 8px; }
.panel__body::-webkit-scrollbar-thumb {
  background: rgba(255, 122, 24, .45);
  border-radius: 4px;
}

.pgroup {
  padding: 8px 10px 6px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(255, 233, 214, .05), rgba(255, 233, 214, .015));
  border: 1px solid rgba(255, 122, 24, .22);
}
.pgroup h5 {
  margin: 0 0 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .18em;
  color: var(--c-orange-2);
}
.pnote {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--ink-2);
}
.pnote b {
  color: var(--c-amber);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}

/* ---------------- 滑块（定速 / 电量 / 氮气 / 电机温度） ---------------- */
.psl {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 68px;
  align-items: center;
  gap: 8px;
}
.psl + .psl { margin-top: 5px; }
.psl__k {
  font-size: 11px;
  letter-spacing: .06em;
  color: var(--ink-2);
}
.psl__v {
  text-align: right;
  font-size: 13px;
  color: var(--c-amber);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-num);
}
.psl__v i {
  margin-left: 2px;
  font-size: 10px;
  color: var(--ink-3);
}
.psl input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 16px;
  background: transparent;
  cursor: pointer;
}
.psl input[type='range']::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(255, 122, 24, .9), rgba(255, 45, 61, .55));
}
.psl input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #fff8e6, #ffb020 62%, #8a4a06);
  border: 1px solid rgba(255, 240, 200, .8);
  box-shadow: 0 0 8px rgba(255, 192, 46, .8);
}
.psl input[type='range']::-moz-range-track {
  height: 4px;
  border-radius: 3px;
  background: rgba(255, 122, 24, .75);
}
.psl input[type='range']::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #ffc02e;
  border: 1px solid #ffe6a8;
}

/* ---------------- 按钮 ---------------- */
.prow {
  display: flex;
  align-items: center;
  gap: 6px;
}
.prow + .prow { margin-top: 6px; }
.prow--wrap { flex-wrap: wrap; }

.pbtn {
  flex: 1 1 auto;
  min-width: 52px;
  padding: 5px 8px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: .04em;
  color: #ffe9d6;
  background: linear-gradient(180deg, #241016, #120608);
  border: 1px solid rgba(255, 122, 24, .38);
  transition: color .15s, border-color .15s, box-shadow .15s, background .15s;
}
.pbtn:hover {
  border-color: var(--c-orange-2);
  box-shadow: 0 0 10px rgba(255, 122, 24, .45);
}
.pbtn.is-on {
  color: #0b0203;
  background: linear-gradient(180deg, #ffd166, #e0a11c);
  border-color: #ffe6a8;
  box-shadow: 0 0 12px rgba(255, 192, 46, .6);
}
.pbtn--gear i {
  margin-left: 4px;
  font-size: 10px;
  letter-spacing: 0;
  opacity: .78;
}
/* 挡位按钮里的中文名不折行（「P 驻车」被折成两行很难看） */
.pbtn--gear {
  flex: 0 0 auto;
  min-width: 78px;
  white-space: nowrap;
}
.pbtn--hot {
  color: #ffe1e1;
  border-color: rgba(255, 45, 61, .55);
  background: linear-gradient(180deg, #3a0c12, #1a0407);
}
.pbtn--hot.is-on {
  color: #fff;
  background: linear-gradient(180deg, #ff5a3d, #c00d18);
  border-color: #ffb0a0;
}
.pbtn--ghost {
  color: var(--ink-2);
  border-style: dashed;
}
.pbtn.is-amber { border-color: rgba(255, 192, 46, .6); }
.pbtn.is-red { border-color: rgba(255, 45, 61, .65); }

/* 动效收敛：减少动效时不做入场缩放 */
@media (prefers-reduced-motion: reduce) {
  .panel {
    animation: none;
  }
}
</style>
