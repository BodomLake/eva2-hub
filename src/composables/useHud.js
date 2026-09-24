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
import { reactive, ref, computed, provide, inject, watch } from 'vue';
import { CONFIG as C, clamp, pad, copy } from '../config.js';
import { create, update, autoDrive, warnings, stripMode } from '../core/state.js';
import { createInput } from '../core/input.js';
import { createMessages } from '../core/messages.js';
import { createSettings } from '../core/settings.js';
import { tireStat } from '../core/tire.js';

/* provide/inject 的键（Symbol 避免命名冲突） */
export const HUD_KEY = Symbol('eva-hud');

/* ---------------------------------------------------------------
 * 展示用的胎压快照（kPa / bar 两种单位、进度条用的百分比都算好）
 * ------------------------------------------------------------- */
function tireView(v) {
  const t = v.tire || { wheels: {} };
  const hi = (C.apps.tire.limits && C.apps.tire.limits.kPaHigh) || 320;
  function one(id) {
    const x = (t.wheels && t.wheels[id]) || { kPa: 0, temp: 0, name: id };
    return {
      id: id,
      name: x.name || id,
      kPa: Math.round(x.kPa),
      bar: (x.kPa / C.apps.tire.barDiv).toFixed(2),
      temp: Math.round(x.temp),
      pct: clamp(Math.round(x.kPa / hi * 100), 0, 100)
    };
  }
  return {
    on: v.tireOn !== false,
    sensor: !!t.sensor,
    front: one('front'),
    rear: one('rear'),
    stat: tireStat(t)
  };
}

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

  /* 挡位：P 驻车；骑行时是 A/E/C/F（X1 / X2 暂停用） */
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
    mediaPlaying: !!v.media.playing || !!v.media.local,
    warning: v.warning
      ? { id: v.warning.id, level: v.warning.level, text: v.warning.text }
      : null,

    /* 侧边氛围灯带（App.vue 的两条 .strip）：状态 → 类名 `is-<strip>`
       fault 红闪 / boost 紫闪 / accel 蓝常亮 / brake 绿常亮 / park 黄 / idle 淡青
       —— 判定在 core/state.js 的 stripMode()，颜色在 base.css 的 .strip.is-* */
    strip: stripMode(v),

    /* 胎压胎温 / 感应开关（设置页、消息中心、告警文案共用） */
    tire: tireView(v),
    seatSensor: !!v.sensors.seat,
    kickstandSensor: !!v.sensors.kickstand,
    seatOn: !!v.seatOn,

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
 *   index.html?photo=speed:35,power:7800,gear:F,lamp.turnR:1
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

