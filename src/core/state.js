/*!
 * state.js — 车辆状态模型 + 物理仿真 + 演示自动驾驶
 * ------------------------------------------------------------------
 * 这里不碰 DOM：只负责把「车」算出来，Vue 组件负责画。
 * 若接真实数据（CAN / BLE / WebSocket），只要按同样字段名更新
 * 这个 state 对象即可，渲染层完全不用改。
 *
 * 纯 ESM：浏览器（Vite）与 Node（tools/smoke.js）都能直接 import。
 */
import { CONFIG as C, clamp, lerp, copy } from '../config.js';

const V = C.vehicle;
const TH = C.thermal;

  /* ============================ 初始状态 ============================ */
  function create() {
    var s = C.seed;
    return {
      /* 时间与运行标志 */
      t: 0,
      powered: true,

      /* 行驶 */
      gear: s.gear,              // P（驻车） | A / E / C / F / X1 / X2
      gearLast: s.gearLast,      // 驻车时保留上一次的骑行挡位（物理模型不乱跳）
      speed: 0,                  // km/h
      throttle: 0,               // -1 ~ 1
      power: 0,                  // W，负值代表能量回收
      cruiseSpeed: 0,

      /* 电池 / 里程 */
      soc: s.soc,
      auxSoc: s.auxSoc,
      nos: s.nos,                // 氮气条剩余量 %
      odo: s.odo,
      tripKm: s.tripKm,
      rideSec: s.rideSec,
      whUsed: 0,
      rangeKm: 0,                // 当前剩余续航 km
      rangeFull: 0,              // 当前模式满电续航 km（双电）

      /* 温度 */
      motorTemp: s.motorTemp,
      ambient: s.ambient,

      /* 天气（左上角芯片第一行；demo 里每隔一段时间轮换） */
      weather: C.weather.current,
      weatherT: 0,

      /* 开关类 */
      kickstand: false,
      charger: false,
      blink: true,
      media: { playing: false },   // 手机音源（左侧「音乐」芯片）

      /* 指示灯（渲染层直接读这个对象） */
      lamps: copy(C.lamps),
      req: { turnL: false, turnR: false, hazard: false },   // 转向灯请求（未闪烁）
      turnSince: 0,
      turnDist: 0,
      steadyThr: 0,
      moveTry: -99,              // 最近一次「挂挡被拒绝」的时刻/原因
      moveWhy: '',

      /* 告警 */
      warning: null,
      forceWarn: null,           // 操作台（ControlPanel）强制指定一条告警 id；null = 不强制

      /* 演示驾驶 */
      auto: {
        enabled: true,
        t: 0,
        phase: 'park',
        segT: 0,
        segLen: 6,
        cruise: 30,
        brakeUntil: 0,
        hazUntil: 0,
        turnCycle: 0,              // 转向灯三连（左 → 右 → 双闪）轮流演的游标
        chargeT: 0
      }
    };
  }

  /* ============================ 挡位 ============================ */
  /* 当前生效的骑行挡位：驻车（P）时沿用上一次的挡位，物理模型不跳变 */
  function rideGear(v) { return v.gear === V.parkGear ? v.gearLast : v.gear; }
  /* 当前挡位的参数（车速上限 / 加速 / 功率上限 / 续航系数） */
  function gearDef(v) { return V.gears[rideGear(v)] || V.gears[V.gearOrder[0]]; }

  function shiftGear(v, g) {
    if (!v.powered || g === v.gear) return false;
    var moving = g !== V.parkGear;
    if (moving && V.gearOrder.indexOf(g) < 0) return false;
    if (moving && v.kickstand) { v.moveTry = v.t; v.moveWhy = 'KICKSTAND'; return false; }
    if (moving && v.charger) { v.moveTry = v.t; v.moveWhy = 'CHARGER'; return false; }
    if (moving && v.lamps.lock) { v.moveTry = v.t; v.moveWhy = 'LOCKED'; return false; }
    if (!moving && Math.abs(v.speed) > 1.5) return false;      // 必须停稳才能挂 P
    if (moving) v.gearLast = g;
    v.gear = g;
    if (!moving) { v.speed = 0; v.throttle = 0; v.lamps.cruise = false; }
    v.req.turnL = v.req.turnR = false;
    v.turnSince = 0;
    v.turnDist = 0;
    v.steadyThr = 0;
    return true;
  }

  /* 换下一挡（键盘与演示自动驾驶共用；中央六边形会跟着做一次心跳） */
  function cycleGear(v) {
    var order = V.gearOrder;
    var i = order.indexOf(rideGear(v));
    shiftGear(v, order[(i + 1) % order.length]);
    return rideGear(v);
  }
