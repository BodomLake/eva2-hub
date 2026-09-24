/*!
 * input.js — 键盘控制（把按键翻译成 Vehicle.update 能吃的 cmd）
 * ------------------------------------------------------------------
 * 三个来源，优先级从高到低：
 *   ① 操作台（ControlPanel）用 push() 塞进来的指令队列（一次性）
 *   ② 操作台用 hold() 发起的「油门脉冲」（急加速 / 急减速 / 滑行）
 *   ③ 键盘（W/S 油门、挡位键、灯类开关…）
 * 松开按键 6 秒后自动交出控制权 → useHud 会切回演示自动驾驶。
 * 所有按键都在「帮助」浮层里有说明（按 ? 显示）。
 *
 * 纯 ESM：createInput() 每次调用生成独立实例，卸载时可 dispose()，
 * 因此 HMR / 组件重挂载都不会残留事件监听。
 */

/* 松开键盘多久后交还演示自动驾驶 */
const MANUAL_MS = 6000;

/* 骑行挡位：数字键 1~6 = A/E/C/F/X1/X2，p = 驻车 P */
const GEAR_KEYS = { '1': 'A', '2': 'E', '3': 'C', '4': 'F', '5': 'X1', '6': 'X2', 'p': 'P' };

export function createInput(opts) {
  const onToggleHelp = (opts && opts.onToggleHelp) || function () {};
  const onTogglePanel = (opts && opts.onTogglePanel) || function () {};
  const onClosePanel = (opts && opts.onClosePanel) || function () {};

  const keys = {};
  let pending = {};
  let manualUntil = 0;
  let bound = false;

  /* 操作台发起的油门脉冲：thr 油门值，直到 holdUntil 之前一直生效 */
  let holdThr = 0;
  let holdUntil = 0;

  function touch() { manualUntil = Date.now() + MANUAL_MS; }

  function tap(kl) {
    /* 挡位（1~6 直接选挡，p 驻车） */
    if (GEAR_KEYS[kl]) { pending.gear = GEAR_KEYS[kl]; return; }

    switch (kl) {
      case 'g': pending.gearCycle = true; break;         // 换下一挡位（六边形心跳）
      case 'a': pending.turn = 'turnL'; break;           // 左转向（READY 左侧箭头）
      case 'f': pending.turn = 'turnR'; break;           // 右转向（READY 右侧箭头）
      case 'h': pending.hazardFlip = true; break;        // 双闪（左右一起闪）
      case 'l': pending.toggleLamp = 'beam'; break;
      case 'k': pending.toggleLamp = 'lock'; break;      // 龙头锁 OFF / ON
      case 'c': pending.toggleLamp = 'cruise'; break;
      case 'b': pending.toggleLamp = 'bt'; break;
      case 'u': pending.toggleLamp = 'usb'; break;
      case 'y': pending.mediaFlip = true; break;         // 手机音源开 / 关
      case 'x': pending.kickstandFlip = true; break;
      case 'v': pending.chargerFlip = true; break;
      case 'm': pending.autoFlip = true; break;
      case 'o': onTogglePanel(); break;                  // 操作弹框 开 / 关
      case 'escape': onClosePanel(); break;              // 关掉弹框
      case '?': onToggleHelp(); break;
      default: break;
    }
  }

  function onDown(e) {
    const kl = (e.key || '').toLowerCase();
    if (kl === 'arrowup' || kl === 'arrowdown' || kl === ' ' || kl === 'spacebar') {
      e.preventDefault();
    }
    touch();
    if (keys[kl]) return;          // 忽略操作系统的自动重复
    keys[kl] = true;
    tap(kl);
  }

  function onUp(e) {
    keys[(e.key || '').toLowerCase()] = false;
    touch();
  }

  function init() {
    if (bound) return;
    bound = true;
    document.addEventListener('keydown', onDown, false);
    document.addEventListener('keyup', onUp, false);
  }

  function dispose() {
    if (!bound) return;
    bound = false;
    document.removeEventListener('keydown', onDown, false);
    document.removeEventListener('keyup', onUp, false);
  }

  /* 返回手动指令；返回 null 表示「无人工操作」→ 交给自动驾驶 */
  function commands() {
    const manual = Date.now() < manualUntil;
    const holding = Date.now() < holdUntil;
    let hasPending = false;
    for (const p in pending) {
      if (Object.prototype.hasOwnProperty.call(pending, p)) { hasPending = true; break; }
    }
    if (!manual && !hasPending && !holding) return null;

    const cmd = {};
    let thr = 0;
    if (keys['w'] || keys['arrowup']) thr += 1;
    if (keys['s'] || keys['arrowdown']) thr -= 1;
    /* 操作台的油门脉冲优先于键盘（急加速 / 急减速 / 滑行就是靠它） */
    cmd.throttle = holding ? holdThr : thr;

    for (const p in pending) {
      if (Object.prototype.hasOwnProperty.call(pending, p)) cmd[p] = pending[p];
    }
    pending = {};
    return cmd;
  }

  /* ---------------- 给操作台（ControlPanel）用的两个入口 ---------------- */

  /* 塞一条指令进队列（下一帧生效），并把自己标记成「人工操作中」 */
  function push(cmd) {
    if (!cmd) return;
    for (const k in cmd) {
      if (Object.prototype.hasOwnProperty.call(cmd, k)) pending[k] = cmd[k];
    }
    touch();
  }

  /* 油门脉冲：thr=1 急加速、-1 急减速（会触发能量回收）、0 松油门滑行 */
  function hold(thr, ms) {
    holdThr = clampThr(thr);
    holdUntil = Date.now() + Math.max(0, ms || 0);
    touch();
  }

  function clampThr(v) {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return n < -1 ? -1 : (n > 1 ? 1 : n);
  }

  return {
    init: init,
    dispose: dispose,
    commands: commands,
    push: push,
    hold: hold,
    isManual: function () { return Date.now() < manualUntil; },
    keys: keys
  };
}
