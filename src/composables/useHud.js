/*!
 * useHud.js — 仪表「大脑」：车辆状态 + 主循环 + 显示快照 + 缩放
 * ------------------------------------------------------------------
 * 两条渲染通道（沿用原实现的性能策略，不打折扣）：
 *   ① 60fps 通道：功率弧、NOS 格子这类连续量 —— 组件用 registerFrame()
 *      注册回调，回调里直接写 SVG 属性，不经过 Vue 的 diff。
 *   ② 8Hz 通道：所有数字 / 文字 / 指示灯 —— 汇总成一个 reactive 快照
 *      （view），由 Vue 负责 diff，且只在值变化时才碰 DOM。
 *
 * 通过 provide/inject 交给所有子组件（App.vue 里 provide，子组件里
 * useHudContext()）。车辆状态本身是普通对象，接真实数据（CAN / BLE /
 * WebSocket）时按字段写进去即可，渲染层一行都不用改。
 */
import { reactive, ref, provide, inject } from 'vue';
import { CONFIG as C, clamp, pad } from '../config.js';
import { create, update, autoDrive, warnings } from '../core/state.js';
import { createInput } from '../core/input.js';

/* provide/inject 的键（Symbol 避免命名冲突） */
export const HUD_KEY = Symbol('eva-hud');

/* ---------------------------------------------------------------
 * 显示快照：把 state 里渲染层需要的部分拍平成「字符串 / 数字 / 布尔」
 * 只在这里做一次取整与格式化，组件模板里就不再出现计算逻辑。
 * ------------------------------------------------------------- */
function snapshot(v) {
  const soc = Math.round(v.soc);
  const temp = Math.round(v.motorTemp);
  const watt = Math.round(v.power);
  const speed = Math.round(Math.abs(v.speed));
  const now = new Date();

  /* 挡位：P 驻车；骑行时是 A/E/C/F/X1/X2 */
  const parked = v.gear === C.vehicle.parkGear;
  const gdef = C.vehicle.gears[parked ? v.gearLast : v.gear] ||
               C.vehicle.gears[C.vehicle.gearOrder[0]];
  const readout = parked ? C.vehicle.parkGear : String(speed);

  /* READY 铭牌三态：就绪 / 充电 / 红色告警 */
  let readyText = 'READY';
  let readyCls = 'is-on';
  if (!v.powered) { readyText = 'OFF'; readyCls = ''; }
  else if (v.charger) { readyText = 'CHARGING'; readyCls = 'is-charge'; }
  else if (v.warning && v.warning.level === 'red') { readyText = 'CHECK'; readyCls = 'is-warn'; }

  const socFill = clamp(v.soc, 0, 100);
  const rangeFill = clamp(v.rangeFull > 0 ? v.rangeKm / v.rangeFull * 100 : 0, 0, 100);

  return {
    /* 左上角芯片：上面天气、下面时间 */
    weatherIcon: C.weather.icons[v.weather] || C.weather.icons.fog,
    weatherText: C.weather.text[v.weather] || '',
    clock: pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2),

    readyText: readyText,
    readyCls: readyCls,

    /* 右上角芯片：骑行挡位（新国标 / ×2 模式）+ 电量点阵 */
    gearShort: parked ? C.vehicle.parkGear : v.gear,
    gearName: parked ? '驻车' : gdef.name,
    dots: Math.min(4, Math.ceil(soc / 25)),          // 右上角 4 圆点

    /* 中央六边形：P 挡显示 P，起步后显示时速数字 + 挡位铭牌 */
    gear: v.gear,
    gearLabel: parked ? '驻车' : gdef.name,
    isPark: parked,
    readout: readout,
    readoutWide: readout.length > 2,

    /* 左侧圆盘 / ODO */
    ride: Math.floor(v.rideSec / 3600) + 'h' + pad(Math.floor(v.rideSec / 60) % 60, 2) + 'min',
    trip: v.tripKm.toFixed(1) + 'km',
    odo: String(Math.floor(v.odo)),

    /* 右侧功率圆表：数值装在一块自动宽度的圆角牌里（4 位数也不会撑出圆外） */
    power: String(watt),
    powerLen: Math.min(5, String(watt).replace('-', '').length),
    powerRegen: watt < -20,
    temp: String(temp),
    tempWarn: temp >= C.thermal.warn && temp < C.thermal.critical,
    tempCrit: temp >= C.thermal.critical,

    /* 双电电量表（并列一排两条） */
    soc: soc,
    socText: soc + '%',
    socFill: socFill.toFixed(1) + '%',
    rangeText: v.rangeKm.toFixed(1) + 'km',
    rangeFill: rangeFill.toFixed(1) + '%',
    rangeMax: Math.round(v.rangeFull) + 'km',
    battTier: soc > C.socBar.high ? 'is-high' : (soc <= C.socBar.low ? 'is-crit' : 'is-low'),

    /* 紫色氮气条 / 龙头锁 */
    nos: Math.round(v.nos),
    nosText: Math.round(v.nos) + '%',
    lockOn: !!v.lamps.lock,

    /* 指示灯与告警（turnL / turnR / hazard 都在 lamps 里） */
    lamps: Object.assign({}, v.lamps),
    hazard: !!v.lamps.hazard,
    mediaPlaying: !!v.media.playing,
    warning: v.warning
      ? { id: v.warning.id, level: v.warning.level, text: v.warning.text }
      : null,

    /* 操作台（ControlPanel）要显示/绑定的几项 —— 面板只读 view，写走 send() */
    powered: !!v.powered,
    cruiseSpeed: Math.round(v.cruiseSpeed),
    autoDemo: !!v.auto.enabled,
    kickstand: !!v.kickstand,
    charger: !!v.charger,
    forceWarn: v.forceWarn || ''
  };
}