/* ============================ 每帧推进 ============================ */
  function update(v, dt, cmd) {
    cmd = cmd || {};
    v.t += dt;

    /* ---- 外部指令 ---- */
    if (cmd.gear) shiftGear(v, cmd.gear);
    if (cmd.gearCycle) cycleGear(v);
    if (cmd.setSoc !== undefined) v.soc = clamp(cmd.setSoc, 0, 100);
    if (cmd.kickstand !== undefined && cmd.kickstand !== v.kickstand) {
      v.kickstand = cmd.kickstand;
      if (v.kickstand && v.gear !== V.parkGear) shiftGear(v, V.parkGear);
    }
    if (cmd.charger !== undefined) v.charger = cmd.charger;
    if (cmd.kickstandFlip) {
      v.kickstand = !v.kickstand;
      if (v.kickstand && v.gear !== V.parkGear) shiftGear(v, V.parkGear);
    }
    if (cmd.chargerFlip) {
      v.charger = !v.charger;
      if (v.charger && v.gear !== V.parkGear) shiftGear(v, V.parkGear);
    }
    if (cmd.autoFlip) v.auto.enabled = !v.auto.enabled;
    /* 操作台：强制指定一条告警（'LOW_SOC' … / null 清除）—— 走的是同一套告警表 */
    if (cmd.forceWarn !== undefined) v.forceWarn = cmd.forceWarn || null;
    if (cmd.mediaFlip) v.media.playing = !v.media.playing;
    if (cmd.toggleLamp) {
      var k = cmd.toggleLamp;
      v.lamps[k] = !v.lamps[k];
      if (k === 'beam') v.lamps.beamLow = v.lamps.beam;
      if (k === 'cruise' && v.lamps.cruise) v.cruiseSpeed = Math.abs(v.speed);
    }
    if (cmd.turnL !== undefined) {
      v.req.turnL = !!cmd.turnL;
      if (v.req.turnL) v.req.turnR = false;
      v.turnSince = 0; v.turnDist = 0;
    }
    if (cmd.turnR !== undefined) {
      v.req.turnR = !!cmd.turnR;
      if (v.req.turnR) v.req.turnL = false;
      v.turnSince = 0; v.turnDist = 0;
    }
    if (cmd.turn) {
      var on = !v.req[cmd.turn];
      v.req.turnL = cmd.turn === 'turnL' ? on : false;
      v.req.turnR = cmd.turn === 'turnR' ? on : false;
      if (on) v.req.hazard = false;               // 打单边转向 = 退出双闪
      v.turnSince = 0;
      v.turnDist = 0;
    }
    if (cmd.hazard !== undefined) {
      v.req.hazard = !!cmd.hazard;
      if (v.req.hazard) v.req.turnL = v.req.turnR = false;
      v.turnSince = 0;
      v.turnDist = 0;
    }
    if (cmd.hazardFlip) {
      v.req.hazard = !v.req.hazard;
      if (v.req.hazard) v.req.turnL = v.req.turnR = false;
      v.turnSince = 0;
      v.turnDist = 0;
    }
    if (cmd.setLamp) {
      for (var lk in cmd.setLamp) {
        if (Object.prototype.hasOwnProperty.call(cmd.setLamp, lk)) {
          v.lamps[lk] = !!cmd.setLamp[lk];
          if (lk === 'beam') v.lamps.beamLow = v.lamps.beam;
        }
      }
    }

    /* ---- 闪烁节拍 ---- */
    v.blink = Math.floor(v.t * 1000 / C.rates.blinkMs) % 2 === 0;

    /* ---- 当前挡位参数（可能在上面那几行里刚被换掉） ---- */
    var m = gearDef(v);

    /* ---- 油门 ---- */
    var parked = v.gear === V.parkGear || !v.powered || v.charger;
    var thr = clamp(cmd.throttle || 0, -1, 1);
    if (parked) thr = 0;

    /* ---- 定速巡航：接管油门 ---- */
    if (v.lamps.cruise && !parked && v.gear !== V.parkGear) {
      if (Math.abs(v.speed) < 3) {
        v.lamps.cruise = false;                     // 速度过低自动退出
      } else {
        thr = clamp((v.cruiseSpeed - v.speed) * 0.06, -0.5, 0.9);
      }
    } else if (!parked) {
      /* 长时间稳定油门 → 自动进入巡航（贴近真车行为） */
      if (thr > 0.55) {
        v.steadyThr += dt;
        if (v.steadyThr > 6) { v.lamps.cruise = true; v.cruiseSpeed = Math.abs(v.speed); }
      } else {
        v.steadyThr = 0;
      }
    }
    v.throttle = lerp(v.throttle, thr, Math.min(1, dt * 6));

    /* ---- 速度 ---- */
    var limit = m.maxSpeed;
    var target = parked ? 0 : v.throttle * limit;
    var delta = target - v.speed;
    var accel;
    if (Math.abs(target) > Math.abs(v.speed)) accel = m.accel;
    else if (v.throttle < -0.05) accel = V.brakePower;
    else accel = V.coastDrag;
    var step = accel * dt * 3.6;
    if (Math.abs(delta) <= step) v.speed = target;
    else v.speed += (delta > 0 ? 1 : -1) * step;
    if (parked) v.speed = 0;

    var vAbs = Math.abs(v.speed);
    /* ---- 功率 ---- */
    var P = 0;
    if (!parked && vAbs > 0.3) {
      if (v.throttle > 0.02) {
        P = v.throttle * m.powerCap * (0.30 + 0.70 * vAbs / m.maxSpeed);
      } else if (v.throttle < -0.02) {
        P = -V.regenCoef * m.powerCap * 2.4 * (0.35 + 0.65 * Math.min(1, vAbs / m.maxSpeed));
      } else {
        P = -V.regenCoef * m.powerCap * 0.3 * Math.min(1, vAbs / m.maxSpeed);
      }
    }
    v.power = lerp(v.power, P, Math.min(1, dt * 5));
    if (Math.abs(v.power) < 7) v.power = 0;

    /* ---- 电量 / 里程 ---- */
    var wh = v.power * dt / 3600;
    v.whUsed += wh;
    v.soc = clamp(v.soc - wh / V.capacityWh * 100, 0, 100);
    if (v.charger) v.soc = clamp(v.soc + dt * 0.34, 0, 100);   // 充电演示
    if (v.lamps.usb) v.auxSoc = clamp(v.auxSoc - dt * 0.9, 0, 100);

    var dkm = vAbs * dt / 3600;
    v.odo += dkm;
    v.tripKm += dkm;
    if (vAbs > 1) v.rideSec += dt;
    v.rangeFull = V.fullRangeKm * m.rangeFactor;      // 当前挡位满电续航（C 挡 = 145km）
    v.rangeKm = v.rangeFull * v.soc / 100;

    /* ---- 氮气条：大功率输出时消耗，制动回收 / 滑行时缓慢回充 ---- */
    if (v.power > m.powerCap * 0.72) v.nos = clamp(v.nos - dt * 3.5, 0, 100);
    else if (v.power < -20) v.nos = clamp(v.nos + dt * 1.8, 0, 100);
    else v.nos = clamp(v.nos + dt * 0.35, 0, 100);

    /* ---- 电机温度：功率升温 + 迎面风散热 ---- */
    if (!parked) v.motorTemp += Math.abs(v.power) / 1000 * TH.heatGain * dt;
    v.motorTemp -= (v.motorTemp - v.ambient) * TH.coolRate * (1 + vAbs / 18) * dt;
    v.motorTemp = clamp(v.motorTemp, v.ambient, TH.max);

    /* ---- 天气轮换（纯 demo；接真实天气源时删掉这段即可） ---- */
    v.weatherT += dt;
    if (v.weatherT >= C.weather.cycleSec) {
      v.weatherT = 0;
      var wkeys = Object.keys(C.weather.icons);
      v.weather = wkeys[(wkeys.indexOf(v.weather) + 1) % wkeys.length];
    }

    /* ---- 转向灯 / 双闪闪烁 + 单边自动回位 ---- */
    var haz = !!v.req.hazard;
    v.lamps.turnL = (haz || !!v.req.turnL) && v.blink;
    v.lamps.turnR = (haz || !!v.req.turnR) && v.blink;
    v.lamps.hazard = haz;
    if (!haz && (v.req.turnL || v.req.turnR)) {
      v.turnSince += dt;
      v.turnDist += vAbs * dt / 3600;
      if ((C.turnAuto.seconds && v.turnSince > C.turnAuto.seconds) ||
          (C.turnAuto.meters && v.turnDist > C.turnAuto.meters / 1000)) {
        v.req.turnL = v.req.turnR = false;
      }
    }

    /* ---- 指示灯综合 ---- */
    v.lamps.beamLow = !!v.lamps.beamLow;
    v.lamps.beamHigh = !!v.lamps.beamHigh;
    v.lamps.mode = true;
    v.lamps.regen = v.power < -50;
    v.lamps.cruise = !!v.lamps.cruise;
    v.lamps.seat = !!v.lamps.seat;

    /* ---- 告警 ---- */
    var w = warnings(v);
    v.warning = w;
    v.lamps.warn = !!w;
  }

