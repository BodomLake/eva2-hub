/*!
 * config.js — 全局配置（唯一需要改参数的地方）
 * ------------------------------------------------------------------
 * 仪表上所有可调数字都集中在这里：设计基准分辨率、刷新率、车辆参数、
 * 电量/氮气分段配色、告警文案、开机自检脚本、左上/左下芯片清单。
 *
 * 纯 ESM 模块：Vite 打包给浏览器，Node 也能直接 import（tools/smoke.js）。
 */

export const CONFIG = {

  /* ---------------------------------------------------------------
   * 设计基准分辨率：整个 HUD 以 1:1 画在这个坐标系里，
   * 再由 useStage.js 等比缩放到浏览器窗口（对应实车 ~1.86:1 的横屏）。
   * 改动后请同步修改 src/styles/base.css 的 --stage-w / --stage-h。
   * ------------------------------------------------------------- */
  design: { width: 1280, height: 688 },

  brand: {
    name: 'ninebot',
    model: 'MECHANIC II',
    edition: 'ASUKA EDITION',
    coreLabel: 'ASUKA',         // 六边形底部的名字
    dualMode: '×2'              // 右上角挡位徽标第二行（双电模式；参考图只有「×2」）
  },

  /* 刷新节流：文本类读数不需要 60fps，避免数字闪烁 */
  rates: {
    textHz: 8,
    blinkMs: 400                // 转向灯闪烁半周期
  },

  units: { speed: 'km/h', distance: 'km', power: 'W', temp: '℃' },

  /* ---------------------------------------------------------------
   * 车辆参数（demo 模拟器用，非官方标定值）
   * ------------------------------------------------------------- */
  vehicle: {
    capacityWh: 720,            // 48V / 15Ah ≈ 720Wh
    fullRangeKm: 145,           // 双电满电续航（对应右下角那条的 145km）
    regenCoef: 0.32,            // 松油门滑行的回收功率系数
    coastDrag: 0.5,             // 滑行减速度 m/s²
    brakePower: 3.4,            // 制动减速度 m/s²

    /* ---------------------------------------------------------------
     * 骑行挡位（原车仪表「右上角」那块徽标讲的就是当前骑行挡位）
     *   A  助力推行   E  经济模式   C  滑行模式
     *   F  激烈模式   X1 新国标     X2 新国飚
     * 切换挡位时中央六边形会做一次「心跳」缩放（见 CoreHex.vue）。
     *   maxSpeed km/h · accel 加速系数 · powerCap W · rangeFactor 续航系数
     * ------------------------------------------------------------- */
    parkGear: 'P',              // 驻车挡：参考图正中那个大字 P
    gearOrder: ['A', 'E', 'C', 'F', 'X1', 'X2'],
    gears: {
      A:  { name: '助力推行', maxSpeed: 6,  accel: 0.90, powerCap: 400,  rangeFactor: 1.35 },
      E:  { name: '经济模式', maxSpeed: 25, accel: 1.10, powerCap: 700,  rangeFactor: 1.15 },
      C:  { name: '滑行模式', maxSpeed: 28, accel: 1.45, powerCap: 950,  rangeFactor: 1.00 },
      F:  { name: '激烈模式', maxSpeed: 45, accel: 2.60, powerCap: 1600, rangeFactor: 0.82 },
      X1: { name: '新国标',   maxSpeed: 25, accel: 1.25, powerCap: 800,  rangeFactor: 1.10 },
      X2: { name: '新国飚',   maxSpeed: 50, accel: 2.85, powerCap: 1800, rangeFactor: 0.78 }
    }
  },

  /* ---------------------------------------------------------------
   * 左上角天气 + 时间（参考图：上面天气、下面时间，同一个芯片）
   * 接真实天气：改 state.weather 即可；icons 里的四个 id 都会注册。
   * ------------------------------------------------------------- */
  weather: {
    current: 'fog',
    cycleSec: 45,                                  // demo 里轮换的间隔
    icons: { fog: 'i-fog', cloud: 'i-cloud', rain: 'i-rain', sun: 'i-sun' },
    text:  { fog: '雾',    cloud: '多云',    rain: '雨',    sun: '晴' }
  },

  /* 电机温度模型：升温系数 ℃/s per kW，散热系数 1/℃·s */
  thermal: {
    ambient: 35,                // 环境温度
    heatGain: 1.10,             // 每千瓦每秒升温
    coolRate: 0.012,            // (T-ambient) * coolRate * dt
    warn: 120,
    critical: 145,
    max: 160
  },

  /* ---------------------------------------------------------------
   * 右下角氮气条（NOS 100% → 5 格紫色斜条，装在紫色不规则五边形里）
   * value = state.nos（0~100），5 格由深到浅逐级点亮
   * ------------------------------------------------------------- */
  nos: {
    segments: 5,
    colors: ['#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd']
  },

  /* ---------------------------------------------------------------
   * 双电电量表（底栏中间「并列一排」两条：容量 / 续航）
   *   高于 high → 绿；high~low → 黄；低于 low → 红（闪烁）
   *   参考图是 51%，落在 20~60 的中间档 → 黄色
   * ------------------------------------------------------------- */
  socBar: { high: 60, low: 20 },

  /* ---------------------------------------------------------------
   * 指示灯 / 上电初始值
   *   turnL / turnR = 左 / 右转向灯（READY 铭牌左右两侧那两颗箭头）
   *   hazard        = 双闪（左右两颗一起闪；开双闪时单边转向自动取消）
   *   lock          = 龙头锁（六边形右下角的开关标志，OFF = 未锁）
   *   gps           = 定位芯片（左下角三芯片之一）
   * ------------------------------------------------------------- */
  lamps: {
    beamLow: false, beamHigh: false,
    turnL: false, turnR: false, hazard: false,
    cruise: false, abs: true, seat: false,
    regen: true, lock: false, bt: true, signal: true,
    gps: true, usb: false, mode: true, warn: false
  },

  /* 车辆上电后的初始状态（数值刻意贴近参考图那一帧） */
  seed: {
    gear: 'P',                  // 驻车（参考图正中那个大字 P）
    gearLast: 'X1',             // 上次骑行挡位：X1 新国标（参考图右上角徽标）
    speed: 0,
    power: 0,
    soc: 51,                    // 主电池 %
    auxSoc: 100,                // BATT 紫框（副电/外接电池）%
    odo: 11971,                 // 总里程 km
    rideSec: 58 * 60,           // 本次骑行时长
    tripKm: 28.1,               // 本次骑行里程（左侧圆盘 TRIP）
    nos: 100,                   // 氮气条剩余量 %
    motorTemp: 116,             // 电机温度 ℃（偏高但正常：≥120 才告警）
    ambient: 35
  },

  /* 转向灯自动回位：打灯后骑行 N 米或 M 秒自动熄灭（0 = 不自动） */
  turnAuto: { meters: 300, seconds: 45 },

  /* ---------------------------------------------------------------
   * 左侧功能灯塔：5 个六边形芯片（自上而下，与参考图一致）
   * ------------------------------------------------------------- */
  rail: [
    { id: 'msg',   icon: 'i-msg',   label: '消息' },
    { id: 'nav',   icon: 'i-nav',   label: '导航' },
    { id: 'nerv',  icon: 'i-nerv',  label: 'NERV' },
    { id: 'music', icon: 'i-music', label: '音乐' },
    { id: 'set',   icon: 'i-set',   label: '设置' }
  ],

  /* ---------------------------------------------------------------
   * 左下角开关组：网络信号 / 耳机带蓝牙 / GPS（上 1 下 2，五边形芯片）
   * ------------------------------------------------------------- */
  cluster: [
    /* slot 决定图标在这块五边形里的格子（参考图：信号在左上、耳机蓝牙在左下、GPS 在右下） */
    { id: 'signal',  icon: 'i-signal',  slot: 'tl', label: '网络信号', lamp: 'signal' },
    { id: 'headset', icon: 'i-headset', icon2: 'i-bt', slot: 'bl', label: '耳机蓝牙', lamp: 'bt' },
    { id: 'gps',     icon: 'i-gps',     slot: 'br', label: 'GPS 信号', lamp: 'gps' }
  ],

  /* ---------------------------------------------------------------
   * 告警表：按 priority 从大到小取最高优先级显示
   *   label = 操作台（ControlPanel）按钮上的短标签
   *   text  = 顶部横幅上的完整提示
   * ------------------------------------------------------------- */
  warnings: {
    LOW_SOC:     { priority: 30, level: 'amber', label: '电量偏低',   text: '电量低于 20% · 建议开启 E 经济挡' },
    CRIT_SOC:    { priority: 60, level: 'red',   label: '电量极低',   text: '电量极低 · 请尽快充电' },
    MOTOR_WARM:  { priority: 40, level: 'amber', label: '电机偏热',   text: '电机温度偏高 · 请适当减速' },
    MOTOR_HOT:   { priority: 70, level: 'red',   label: '电机过热',   text: '电机温度过高 · 请立即减速冷却' },
    NO_BT:       { priority: 10, level: 'amber', label: '未连手机',   text: '未连接手机 · 蓝牙已断开' },
    KICKSTAND:   { priority: 80, level: 'red',   label: '边撑未收',   text: '边撑未收起 · 无法挂挡行驶' },
    LOCKED:      { priority: 79, level: 'red',   label: '龙头锁',     text: '龙头锁已锁 · 请先解锁再行驶' },
    CHARGER:     { priority: 55, level: 'red',   label: '充电枪',     text: '充电枪未拔出 · 请解除后再行驶' }
  },

  /* 开机自检动画 */
  boot: {
    enabled: true,
    stepMs: 260,                // 每行日志间隔（7 行 ≈ 1.8s 写完）

    /* ---------------------------------------------------------------
     * 「等多久才进入主界面」—— 想让它停久一点就改这里：
     *   minMs     从出现到进入主界面的**最短停留**：进度条写满后继续停
     *             在 100% 等满这段时间（默认 3000 = 3s），然后红闪擦除
     *             进入主界面。调大它就等于「自检画面多停一会儿」。
     *             ⚠ 这是**从页面出现算起**的：自检日志约 2s 写完，所以默认
     *             下「写满后」还要再等约 1s；想「写满后再停 3s」就设 5000
     *             左右（停留期提示行会实时显示还剩几秒）。
     *   waitEnter true = 写满后**不自动进入**，停在「按任意键 / 点击进入」
     *             等一次人工操作（演示时想让人看清自检画面就打开它）。
     *   holdMs    兜底：无论如何最多停留多久（waitEnter = true 时不生效）
     * 也能用地址栏临时覆盖、不动代码：?boot=5000（毫秒）、?boot=wait
     * （= 等按键）、?boot=0（= 立刻进主界面）。
     * ------------------------------------------------------------- */
    minMs: 3000,
    waitEnter: true,
    holdMs: 12000,              // 兜底：最多停留多久

    /* ---------------------------------------------------------------
     * 两侧立绘「预留位」（自检页左右各一张，从屏幕外「划入」）
     * 用图就两步：把图丢进 src/assets/art/，在下面填文件名。
     *   left/right.src
     *             文件名（'asuka_stand.png'，后缀可以省）→ 从 src/assets/art/
     *             里按名字取；也可以写路径（'./art/x.png' → public/art/）
     *             或 URL（挂 CDN）。**留空 = 这一侧什么都不显示** ——
     *             空着就是「预留位」本来的样子，不会报错也不会出现碎图标。
     *             ⚠ 白底图先跑一次 `npm run art`（tools/cutout.js）抠成透明底，
     *               否则黑底 HUD 上会出现两块白板。名字写错时这一侧安静地
     *               不显示（控制台有 warn，npm run check 也会提前拦下来）。
     *   w          这一侧的框宽（设计像素，屏幕基准 1300×760）。框高固定为
     *              自检页的 86%，图按 contain 缩放 → 竖图通常「高度顶满」，
     *              所以 w 只要略大于「实际渲染宽度」即可（贴边，不露空框）。
     *   opacity    0~1
     *   blend      'normal' | 'screen'（screen = 暗底全息发光感）
     *   flip       true = 水平镜像（立绘朝向屏幕外侧时用得上）
     *   tag        角上的小标签（等宽字体，和锁定框贴同一侧）
     *   slideMs    从屏幕外「划入」的时长（右侧比左侧晚 60ms 出发）
     *   scrim      中间文字列后面的压暗强度（0 = 不压暗，1 = 全黑）
     * 地址栏临时开关：?art=off（关）/ ?art=1（开）。
     * ------------------------------------------------------------- */
    art: {
      enabled: true,
      left: {
        src: 'asuka_stand.png',
        w: 340, opacity: .88, blend: 'normal', flip: false,
        tag: 'PILOT · SYNC 100%'
      },
      right: {
        src: 'eva-02-right.png',
        w: 446, opacity: .88, blend: 'normal', flip: false,
        tag: 'UNIT-02 · MAINTENANCE BAY'
      },
      slideMs: 900,
      scrim: .55
    },

    /* ---------------------------------------------------------------
     * 环里六边形内部的徽记（NERV 标志）—— 和两侧立绘同一套「预留位」规则
     * 用图两步：把图丢进 src/assets/art/（白底图先跑 npm run art 抠底），
     * 然后在下面填文件名。
     *   src      文件名（'nerv2.png'，后缀可以省）→ 从 src/assets/art/ 取；
     *            也可以写路径（'./art/x.png'）或 URL（挂 CDN）。
     *            **留空 = 六边形里什么都不画**（空着就是预留位本来的样子）。
     *   fit      'cover'   铺满六边形（超出六边形的部分被裁掉，字更大更醒目）
     *            'contain' 整个徽记缩进六边形里（连外圈那行祷词一起）
     *   scale    整体缩放倍率（1 = 正好贴住六边形包围盒）
     *   opacity  0~1
     *   blend    'normal' | 'screen'（screen = 暗底全息发光感）
     * 地址栏临时开关：?mark=off（关）/ ?mark=1（开）。
     * ------------------------------------------------------------- */
    mark: {
      enabled: true,
      src: 'nerv2.png',
      fit: 'contain',
      scale: 1.2,
      opacity: .92,
      blend: 'normal'
    },

    lines: [
      'EVA-02  VECTOR HUD  SYSTEM CHECK',
      'POWER BUS          48.0V   <b>OK</b>',
      'IMU / 陀螺仪标定   <b>OK</b>',
      'BMS 握手           51%     <b>OK</b>',
      'MOTOR TEMP         116C    <b>WARM</b>',
      'A.T.FIELD SYNC     <b>100%</b>',
      'ALL SYSTEMS        <b>GO</b>'
    ]
  }
};

/* ============================ 小工具 ============================ */
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function pad(n, w) {
  let s = String(Math.floor(Math.abs(n)));
  while (s.length < w) s = '0' + s;
  return s;
}
/* 浅拷贝（用于把 config 的默认值复制成可变状态） */
export function copy(obj) {
  const o = {};
  for (const k in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) o[k] = obj[k];
  }
  return o;
}