/* ---------------------------------------------------------------
 * ?photo=字段:值,字段:值 —— 冻结画面，用于设计走查 / 出图
 *   index.html?photo=speed:35,power:1800,gear:X1,lamp.turnR:1
 *   index.html?photo=turn:left      # 左转向（right / hazard 类推）
 * ------------------------------------------------------------- */
function applyPhoto(v, search) {
  const m = /[?&]photo=([^&]*)/.exec(search || '');
  if (!m) return false;
  decodeURIComponent(m[1]).split(',').forEach(function (kv) {
    const i = kv.indexOf(':');
    if (i < 0) return;
    const k = kv.slice(0, i).trim();
    const raw = kv.slice(i + 1).trim();
    const num = parseFloat(raw);
    const val = (/^-?[\d.]+$/.test(raw) && !isNaN(num)) ? num : raw;
    if (k.indexOf('lamp.') === 0) v.lamps[k.slice(5)] = !!val;
    else if (k === 'hazard') { v.lamps.hazard = !!val; v.lamps.turnL = v.lamps.turnR = !!val; }
    else if (k === 'turn') {
      v.lamps.turnL = raw === 'left' || raw === 'hazard';
      v.lamps.turnR = raw === 'right' || raw === 'hazard';
      v.lamps.hazard = raw === 'hazard';
    } else v[k] = val;
  });
  return true;
}

