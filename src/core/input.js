/*!
 * input.js — 键盘控制（把按键翻译成 Vehicle.update 能吃的 cmd）
 * ------------------------------------------------------------------
 * 三个来源，优先级从高到低：
 *   ① 操作台（ControlPanel）用 push() 塞进来的指令队列（一次性）
 *   ② 操作台用 hold() 发起的「油门脉冲」（急加速 / 急减速 / 滑行）
 *   ③ 键盘（↑/↓ 油门、方向键转向、字母挡位键、灯类开关…）
 * 松开按键 6 秒后自动交出控制权 → useHud 会切回演示自动驾驶
 * （⚠ 只要还有键按着就不交权 —— 否则长按 ↑ 加速到第 7 秒会被演示抢走方向盘）。
 * 所有按键都在「帮助」浮层里有说明（按 ? 显示）。
 *
 * 按键表（详细见 HelpPanel.vue）：
 *   ↑ / W    加速        ↓ / S    减速（能量回收）
 *   ← / →    左 / 右转向（**按住**期间亮；两个一起按 = 双闪）
 *   A E C F  骑行挡位（助力推行 / 经济 / 滑行 / 激烈，按下即换挡）
 *   P        驻车 P 挡   G        换下一挡位
 *   H 双闪    L 大灯      K 龙头锁   R 定速巡航
 *   B 蓝牙    U USB 供电  Y 手机音源 M 自动驾驶演示  X 边撑  V 充电枪
 *   O 操作弹框 ? 帮助      I/N/J/T 消息 / 导航 / 媒体 / 设置
 *
 * 纯 ESM：createInput() 每次调用生成独立实例，卸载时可 dispose()，
 * 因此 HMR / 组件重挂载都不会残留事件监听。
 */

/* 松开键盘多久后交还演示自动驾驶 */
const MANUAL_MS = 6000;

/* 骑行挡位：字母键 a/e/c/f = A/E/C/F（x1 / x2 暂停用），p = 驻车 P */
const GEAR_KEYS = { a: 'A', e: 'E', c: 'C', f: 'F', p: 'P' };

/* 方向键（e.key 的小写形式） */
const K_L = 'arrowleft';
const K_R = 'arrowright';

export function createInput(opts) {
  const onToggleHelp = (opts && opts.onToggleHelp) || function () {};
  const onTogglePanel = (opts && opts.onTogglePanel) || function () {};
  const onClosePanel = (opts && opts.onClosePanel) || function () {};
  /* 应用页（左灯塔五个芯片）：i 消息 / n 导航 / j 媒体 / t 设置 */
  const onOpenPage = (opts && opts.onOpenPage) || function () {};

  const keys = {};
  let pending = {};
  let manualUntil = 0;
  let bound = false;

  /* 操作台发起的油门脉冲：thr 油门值，直到 holdUntil 之前一直生效 */
  let holdThr = 0;
  let holdUntil = 0;

  /* 上一次「发给车辆」的转向电平（← / → / 双闪）。
     ⚠ 转向是**电平**语义：只在状态变化时发一次 cmd —— 每帧都发会把
     turnSince / turnDist 一直清零，config.turnAuto 的单边自动回位就永远不生效。 */
  const turnSent = { l: false, r: false, haz: false };

  function touch() { manualUntil = Date.now() + MANUAL_MS; }

  function tap(kl) {
    /* 挡位（a/e/c/f 直接选挡，p 驻车） */
    if (GEAR_KEYS[kl]) { pending.gear = GEAR_KEYS[kl]; return; }

    switch (kl) {
      case 'g': pending.gearCycle = true; break;         // 换下一挡位（六边形心跳）
      case 'h': pending.hazardFlip = true; break;        // 双闪（左右一起闪）
      case 'l': pending.toggleLamp = 'beam'; break;
      case 'k': pending.toggleLamp = 'lock'; break;      // 龙头锁 OFF / ON
      case 'r': pending.toggleLamp = 'cruise'; break;    // 定速巡航（C 让给挡位键了）
      case 'b': pending.toggleLamp = 'bt'; break;
      case 'u': pending.toggleLamp = 'usb'; break;
      case 'y': pending.mediaFlip = true; break;         // 手机音源开 / 关
      case 'x': pending.kickstandFlip = true; break;
      case 'v': pending.chargerFlip = true; break;
      case 'm': pending.autoFlip = true; break;
      case 'i': onOpenPage('msg'); break;                // 消息中心
      case 'n': onOpenPage('nav'); break;                // 导航
      case 'j': onOpenPage('music'); break;              // 媒体播放器
      case 't': onOpenPage('set'); break;                // 设置
      case 'o': onTogglePanel(); break;                  // 操作弹框 开 / 关
      case 'escape': onClosePanel(); break;              // 关掉应用页 / 弹框（useHud 里排优先级）
      case '?': onToggleHelp(); break;
      default: break;
    }
  }

  function onDown(e) {
    const kl = (e.key || '').toLowerCase();
    /* 方向键 / 空格会滚动页面 → 一律吃掉 */
    if (kl === 'arrowup' || kl === 'arrowdown' || kl === K_L || kl === K_R ||
        kl === ' ' || kl === 'spacebar') {
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
    /* 还按着的键也算「人工操作中」（长按 ↑ 不会被演示抢走） */
    let anyDown = false;
    for (const k in keys) {
      if (keys[k]) { anyDown = true; break; }
    }
    if (!manual && !hasPending && !holding && !anyDown) return null;

    const cmd = {};
    let thr = 0;
    if (keys['w'] || keys['arrowup']) thr += 1;
    if (keys['s'] || keys['arrowdown']) thr -= 1;
    /* 操作台的油门脉冲优先于键盘（急加速 / 急减速 / 滑行就是靠它） */
    cmd.throttle = holding ? holdThr : thr;

    /* 方向键转向：← 左转、→ 右转、两个一起按 = 双闪（只发变化的那一次） */
    const wantL = !!keys[K_L];
    const wantR = !!keys[K_R];
    const wantHaz = wantL && wantR;
    if (wantL !== turnSent.l || wantR !== turnSent.r || wantHaz !== turnSent.haz) {
      /* 双闪优先：两个都按住时只发 hazard（不依赖 update() 里「先单边后双闪」的先后顺序） */
      cmd.turnL = wantHaz ? false : wantL;
      cmd.turnR = wantHaz ? false : wantR;
      cmd.hazard = wantHaz;
      turnSent.l = wantL;
      turnSent.r = wantR;
      turnSent.haz = wantHaz;
    }

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