/* ============================ 告警裁决 ============================ */
  function warnings(v) {
    var W = C.warnings;
    var list = [];

    /* 操作台强制点的那一条（演示用：想演哪个提示就演哪个） */
    if (v.forceWarn && W[v.forceWarn]) list.push(v.forceWarn);

    if (v.soc < 10) list.push('CRIT_SOC');
    else if (v.soc < 20) list.push('LOW_SOC');

    if (v.motorTemp >= TH.critical) list.push('MOTOR_HOT');
    else if (v.motorTemp >= TH.warn) list.push('MOTOR_WARM');

    if (!v.lamps.bt && v.powered) list.push('NO_BT');

    /* 挂挡被拒绝后 5 秒内持续提示原因 */
    if (v.t - v.moveTry < 5 && v.moveWhy) list.push(v.moveWhy);

    if (!list.length) return null;

    list.sort(function (a, b) { return W[b].priority - W[a].priority; });
    var def = W[list[0]];
    return { id: list[0], level: def.level, text: def.text, priority: def.priority };
  }

/* ============================ 演示自动驾驶 ============================ */
  /*
   * 返回一个 cmd 对象交给 update()，模拟一位真实车主的骑行节奏：
   * 上电停放 → 收起边撑 → 起步 → 巡航中随机减速/转弯/变模式 → 低电充电。
   */
  function autoDrive(v, dt) {
    var a = v.auto;
    var cmd = {};
    if (!a.enabled) return cmd;

    a.t += dt;

    /* ---------- 1. 上电停放 ---------- */
    if (a.phase === 'park') {
      if (a.t > 0.4 && a.t < 2.0) v.kickstand = true;             // 放下边撑
      if (a.t > 1.2 && a.t < 1.4) cmd.gear = 'X1';                // 故意挂挡 → 触发告警
      if (a.t > 2.2) v.kickstand = false;                          // 收起边撑
      if (a.t > 3.2) {
        v.lamps.lock = false;                                    // 起步前解锁龙头锁
        shiftGear(v, 'X1');                                      // 起步挡 = 新国标
        a.phase = 'ride';
        a.t = 0;
        a.segT = 0;
        a.segLen = 4;
        a.cruise = 26;
        cmd.setLamp = { beamLow: true };
        cmd.setLamp.beam = true;
      }
      return cmd;
    }

    /* ---------- 2. 充电中 ---------- */
    if (a.phase === 'charge') {
      a.chargeT += dt;
      cmd.throttle = 0;
      if (v.soc > 62 || a.chargeT > 90) {
        v.charger = false;
        a.phase = 'park';
        a.t = 0;
      }
      return cmd;
    }

    /* ---------- 3. 骑行 ---------- */
    a.segT += dt;

    /* 人工操作结束后可能停在 P 档：等 2.5 秒自动重新起步 */
    if (v.gear === V.parkGear && v.soc > 8 && !v.charger) {
      a.parkT = (a.parkT || 0) + dt;
      if (a.parkT > 2.5) {
        v.kickstand = false;
        v.lamps.lock = false;
        shiftGear(v, 'X1');
        a.parkT = 0;
      }
      return cmd;
    }
    a.parkT = 0;

    /* 低电量：靠边停车插枪 */
    if (v.soc <= 6 && Math.abs(v.speed) < 2) {
      v.charger = true;
      v.lamps.usb = false;
      v.lamps.lock = true;                                       // 停车插枪：锁上龙头锁
      a.phase = 'charge';
      a.chargeT = 0;
      return cmd;
    }

    /* 段落调度：每隔几秒换一个动作 */
    if (a.segT > a.segLen) {
      a.segT = 0;
      a.segLen = 7 + Math.random() * 10;
      var r = Math.random();
      var mMax = gearDef(v).maxSpeed;

      if (r < 0.60) {
        /* 演示场景 ①②③：转向灯三连 —— 左转 / 右转 / 双闪**轮流演**，
           而不是各凭概率（否则 240 秒里可能一次双闪都不出现） */
        var turn = (a.turnCycle || 0) % 3;
        a.turnCycle = turn + 1;
        a.cruise = 12 + Math.random() * 10;
        if (turn === 0) {
          /* ① 左转 —— 打左转向灯 + 刹到低速 */
          a.brakeUntil = a.t + 3.5 + Math.random() * 2;
          cmd.turnL = true;
        } else if (turn === 1) {
          /* ② 右转 —— 打右转向灯 + 刹到低速 */
          a.brakeUntil = a.t + 3.5 + Math.random() * 2;
          cmd.turnR = true;
        } else {
          /* ③ 双闪 —— 靠边示警，左右两颗一起闪，几秒后熄灭 */
          a.brakeUntil = a.t + 2.5 + Math.random() * 2;
          cmd.hazard = true;
          a.hazUntil = a.t + 7 + Math.random() * 4;
        }
      } else if (r < 0.74) {
        /* 换挡位并重新定速 */
        cycleGear(v);
        a.cruise = 16 + Math.random() * (gearDef(v).maxSpeed - 14);
        a.cruise = Math.max(14, Math.min(a.cruise, mMax));
      } else if (r < 0.75) {
        /* 开关远光灯（注意：不要同时给 beam，否则会覆盖 beamLow） */
        var high = !v.lamps.beamHigh;
        cmd.setLamp = { beamHigh: high, beamLow: !high };
      } else if (r < 0.80) {
        /* 短按喇叭式的功能切换：USB 供电 / 蓝牙 */
        cmd.setLamp = { usb: !v.lamps.usb };
      } else if (r < 0.90) {
        /* 手机音源开 / 关（左侧「音乐」芯片随之点亮） */
        cmd.mediaFlip = true;
      } else {
        a.cruise = 18 + Math.random() * 18;
      }
    }

    /* 目标车速 → 油门 */
    var want = a.cruise;
    if (a.brakeUntil > a.t) want = 5;

    var thr = clamp((want - Math.abs(v.speed)) * 0.085, -0.9, 1);
    if (want <= 8 && Math.abs(v.speed) > 9) thr = -0.42;    // 明显制动（触发能量回收）
    cmd.throttle = thr;

    /* 转向灯到点自动关（真车是位移 / 时间触发的，这里额外补一刀） */
    if (a.brakeUntil > 0 && a.t > a.brakeUntil + 2.5) {
      cmd.turnL = false;
      cmd.turnR = false;
      a.brakeUntil = 0;
    }
    /* 双闪到点熄灭 */
    if (a.hazUntil > 0 && a.t > a.hazUntil) {
      cmd.hazard = false;
      a.hazUntil = 0;
    }
    return cmd;
  }


export { create, update, autoDrive, warnings, shiftGear, cycleGear, rideGear, gearDef };