export function createHud() {
  const vehicle = create();
  const view = reactive(snapshot(vehicle));
  const helpOpen = ref(false);
  /* 操作弹框：默认关闭；?panel=1 直接打开（出图 / 冒烟测试用） */
  const panelOpen = ref(/[?&]panel=1/.test(window.location.search));
  const scale = ref(1);

  const hooks = [];              // 60fps 通道回调
  let running = false;
  let frozen = false;
  let last = 0;
  let textAcc = 1;               // 首帧就画满
  let lastW = 0;
  let lastH = 0;

  const input = createInput({
    onToggleHelp: function () { helpOpen.value = !helpOpen.value; },
    onTogglePanel: function () { panelOpen.value = !panelOpen.value; },
    onClosePanel: function () { panelOpen.value = false; }
  });

  /* ---------------------------- 通道管理 ---------------------------- */
  function registerFrame(fn) {
    hooks.push(fn);
    return function () {
      const i = hooks.indexOf(fn);
      if (i >= 0) hooks.splice(i, 1);
    };
  }
  function flushFrames() {
    for (let i = 0; i < hooks.length; i++) hooks[i](vehicle);
  }
  function syncView() {
    Object.assign(view, snapshot(vehicle));
  }

  /* ---------------------------- 等比缩放 ---------------------------- */
  function fit() {
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    const padPx = 24;
    let s = Math.min(
      (lastW - padPx) / C.design.width,
      (lastH - padPx) / C.design.height
    );
    if (!isFinite(s) || s <= 0) s = 1;
    scale.value = Math.max(0.15, Math.min(s, 2));
  }
  /* 有些截图 / 自动化工具改窗口时不发 resize 事件，逐帧比一次兜底 */
  function fitIfResized() {
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) fit();
  }

  /* ---------------------------- 主循环 ---------------------------- */
  /* 推进一帧仿真：外部命令（键盘 / 操作台）→ 物理 → 60fps 通道 */
  function advance(dt) {
    let cmd = input.commands();
    if (!cmd) cmd = autoDrive(vehicle, dt);
    update(vehicle, dt, cmd);
    flushFrames();
  }

  function frame(ts) {
    /* 无头 / 虚拟时钟环境可能给重复的时间戳，退回 performance.now() */
    let now = ts;
    if (!now || now <= last) {
      now = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
    }
    let dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.05) dt = 0.05;            // 切后台回来不要跳变

    fitIfResized();

    advance(dt);

    /* ② 节流通道：数字 / 文字 / 指示灯 */
    textAcc += dt;
    if (textAcc >= 1 / C.rates.textHz) {
      textAcc = 0;
      syncView();
    }

    window.requestAnimationFrame(frame);
  }

  /* 单帧重绘（出图模式 / 首帧）：只走 60fps 通道 + 刷快照，
     不推进物理 —— 所以 ?photo= 给的数值（比如满电续航 145km）能原样停在屏幕上 */
  function renderOnce() {
    flushFrames();
    syncView();
  }

  /* 消费一次指令队列 + 推进 0 秒（操作台用：即使停在出图模式，
     按下「挡位/双闪/仪表提示」这类走 cmd 的按钮也能立刻见效） */
  function dispatch() {
    advance(0);
    syncView();
  }

  function start() {
    input.init();
    if (running) return;
    if (frozen) {
      /* 出图模式：只画一帧，并在窗口尺寸落定后再校准两次 */
      renderOnce();
      window.setTimeout(function () { fit(); renderOnce(); }, 260);
      window.setTimeout(function () { fit(); renderOnce(); }, 900);
      return;
    }
    running = true;
    last = 0;
    window.requestAnimationFrame(frame);
  }

  /* ------------------------- 启动前先空跑一帧 ------------------------- */
  update(vehicle, 0, {});                  // 先填好 lamps 等派生字段
  frozen = applyPhoto(vehicle, window.location.search);
  if (frozen) {
    vehicle.warning = warnings(vehicle);    // 覆盖参数后重新裁决告警
    vehicle.lamps.warn = !!vehicle.warning;
  }
  syncView();

  const ctx = {
    vehicle: vehicle,
    view: view,
    helpOpen: helpOpen,
    panelOpen: panelOpen,           // 操作弹框（ControlPanel.vue）
    scale: scale,
    frozen: frozen,
    input: input,
    /* 操作台用：send = 塞一条指令（走 update 的 cmd 通道）；
       hold = 油门脉冲（急加速 / 急减速 / 滑行）；
       refresh = 纯重绘（直接写字段之后用）；dispatch = 消费指令并刷一帧（send 之后用） */
    send: input.push,
    hold: input.hold,
    refresh: renderOnce,
    dispatch: dispatch,
    registerFrame: registerFrame,
    renderOnce: renderOnce,
    start: start,
    fit: fit
  };

  provide(HUD_KEY, ctx);

  /* 调试 / 外部数据源挂钩：window.EVA_HUD.vehicle 就是那份车辆状态 */
  if (typeof window !== 'undefined') window.EVA_HUD = ctx;

  return ctx;
}

/* 子组件里取上下文 */
export function useHudContext() {
  const ctx = inject(HUD_KEY);
  if (!ctx) throw new Error('useHudContext(): 必须在 App.vue 内部使用');
  return ctx;
}
