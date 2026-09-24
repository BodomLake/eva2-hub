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
    coreLabel: 'ASUKA'          // 六边形底部的名字
    /* ⚠ 这里原来有个 `dualMode: '×2'`（右上角徽标第二行）—— **不要再加回来**：
       那块地方要展现的是**当前骑行挡位代号**（A / E / C / F / P），
       不是「双电 / 三电模式」。代号取自快照里的 view.gearShort（TopBar.vue）。 */
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
    coastDrag: 0.9,             // 滑行减速度 m/s²（原来 0.5，滑行太久像没在开）
    brakePower: 6.5,            // 制动减速度 m/s²（≈0.66g：100→0 只要 4 秒多）

    /* ---------------------------------------------------------------
     * 骑行挡位（原车仪表「右上角」那块徽标讲的就是当前骑行挡位）
     *   A  助力推行   E  经济模式   C  滑行模式   F  激烈模式
     *   ⚠ X1 新国标 / X2 新国飚 **暂停用**（这一版不做）。想加回来只要在
     *     gearOrder / gears 里补两行 + core/input.js 的 GEAR_KEYS 补两个键，
     *     其余代码（功率量程、操作台按钮、演示自动驾驶、测试）全自动适配。
     * 切换挡位时中央六边形会做一次「心跳」缩放（见 CoreHex.vue）。
     *   maxSpeed km/h · accel 加速系数 · powerCap W · rangeFactor 续航系数
     *   ⚠ 功率表量程 = 这里最大的 powerCap 向上取整到 200（core/gauges.js）
     *     → F 挡 10000W = **满量程 10kW**（需求：功率上限提到 10kW）。
     *   maxSpeed 决定能跑多快：F 挡 120 → 演示能破百（>100 km/h）。
     * ------------------------------------------------------------- */
    parkGear: 'P',              // 驻车挡：参考图正中那个大字 P
    gearOrder: ['A', 'E', 'C', 'F'],
    gears: {
      A: { name: '助力推行', maxSpeed: 8,   accel: 1.6, powerCap: 800,   rangeFactor: 1.35 },
      E: { name: '经济模式', maxSpeed: 45,  accel: 2.4, powerCap: 1600,  rangeFactor: 1.15 },
      C: { name: '滑行模式', maxSpeed: 65,  accel: 3.4, powerCap: 3200,  rangeFactor: 1.00 },
      F: { name: '激烈模式', maxSpeed: 120, accel: 5.2, powerCap: 10000, rangeFactor: 0.78 }
    },

    /* ---------------------------------------------------------------
     * 中央六边形里的「挡位图」（第 10 轮新增）
     *   原图丢进 src/assets/gear/（A / C / E / F 四张，白底或棋盘格底都行），
     *   先跑一次 `npm run art` 抠成透明底 → 产物写进 src/assets/art/gear-*.png，
     *   下面 map 里填的就是**产物名**（按名字解析，见 core/artslot.js）。
     *   换挡时：六边形心跳一次（CoreHex.vue 的 coreBeat）+ 图案交叉淡入。
     *     fallbackEmblem  没配图的挡位（现在只有 P）→ 继续用原创机甲徽记
     *                     （留个底，免得这几种挡位的六边形里空一块）
     *     fit / opacity / blend  与自检页立绘同一套语义（cover = 铺满六边形裁切区）
     *     veil      图上面再压一层暗幕（0 = 不压）—— 亮图会把中央大字吃掉，
     *               压一层之后「时速 / P」和挡位铭牌在任何图上都读得清
     *   ⚠ 立绘**不会**在换挡时消失：CoreHex.vue 里两层图叠着放（新图常显、
     *     旧图淡出后自己摘掉），并且在挂载时把四张图都预解码一遍
     *     —— 以前用 <Transition mode="out-in"> 时，快速连按换挡会让中间空一拍。
     * ------------------------------------------------------------- */
    gearArt: {
      enabled: true,
      map: { A: 'gear-a.png', C: 'gear-c.png', E: 'gear-e.png', F: 'gear-f.png' },
      fit: 'cover',
      opacity: .95,
      blend: 'normal',
      veil: .42,
      fallbackEmblem: true
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

  /* 电机温度模型：升温系数 ℃/s per kW，散热系数 1/℃·s
     ⚠ 功率上限提到 10kW 之后，heatGain 必须跟着降下来（原来 1.10 是按 1.8kW 调的：
        10kW 时 +11℃/s → 几秒就把 160℃ 顶死、告警常亮）。现在 0.30 →
        10kW 约 +3℃/s，高速迎面风能吹住（≈68℃），低速硬拉才会过热 —— 该报的还报。 */
  thermal: {
    ambient: 35,                // 环境温度
    heatGain: 0.30,             // 每千瓦每秒升温
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
   * 侧边氛围灯带（App.vue 里那两条 .strip）的「状态机」参数
   * ------------------------------------------------------------------
   * 颜色 / 闪烁写在 base.css 的 --strip-* 令牌与 .strip.is-* 规则里，
   * 这里只放**判定阈值**；两半必须一起改（tools/check.js 静态盯住这个映射）。
   * 状态与优先级（前一条成立就压过后面的，见 core/state.js 的 stripMode()）：
   *   fault  红色闪烁  有**红色级**告警（故障）；安全类信息压过一切
   *   boost  紫色闪烁  正在烧氮气（功率 > 当前挡位 powerCap × burnRatio）
   *   accel  蓝色常亮  加速中（油门 > accelThr 且功率 > minWatt）
   *   brake  绿色常亮  减速 / 能量回收（油门 < brakeThr 或负功率）
   *   park   黄色      驻车 / 未上电 / 充电中
   *   idle   淡青      其余（静止或匀速巡航）
   * ------------------------------------------------------------- */
  strip: {
    burnRatio: 0.72,            // 功率超过挡位上限的这个比例 = 在烧氮气（氮气条也按它掉）
    accelThr: 0.15,             // 油门大于它算「加速」
    brakeThr: -0.05,           // 油门小于它算「减速」
    minWatt: 30,                // 加速要有这点功率才点亮（防止「按着不给电」也变蓝）
    fadeMs: 320                 // 换挡时旧立绘淡出的时长（CoreHex.vue 用）
  },

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
    gearLast: 'C',              // 上次骑行挡位：C 滑行模式（默认起步挡，见 state.js autoDrive）
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
    CHARGER:     { priority: 55, level: 'red',   label: '充电枪',     text: '充电枪未拔出 · 请解除后再行驶' },

    /* ---- 第 9 轮新增：胎压胎温 / 坐垫 / 远程天气预警 ----
     * 阈值全部可改（设置页 → 存浏览器），裁决顺序仍按 priority 从大到小。
     * 具体告警文案由 core/tire.js 算出来后覆盖 text（带上轮位与实测值）。 */
    TIRE_LEAK:   { priority: 78, level: 'red',   label: '胎压过低',   text: '轮胎气压低于下限 · 请检查是否漏气' },
    NO_SEAT:     { priority: 76, level: 'red',   label: '未坐实',     text: '未检测到坐垫压力 · 请坐稳后再起步' },
    TIRE_HOT:    { priority: 74, level: 'red',   label: '胎温过高',   text: '轮胎温度过高 · 请停车降温后再行驶' },
    TIRE_OVER:   { priority: 46, level: 'amber', label: '胎压过高',   text: '轮胎气压高于上限 · 建议适当放气' },
    WEATHER_ALERT: { priority: 44, level: 'amber', label: '天气预警', text: '天气骤变预警 · 前方降雨，减速慢行' },
    TIRE_WARM:   { priority: 34, level: 'amber', label: '胎温偏高',   text: '轮胎温度偏高 · 注意长时间连续行驶' },
    TIRE_LOST:   { priority: 22, level: 'amber', label: '胎压信号',   text: '胎压传感器信号丢失 · 请检查传感器' }
  },

  /* ---------------------------------------------------------------
   * 左侧灯塔五个芯片打开的「应用页」（id 与 config.rail 一一对应）
   *   title/en/hint 给页面外壳（AppPage.vue）当标头用；
   *   body = 页面正文宽度（内容区最大宽，窄页面居中）
   * 出图 / 冒烟：?page=msg | nav | nerv | music | set
   * ------------------------------------------------------------- */
  pages: {
    msg:   { title: '消息中心', en: 'MESSAGE CENTER',  hint: '胎压胎温 · 天气预警 · 历史故障码', body: 900 },
    nav:   { title: '导航',     en: 'NAVIGATION',      hint: '高德 / 百度 / 腾讯 · 汽车·公交·骑行·步行', body: 1020 },
    nerv:  { title: 'NERV',     en: 'NERV TERMINAL',   hint: '未启用（9 号方案还没定）', body: 620 },
    music: { title: '媒体',     en: 'MEDIA PLAYER',    hint: '本地音视频 · File System Access API', body: 1020 },
    set:   { title: '设置',     en: 'SYSTEM SETTINGS', hint: '胎压监控 · 感应开关 · BMS · 版权', body: 1120 }
  },

  /* ---------------------------------------------------------------
   * 五个应用页的「默认值」（用户改过的值会存进浏览器，见 core/settings.js）
   *   这里只放默认值 + 演示数据；运行时状态在 core/ 的对应模块里算。
   * ------------------------------------------------------------- */
  apps: {

    /* ---------------- i-msg / i-set：胎压胎温 ----------------
     * 前后轮各自有上下限（胎压 kPa、胎温 ℃）；跑起来后可在设置页改，
     * 改完存 localStorage，立刻生效（state.warnings() 每次都用最新阈值裁决）。 */
    tire: {
      unit: 'kPa',
      barDiv: 100,                     // 240kPa = 2.40bar（设置页同时显示两种单位）
      wheels: [
        { id: 'front', name: '前轮', pos: 'F' },
        { id: 'rear',  name: '后轮', pos: 'R' }
      ],
      seed: { front: { kPa: 240, temp: 31 }, rear: { kPa: 236, temp: 34 } },
      limits: { kPaLow: 190, kPaHigh: 320, tempWarn: 55, tempHigh: 68 },
      demo: { leakKPaPerMin: 14, heatKPerMin: 2.2, settlePerSec: 0.05, ambient: 28 }
    },

    /* ---------------- i-msg：历史故障码（演示库） ----------------
     * 接真车时不用改这里 —— 调 hud.pushMessage() / hud.pushFault() 就行；
     * agoMin = 「多少分钟前」→ 上电时换算成时间戳，看起来像真的历史记录。 */
    faults: {
      history: [
        { code: 'E021', level: 'amber', kind: 'tire',   title: '前轮气压偏低',     text: '前轮气压 186kPa · 低于下限 190kPa',        agoMin: 42,   read: true },
        { code: 'P0A1F', level: 'amber', kind: 'fault', title: '电池组温度偏高',   text: 'BMS 报电池组 47℃ · 建议减少大功率输出',    agoMin: 118,  read: true },
        { code: 'U0100', level: 'red',  kind: 'fault',  title: '控制器通讯超时',   text: '控制器 CAN 心跳丢失 3s · 已自动恢复',      agoMin: 1260, read: true },
        { code: 'C1023', level: 'amber', kind: 'fault', title: '后轮电机霍尔异常', text: '后轮霍尔信号抖动 · 已记录 2 次',           agoMin: 2800, read: true },
        { code: 'B2101', level: 'info', kind: 'system', title: '固件升级完成',     text: '仪表固件已更新到 v2.1.0 · 无需操作',       agoMin: 4300, read: true }
      ]
    },

    /* ---------------- i-msg：远程推送（天气骤变等） ----------------
     * code 命中 config.warnings 的那几条会**同时**弹顶部横幅（走 pushAlert()），
     * 其余只进消息中心。demo = 设置页/消息页的「演示推送」按钮用。 */
    push: {
      demo: [
        { code: 'WEATHER_ALERT', level: 'amber', kind: 'weather', title: '天气骤变预警',
          text: '前方 8km 有雷阵雨 · 路面湿滑，建议减速慢行', from: '远程服务' },
        { code: 'ROAD_CLOSED', level: 'amber', kind: 'info', title: '路段管制',
          text: '目的地附近道路临时管制 · 已为你重新规划路线', from: '远程服务' }
      ]
    },

    /* ---------------- i-nav：地图供应商 / key / 出行模式 ----------------
     * keys 里填的是默认值（可以留空），设置页改过之后以浏览器缓存为准；
     * transport: 'auto' = 先 fetch，被 CORS 拦掉自动退回 JSONP；
     * proxy: 留空直连；填 'http://127.0.0.1:8787/?url={url}' 就走自己的转发。 */
    nav: {
      city: '上海',
      origin: { name: '当前位置', lng: 121.4737, lat: 31.2304 },
      dest:   { name: '南京东路 · 九号门店', lng: 121.4831, lat: 31.2385 },
      keys: {
        amap:    'b68b46e839559c60e8bf7b6fb2ecea48',
        baidu:   '16XEEphsYGls7FsF0rdltEVX9dqMio8U',
        tencent: ''
      },
      transport: 'auto',
      proxy: '',
      guideTickSec: 0.4              // 导航指引的刷新节流（秒）
    },

    /* ---------------- i-music → 媒体播放器 ----------------
     * 只加载「浏览器真的能播」的：先按扩展名进白名单，再问 canPlayType。
     * 想加格式就加在这里（键 = 扩展名，值 = MIME）。 */
    media: {
      audio: { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
               wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm' },
      video: { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg' },
      volume: 0.8,
      loopAll: true,
      autoplayNext: true,
      maxScan: 600,                  // 选文件夹时最多收多少个文件（防车机卡死）
      maxDepth: 6
    },

    /* ---------------- i-set：BMS（保护板） ----------------
     * board = 默认保护板 id（蚂蚁 ant / 极空 jk / 嘉百达 jbd / 彦阳 yy，见 core/ble.js）；
     * demo = true 时用演示数据包（十六串）驱动界面，真连接成功会自动切到实车数据。
     * ⚠ Web Bluetooth 只在 Chromium + 安全上下文下可用，设置页有「环境自检」卡片。 */
    bms: {
      board: 'jbd',
      name: 'EVA-BATT-02',
      demo: true,
      pollMs: 1500,
      cells: 16,
      designAh: 45,
      cutoffV: 2.85
    },

    /* ---------------- i-set：软件版权信息 ---------------- */
    about: {
      name: 'EVA-02 HUD',
      cn: '机械师二代「明日香」联名款风格智能仪表',
      version: '2.1.0',
      stack: 'Vue 3.5 + Vite 5 + vue-router 4（运行时两个依赖）',
      author: '个人学习 / 界面设计练习',
      license: 'MIT License',
      copyright: '© 2026 EVA-02 HUD PROJECT · ALL RIGHTS RESERVED',
      notice: '界面与图形（机甲徽记 / 图标 / 六边形骨架 / 芯片轮廓）均为原创几何绘制，' +
        '不含任何官方插画与字体文件。「ninebot」「机械师」「Evangelion / NERV」等商标' +
        '归各自权利人所有，本项目仅用于个人学习与非商业演示。',
      third: [
        { name: 'Vue 3', license: 'MIT', url: 'https://vuejs.org' },
        { name: 'vue-router 4', license: 'MIT', url: 'https://router.vuejs.org' },
        { name: 'Vite', license: 'MIT', url: 'https://vitejs.dev' }
      ]
    }
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