export function createHud(opts) {
  /* vue-router 实例（App.vue 里 useRouter() 传进来）—— 它是「当前打开哪一页」的
     唯一真相；传空时退回内部 ref（Node / 单测里不装路由也能跑） */
  const router = (opts && opts.router) || null;
  const vehicle = create();
  const view = reactive(snapshot(vehicle));
  const helpOpen = ref(false);
  /* 操作弹框：默认关闭；?panel=1 直接打开（出图 / 冒烟测试用） */
  const panelOpen = ref(/[?&]panel=1/.test(window.location.search));
  const scale = ref(1);

  /* ---------------------------------------------------------------
   * 应用页（左灯塔五个芯片）的共享状态
   *   messages 消息中心：全系统的提示都进这里，左侧「消息」芯片角标读它的未读数
   *   settings 用户设置：胎压阈值 / 感应开关 / 地图 key / 播放器 / BMS → 存浏览器
   *   page     当前打开的应用页（'' = 都没开；?page=msg|nav|nerv|music|set 可直达）
   * 导航 / 播放器 / BMS 自己的 UI 状态放在各自组件里，这里只放「跨组件要用」的部分。
   * ------------------------------------------------------------- */
  const messages = createMessages();
  const msgState = reactive({ list: [], unread: 0, total: 0 });
  const settings = createSettings();
  const PAGES = ['msg', 'nav', 'nerv', 'music', 'set'];
  const pageHit = /[?&]page=([a-z]+)/.exec(window.location.search);
  const localPage = ref(pageHit && PAGES.indexOf(pageHit[1]) >= 0 ? pageHit[1] : '');

  /* 当前页面 = 当前路由的 name（hud = 都没开）；没有 router 时用内部 ref 兜底。
     两者形状一样（都是带 .value 的响应式），所以 LeftRail / Esc / 快照不用区分。 */
  const page = router
    ? computed(function () {
        const n = router.currentRoute.value.name;
        return PAGES.indexOf(n) >= 0 ? n : '';
      })
    : localPage;

  /* 换路由（保活：页面实例不会卸载，只是切到前台 / 退到后台）。
     ⚠ 「再点一次同一个芯片 = 关掉」不能拿 page.value 判断 —— 路由切换是异步的，
     连点两个芯片时它还是旧值（会把「切到 B」误判成「再点 A → 关掉」）。
     所以记一个**最近一次请求的目标**，并用 afterEach 跟真实路由对齐。 */
  const target = ref(page.value);
  if (router && router.afterEach) {
    router.afterEach(function (to) {
      const n = to && to.name;
      target.value = PAGES.indexOf(n) >= 0 ? n : '';
    });
  }

  function go(name) {
    target.value = PAGES.indexOf(name) >= 0 ? name : '';
    const r = router.push({ name: name });
    if (r && r.catch) r.catch(function () { /* 重复导航 / 被中断：忽略 */ });
  }

  /* 应用页开关：再点一次同一个芯片 = 关掉这一页（回到仪表本体） */
  function openPage(id) {
    if (PAGES.indexOf(id) < 0) return;
    const next = target.value === id ? '' : id;
    target.value = next;
    if (router) go(next || 'hud');
    else localPage.value = next;
  }
  function closePage() {
    target.value = '';
    if (router) go('hud');
    else localPage.value = '';
  }
  const mediaLocal = reactive({ playing: false });

  function syncMessages() {
    msgState.list = messages.items.slice();
    msgState.unread = messages.unread();
    msgState.total = messages.items.length;
  }
  messages.subscribe(syncMessages);
  syncMessages();

  /* （openPage / closePage 已经改成走路由，见上面 go()） */

  /* --------------------- 给外部数据源用的三个入口 ---------------------
   * 远程推送（天气骤变预警…）：命中 config.warnings 的 code 会**同时**弹顶部横幅；
   * WebSocket / HTTP 拿到消息后调 window.EVA_HUD.pushAlert({...}) 即可。 */
  function pushAlert(a) {
    const it = messages.push(Object.assign({ kind: 'info', from: '远程推送' }, a || {}));
    if (a && a.code && C.warnings[a.code] && settings.value.msg.push) vehicle.pushWarn = a.code;
    syncView();
    return it;
  }
  function pushMessage(m) { const it = messages.push(m); syncView(); return it; }
  function pushFault(f) { const it = messages.pushFault(f); syncView(); return it; }
  function clearAlerts() { vehicle.pushWarn = null; syncView(); }

  /* 告警 → 消息中心：横幅上出现的每一条都在消息中心留一笔（去重交给 messages 层） */
  let lastWarnKey = '';
  function kindOfWarn(id) {
    if (id.indexOf('TIRE_') === 0) return 'tire';
    if (id === 'WEATHER_ALERT') return 'weather';
    return 'system';
  }
  function bridgeWarnings() {
    const w = vehicle.warning;
    const key = (w && w.all) ? w.all.join('|') : '';
    if (key === lastWarnKey) return;
    lastWarnKey = key;
    if (!w || !w.all) return;
    w.all.forEach(function (id) {
      const def = C.warnings[id];
      if (!def) return;
      messages.push({
        kind: kindOfWarn(id),
        level: def.level,
        code: id,
        title: def.label,
        text: id === w.id ? w.text : def.text,
        from: '整车系统'
      });
    });
  }

  /* 设置 → 车辆状态（胎压阈值 / 演示开关 / 感应开关 / 监控总开关） */
  function applySettings() {
    const s = settings.value;
    vehicle.tireLimits = {
      front: copy(s.tire.wheels.front),
      rear: copy(s.tire.wheels.rear)
    };
    vehicle.tireDemo = { leak: s.tire.leak, heat: s.tire.heat, drop: s.tire.drop };
    vehicle.tireOn = !!s.tire.monitor;
    vehicle.sensors = { seat: s.sensors.seat, kickstand: s.sensors.kickstand };
    syncView();
  }
  settings.onChange(applySettings);
  applySettings();
  if (settings.value.msg.faults) messages.seedFaults(C.apps.faults.history);

  /* settings.value 本身是普通对象（core 层不依赖 Vue），所以这里再包一层响应式：
     组件（设置页 / 导航页）直接改 settings.state.xxx → 深度监听 → 存浏览器 + 同步车辆。
     写盘做 150ms 防抖：导航页里输 key 是一边打字一边存的。 */
  const settingsState = reactive(settings.snapshot());
  let saveTimer = 0;
  watch(settingsState, function () {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () {
      saveTimer = 0;
      settings.patch(settingsState);
    }, 150);
  }, { deep: true });
  function resetSettings() {
    settings.reset();
    Object.assign(settingsState, settings.snapshot());
  }

  /* 本地播放器开关（左侧「音乐」芯片要点亮本地播放，不只是手机音源） */
  function setMediaPlaying(on) {
    mediaLocal.playing = !!on;
    vehicle.media.local = !!on;
    syncView();
  }

  const hooks = [];              // 60fps 通道回调
  let running = false;
  let frozen = false;
  let last = 0;
  let textAcc = 1;               // 首帧就画满
  let lastW = 0;
  let lastH = 0;

  /* ---------------------------------------------------------------
   * 诊断开关：?gearburst=N —— 每 220ms 换一次挡，换 N 次后停
   * ---------------------------------------------------------------
   * 用途：复现 / 盯住「换挡时中央立绘有概率消失」那个 bug。
   * 无头探针里没法真的「连按」（probe.html 的按键是一次性派发的，同一个 tick
   * 里连按 6 个挡位键只会换一次），所以这里给一个地址栏开关，让它跨帧换挡，
   * 并在每次换挡的**下一帧**检查一遍「中央那一层还有没有东西」，把结果记在
   * window.__gearburst（{n, empty, min, max}）里给冒烟断言读。
   * ⚠ 跟 ?photo= / ?panel=1 / ?probe=1 同一类：只在地址栏显式打开时才跑，
   *   不影响正常启动，也不参与打包行为。 */
  function startGearBurst(times) {
    const order = C.vehicle.gearOrder.slice();
    const stat = { times: times, done: 0, empty: 0, min: 99, max: 0, finished: false };
    if (typeof window !== 'undefined') window.__gearburst = stat;
    let i = 0;
    const tick = window.setInterval(function () {
      /* 先验收上一轮换挡的结果（这一句就是那个 bug 的「症状探针」） */
      const layers = document.querySelectorAll('.core__layer');
      const first = layers[0];
      if (!first || !first.firstElementChild) stat.empty++;
      if (layers.length < stat.min) stat.min = layers.length;
      if (layers.length > stat.max) stat.max = layers.length;
      if (stat.done >= stat.times) {
        window.clearInterval(tick);
        stat.finished = true;
        return;
      }
      input.push({ gear: order[i++ % order.length] });
      dispatch();                       // 出图（冻结）模式也照样换
      stat.done++;
    }, 220);
  }
  /* 诊断开关的启动：放在 input 建好之后调用（回调里要用 input / dispatch） */
  function maybeGearBurst() {
    const m = /[?&]gearburst=(\d+)/.exec(window.location.search);
    if (m) startGearBurst(Math.max(1, Math.min(40, Number(m[1]) || 8)));
  }

  const input = createInput({
    onToggleHelp: function () { helpOpen.value = !helpOpen.value; },
    onTogglePanel: function () { panelOpen.value = !panelOpen.value; },
    /* Esc：先关应用页，没有页面再关操作弹框（一层一层退）—— 关页 = 换回 'hud' 路由 */
    onClosePanel: function () {
      if (page.value) { closePage(); return; }
      panelOpen.value = false;
    },
    onOpenPage: openPage
  });

  maybeGearBurst();          // ?gearburst=N：连按换挡压力测试（诊断用，默认不跑）

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
    Object.assign(view, snapshot(vehicle), {
      msgUnread: msgState.unread,
      msgTotal: msgState.total,
      pageOpen: page.value,
      mediaLocal: mediaLocal.playing
    });
    bridgeWarnings();
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

    /* ---- 第 9 轮：五个应用页 ---- */
    page: page,                     // 当前打开的页面 id（'' = 都没开）
    openPage: openPage,
    closePage: closePage,
    messages: messages,             // 消息中心数据层（push / markRead / clear …）
    msg: msgState,                  // 消息中心的 reactive 门面（list / unread / total）
    settings: {                     // 用户设置：state = 响应式副本，改动自动存浏览器 + 同步车辆
      state: settingsState,
      storage: settings.storage,    // 浏览器缓存到底能不能用
      defaults: settings.defaults,
      reset: resetSettings
    },
    setMediaPlaying: setMediaPlaying,
    pushMessage: pushMessage,       // 外部数据源：塞一条消息进消息中心
    pushAlert: pushAlert,           // 外部数据源：远程推送（命中告警表会同时弹横幅）
    pushFault: pushFault,           // 外部数据源：记一条故障码
    clearAlerts: clearAlerts,       // 清掉远程推送那条横幅
    pages: PAGES,

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
