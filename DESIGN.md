# 设计说明 · EVA-02 HUD

本文记录这套仪表**为什么长这样**，以及每个数字从哪来。
改样式之前建议先读一遍，避免动了一个值而在别处崩版。

---

## 1. 设计目标

1. **一眼能读**：车速 / 电量 / 功率三个最关键信息必须在 1 米外、0.5 秒内读懂，
   所以字号层级拉得很开（中央大字 150px → 数据读数 24px → 芯片 13px）。
2. **像块表，不像网页**：整屏被红色机身包裹，屏幕四角有暗角与扫描线，
   所有数字都带发光。
3. **状态一眼可辨**：异常（低电、电机过热、边撑未收、龙头锁上锁、充电）会同时出现在
   **顶栏铭牌变色 + 顶部告警横幅 + 左侧「消息」芯片红闪** 三处，形成三重冗余。

---

## 2. 画布与网格

整套 UI 在 **1280 × 688**（≈1.86:1 横屏仪表）的坐标系里做绝对布局，
再由 `useHud.js#fit()` 用 `transform: scale()` 等比缩放到窗口，
因此**任何分辨率下版式都一样**。

```
1280 × 688
└─ .bezel            机身外壳，内边距 15px，圆角 30px
   └─ .screen        屏幕，圆角 17px，overflow:hidden
      └─ .hud        padding 12 / 26 / 10
         ├─ .topbar      高 62
         ├─ .main        高 494（= 688 − 12 − 10 − 62 − 104 − 6×2）
         └─ .bottombar   高 104（196px / 1fr / 208px 三栏）
```

`.main` 是**定位容器**（不用网格分栏）：宽 1228、高 494，所有部件都
`position:absolute`，因此彼此**互不影响**、也绝不会互相挤压。

| 部件 | 定位规则（`.main` 内，中线 x = 614） | 说明 |
| --- | --- | --- |
| 左侧灯塔 | `left:0`，垂直居中 | 5 个平顶六边形芯片，5×50 + 4×4 = 266px 高 |
| TIME/TRIP 圆盘 | `right: calc(50% + 190px)`，`z-index:1` | 右边缘伸进六边形下方 45px（参考图有重叠） |
| 近光灯 | `right: calc(50% + 452px)` | 停在圆盘左侧的空档里 |
| 六边形核心 | `left:50%` + `translate(-50%,-50%)`，`z-index:3` | **永远精确居中**，且**压住左右两个圆** |
| 功率圆表 | `left: calc(50% + 190px)`，`z-index:1` | 与左侧圆盘镜像对称，左边缘同样伸进六边形下方 |
| ODO | 六边形内 `right: calc(100% - 62px); bottom: 56px` | 贴住**左下斜边**外侧 |
| 龙头锁 | 六边形内 `left: calc(100% - 62px); bottom: 56px` | 贴住**右下斜边**外侧 |

| 部件 | 尺寸 / 关键值 |
| --- | --- |
| 六边形核心 | 470 × 440，平顶六边形顶点 (6,220) (117.5,6) (352.5,6) (464,220) (352.5,434) (117.5,434) |
| 机甲徽记 | 350 × 350（左右镜像绘制，只在六边形内可见） |
| 中央大字（P / 时速） | 136px（3 位数降到 116px，P 挡 150px），`top:46%` |
| 挡位铭牌（六边形内） | 中下部 `bottom:72px`，`C 滑行模式` 19px + 11px |
| TIME/TRIP 圆盘 | 240 × 240，描边 8px（`conic-gradient` 外环 + 暗色内盘）；框内两行 = 金色标签牌 + 白色读数 |
| 功率圆表 | 268 × 268，粗环半径 128（`stroke-width:12` → 外径 239px，与左侧圆盘等大），刻度 140°→400°，数值弧半径 92 |
| 功率数值牌 | 自动宽度（`min-width:84px`）+ 圆角，`len-1/2` 62px、`len-3` 49px、`len-4` 37px、`len-5` 30px |
| 灰黑斜纹平行四边形 `.mesh` | **132 × 40**（高 = `.battgauge::before` 红梯形框的高，共用 base.css 的 `--mesh-h`）+ 两组 58° / −58° 细斜纹叠加；形状不用手写百分比，而是一对镜像多边形令牌 `--mesh-slash`（╱） / `--mesh-slash-r`（╲），斜切量 `--mesh-sk: 24%` —— 所以每块都是**真平行四边形**（上下边水平等长、左右斜边同斜率）；4 块：`--tl`（╲） `--tr`（╱） `--bl`（╱） `--br`（╲）。**一对左右共用同一条水平中线**（`--mesh-dy: 0`）→ 严格镜像对称、等高（`tools/smoke.js` 的几何契约会逐块量顶点来断言这件事） |
| 双电电量条 | **一条横线上并排两条**（左行 = 读数 + 轨道、右行 = 轨道 + 读数，左右镜像），每条高 16px、10 格刻度；两条轨道都落在同一套 grid 的 `1fr` 列 → **任何状态下尺寸完全一致**；整组垫在红色梯形框（`.battgauge::before`，左边缘斜切 8%、高 = `--mesh-h`）上 |
| NOS 氮气条 | 紫色不规则五边形 158 × 92 内：**上半 `100%` 读数、下半一条 22px 高的斑马纹色带**（5 格，每格 `skewX(-20deg)`、间隔 3px；节点由 `gauges.js` 建 → 样式必须走 `.nosbox__segs :deep(.bar__seg)`）；`NOS` 字标 50 × 34 用 `position:absolute` 挂在**框外**上方（⚠ 别用 `.nosbox> :not(.chipbg)` 这种通配规则去抬内容层 —— 它的权重会压掉 `position:absolute`，字标会退回文档流把读数和色带挤出框） |
| 六边形芯片（左灯塔） | 58 × 50，`--hex` |
| 角落五边形芯片 | 左上天气时间 124 宽、右上挡位徽标自适应、左下信号组 2×2 格（40×34）、右下 NOS 158×92 |
| 侧边黄灯条 | 宽 16px，上下内缩 34px、左右内缩 22px |

> ⚠️ 六边形的顶点在两处出现：`src/components/CoreHex.vue` 里 `.core__hex` 的
> `clip-path` 百分比，以及 `src/core/emblem.js#buildFrame()` 的 SVG 顶点。
> **改一处必须改另一处**，否则徽记会被裁歪。

---

## 3. 配色令牌

全部集中在 `src/styles/base.css` 的 `:root`。

| 令牌 | 色值 | 用途 |
| --- | --- | --- |
| `--c-red` / `--c-red-2` | `#e2001a` / `#ff2d3d` | 机身、六边形主描边、告警 |
| `--c-orange` / `--c-orange-2` | `#ff7a18` / `#ffab3d` | 徽记饰条、外框高光、ASUKA 字样 |
| `--c-amber` | `#ffc02e` | 天气/时间、ODO、挡位码、电量点、点亮中的指示灯 |
| `--c-green` / `--c-green-2` | `#39d98a` / `#7dffb8` | 电量条、READY、近光灯、能量回收 |
| `--c-purple` | `#8b5cf6` | 右下角紫色 NOS 框（`.chipbg--purple`）与 5 条斜条 |
| 机身外壳 | `#b2101c → #e01824 → #4e070c` | 单层线性渐变模拟红色塑料件的高光与阴影 |

### 轮廓令牌（两轮改版的重点）

四块角落芯片**互为镜像**：45° 切角一律朝屏幕中心，圆角留在屏幕外角。

| 令牌 | 形状 | 用在哪 |
| --- | --- | --- |
| `--penta-tl` | `polygon(0 0, 100% 0, 100% calc(100% − 26px), calc(100% − 26px) 100%, 0 100%)` + 左上圆角 13px | 左上：天气 + 时间芯片 |
| `--penta-tr` | 镜像：切角在左下、圆角在右上 | 右上：骑行挡位徽标（挡位名 / 挡位代号） |
| `--penta-bl` | 切角在右上、圆角在左下 | 左下：网络信号 / 耳机蓝牙 / GPS（**一整块**） |
| `--penta-br` | 切角在左上、圆角在右下 | 右下：紫色 NOS 氮气条 |
| `--hex` | `polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)` | **平顶六边形**（上下两条边平行于屏幕横向）：左侧灯塔 5 个 + 中央核心 |

**为什么要两层**：`clip-path` 会把 `border` 一起裁掉，所以描边用「两层同形状图层」
实现 —— `.chipbg`（描边色）+ `.chipbg::after`（面板色，`inset:1.6px`），
露出来的那一圈就是轮廓线。**圆角靠 `border-radius` 保留**：`clip-path` 与圆角是
「交集」，圆角不会被切掉，正好做出「切角 + 圆角」的不对称轮廓。

> 坑 1：`.timechip > * { position: relative }` 这类通配选择器会把 `.chipbg` 的
> `position: absolute` 覆盖掉，芯片轮廓会整块消失（第一版改完就踩了这个坑）。
> 内容层要写 `> :not(.chipbg)`。
> 坑 2（老坑）：`.core__hex` 的 `clip-path` 百分比与 `emblem.js#buildFrame()` 的
> SVG 顶点必须一一对应，改一处必须改另一处。

---

## 4. 组件规格

### 顶栏

* 左：**天气 + 时间**同一块芯片（`--penta-tl` + 琥珀描边 `chipbg--amber`）——
  第一行琥珀天气图标 + 天气文字（雾/多云/雨/晴，`config.weather`），
  第二行 25px 白色时间读数。不再有第三个骑行状态图标。
* 中：**左转向灯 ← READY 铭牌 → 右转向灯** —— `READY`（绿光）/ `CHARGING`（青光）/
  `CHECK`（红光）；两颗箭头贴在铭牌左右两侧（`gap:28px`），灭灯灰、单边琥珀呼吸、
  **双闪时两颗一起转红**（`.turn.is-haz`）。铭牌身后垫两块 `.mesh` 斜纹装饰
  —— 与铭牌左右各留 46px、**共用同一条水平中线**（`--mesh-dy: 0`）、
  形状互为镜像（`╲ READY ╱`），所以两块永远一样高、严格对称。
* 右：**骑行挡位徽标**（`--penta-tr`）—— 左侧上下两块铭牌
  （第一行**挡位名** `C 滑行模式` / `P 驻车`，第二行**挡位代号** `C` / `P` ——
  这块地方讲的就是**挡位**，不是「双电 / ×2 模式」），右侧一列
  **倒三角（指向下）+ 4 个电量点**，全部在**同一个框内**（内铭牌都比外框小一圈，
  不再压住五边形轮廓）；点亮数 = `ceil(SOC/25)`，颜色跟随电量档位（绿 / 琥珀 / 红闪）。
  参考图里那三个小圆按钮（巡航 / ABS / 座桶锁）已按反馈删掉。

### 左侧功能灯塔（5 个平顶六边形）

自上而下：**消息 / 导航 / NERV / 音乐 / 设置**（顺序在 `config.rail`），
彼此只留 4px 间隙（参考图里几乎相接）。点亮逻辑写在 `LeftRail.vue`：

| 芯片 | 状态 | 视觉 |
| --- | --- | --- |
| 消息 | 有告警或消息中心有未读时 | 红闪 + 右上角角标（数字 = 未读数，最多 99） |
| 导航 | 骑行中（非 P 挡） | 琥珀常亮 |
| NERV | 上电即常亮 | 橙 + 3.4s 核心心跳呼吸 |
| 音乐 | 手机音源或本地播放器在放 | 琥珀常亮 |
| 设置 | 设置页 / 帮助浮层 / 操作弹框 | 琥珀常亮 |
| 任意一颗 | **它对应的应用页正开着** | 底色换成琥珀描边（`is-open`）—— 和「亮着」区分开，所以「导航亮着」不会被看混成「导航页开着」 |

五颗芯片**都可以点**：点一下打开对应的应用页、再点一下关掉（第 3 颗 NERV 目前是占位页）；
键盘 `I` / `N` / `J` / `T` 同效，地址栏 `?page=msg|nav|nerv|music|set` 或 `#/msg` 直达
（第 10 轮：页面切换走 vue-router + `<KeepAlive>`，见下）。

### 中央核心（平顶六边形）

* **一个大字槽**：`P` 挡显示 `P`；挂上骑行挡位后显示**时速数字**
  （136px，3 位数降到 116px，`P` 挡放大到 150px），下方固定 `km/h`
* **六边形内部中下方 = 挡位铭牌**：`C 滑行模式` / `P 驻车`（19px + 11px）
* **换挡心跳**：`view.gear` 变化时给 `.core` 挂 0.56s 的 `coreBeat` 动画
  （1 → 0.88 → 1.015 → 1），即「先变小再弹回现在这个大小」
* **六边形里的图案**（第 10 轮）：`A / C / E / F` 用 `config.vehicle.gearArt` 指定的**挡位图**
  （原图在 `src/assets/gear/` → `npm run art` → `src/assets/art/gear-*.png`，由 `core/artslot.js`
  按名字解析成 URL），`<img object-fit: cover>` 铺满六边形（形状仍由 `.core__hex` 的 `clip-path`
  裁），上面压一层 `veil` 暗幕 → 「时速 / P」与挡位铭牌在任何图上都读得清；`P` 没有
  对应图 → 回落 `emblem.js` 的**原创机甲徽记**（`fallbackEmblem`）。
  ⚠ **换挡时图案不许空一拍**（第 12 轮修的 bug）：不用 `<Transition mode="out-in">`，
  改成两层图层 —— 当前层（`#v-gear-art` / `#v-emblem` / `#v-gear-veil` 都在这层）
  **无动画常显**，旧层 `.core__layer--out` 盖在上面 `gearFadeOut` 淡出、由**定时器**
  （`config.strip.fadeMs`）摘掉；四张挡位图在 `onMounted` 里 `new Image()` **预解码**
* **左下斜边**：`ODO`（10px 灰标签 + 24px 琥珀读数 + `km`）
* **右下斜边**：**龙头锁**开关（车把+锁体图标 + `OFF / ON`）——
  **OFF 是红色**（未锁 = 注意），ON 转琥珀
* 底边：`ASUKA` 铭条（在裁切层之外，所以不会被切）
* 机甲徽记：头盔 + 宽距眼罩（绿色发光呼吸）+ 侧鳍 + 肩甲 + 胸口能量核

### 功率圆表（粗环）

* 最外圈是**整圆粗描边**（`stroke-width:12`，径向渐变 橙→红，外径与左侧圆盘同为 240px）
* 内侧 **40 格**刻度（每 4 格一个大刻度 = 1000W），满量程取所有挡位功率上限的
  向上取整（当前 **10000W = 满量程 10kW**，F 激烈模式）
* 数值弧半径 92、线宽 14，正功率红橙渐变，负功率（回收）切绿色 + `RECUP` 呼吸
* ⚠ 量程取自 `config.vehicle.gears`（**每个挡位的 `powerCap` 取最大**再向上取整到 200），
  进 SVG 的每个数字都过 `num()` / `f2()`（NaN / undefined 当 0）——
  量程算成 0 时这里会画出 `"…A92 92 0 0 1 NaN NaN"` 并在控制台刷 `<path> d` /
  `<circle> cx` 的报错，有功率时又会因为 `x/0 = Infinity` 把弧画满（第 11 轮修的坑）
* 圆表中心自上而下：**功率数值牌**（自动宽度圆角牌，位数越多字号越小）→ `W`
  → `MOTOR 116℃`；底部铭牌显示当前挡位名
* 左转向 / 右转向曾经挂在这里，**第三轮已按反馈移到 `READY` 左右两侧**

### 底栏

* 左：**一整块不规则五边形**（`--penta-bl`）里放三组状态，格位由 `config.cluster[].slot` 决定 ——
  **网络信号（左上）+ 耳机带蓝牙（左下）+ GPS 雷达盘（右下）**（与参考图一致；
  `#i-gps` = 圆盘 + 扇形扫描波 + 枢轴点 + 目标回波点）
* 中：**双电电量条（并列一排，垫在红色梯形框上）** + `ninebot` 品牌字
  * 左条 = 容量（`51%`），右条 = 续航（`74.0km` / 满电 `145km`）
  * 每条 **填充 = 还没用完的**（黄/绿/红），**底槽灰 = 已经用完的**
  * 左右两侧各一块 `.mesh` 斜纹平行四边形（左下 / 右上）
* 右：**紫色不规则五边形**（`--penta-br`）= 氮气条：`NOS` 字标（**SVG 几何字，
  `os` 上方带箭头**）挂在**五边形外侧上方**，框内上面 `100%` 读数、下面一条
  **22px 高的 5 格斑马纹色带**（格子由 `gauges.js` 生成，所以样式要 `:deep()`）；
  框外左侧还有 USB 供电指示灯

阈值：
* 双电条颜色**只看 SOC**：> 60% 绿 / 20%~60% 黄 / < 20% 红闪（`config.socBar`）；
  参考照片那一帧正好 51% → 中间档 = 黄色
* 电机温度：≥120℃ 琥珀 / ≥145℃ 红闪
* NOS：功率 > 挡位上限 72% 时消耗（-3.5%/s），回收时回充（+1.8%/s），滑行微充（+0.35%/s）
* 龙头锁：`lamps.lock`，上锁时挂挡直接拒绝并弹 `LOCKED` 告警（5 秒）

---

### 应用页（AppPage.vue + 五个页面）

左灯塔五个芯片打开的面板：**消息中心 / 导航 / NERV / 媒体播放器 / 设置**。
第 10 轮起走 **vue-router**（hash 模式，`src/router.js` 一张**写明**的表）+ `<KeepAlive>`：
`/` = 仪表本体，`/msg` `/nav` `/nerv` `/music` `/set` = 五个页面；「当前打开哪一页」= 路由 `name`
（`useHud` 的 `page` 就是它的 computed）→ 左灯塔高亮 / `Esc` 逐层退 / `?page=` 全都没变。
**切页 / 关页都不卸载**（缓存住的页面只是「退到后台」，见下面的「保活」行）。

| 部件 | 规格 |
| --- | --- |
| 页面层（**常驻**） | `.pages`：`position: absolute; inset: 0; z-index: var(--page-z) = 6` —— 压住仪表本体（2），但让**告警横幅 8 / 操作弹框 20** 浮在它上面；radial-gradient **实底**（不透出仪表）。页与页**交叉淡入**时透出来的就是这层底色 → 不会再闪一下 home；没开页面时 `.pages.is-off`（`visibility: hidden` + 不吃点击）→ HUD 的 DOM 与「没有这一层」时完全一样 |
| 转场 / 保活 | `<RouterView v-slot>` + `<Transition name="pageSw">` + `<KeepAlive>`：新页 `pageSw-enter-from`（`opacity:0` + `translateY(8px)`）、旧页 `pageSw-leave-to`，两页都是 `absolute` 铺满 → **同时在场**（交叉淡入，不会经过「什么都不显示」的空档）。保活 = 媒体不断、导航路线不丢、设置里选的那一节还在；⚠ `pageSw-*` 必须写在 `base.css`（类名被 `<Transition>` 加在**各页面组件根节点**上，进 scoped 块会被改写成 `.pageSw-xxx[data-v-…]` 打不中） |
| 页头 | 平顶六边形芯片标（图标取自 `config.rail[].icon`）+ 中文标题 + 拉丁副标题（`config.pages[id]`）+ hint 一行 + 页面自己的 `#actions` 插槽 + 右侧状态读数 + ✕ |
| 页签 | 由 `config.rail` 生成的五个芯片按钮，当前页 `is-on`；点一下 `openPage(id)` 横向切页 |
| 正文 | `.page__body` 按 `config.pages[id].body` 居中收窄（msg 900 / nav 1020 / nerv 620 / music 1020 / **set 1120**——设置页左栏要占 206px） |
| 一屏装下（`fit`） | `<AppPage … fit>` → `.page--fit`：`base.css` 里这页的 `.page__body` 改成 `overflow: hidden`（并压掉 AppPage 那条 scoped 的 `scrollbar-gutter`），**页内自己用 flex 分高度**。目前只有**媒体页**用：左列播放器卡片撑满 → 画面盒 `.playerwrap > .player` 吃掉富余高度（不再按 16:9 定高），底部操作条 / 进度条 / 音量条永远在可视区内；右列「来源 / 列表（内部滚）/ 支持清单」。⚠ 媒体页的画面盒类名是 `.player*`，**不能叫 `.stage`** —— `base.css` 里 `.stage` 是 HUD 的缩放舞台（1300×760 + `transform`），撞名会把画面盒按舞台尺寸撑开、把操作条盖在底下（`check.js` 第 11 节盯着） |
| 设置页分节 | 左栏 5 个六边形芯片（复用首页左灯塔的 `.hexchip` / `.chipbg` 零件与点亮色）＝ 胎压胎温 / 感应开关 / 电池 BMS / 消息推送 / 软件信息；右栏**只渲染当前这一节** → 整页不上下滚（BMS 那一节内部再分两列：左「连接 + 环境自检」右「实时数据 + 原始帧」）。选了哪一节是页面自己的状态，靠 KeepAlive 跨切页保留 |
| 公共零件 | 写在 `base.css`（被 ≥2 个页面用到）：`.pages` / `.pageSw-*` / `.page / .page__*`、`.card`（45° 切角卡片，`--page-cut`）、`.btn / .seg / .tgl / .fld / .sld / .meter / .kv / .tag / .note / .plist`；**各页自己的排版**（消息列表、每串电压网格、播放器画面、设置页的左栏分节…）写在自己的 `<style scoped>` |

打开 / 关闭：点芯片（再点一次关）/ `I`（消息）`N`（导航）`J`（媒体）`T`（设置）/
地址栏 `?page=xxx` 或 `#/xxx`（前者在 mount 前被 `router.js` 的 `bootPath()` 翻译成路由地址）；
关闭是 ✕ 或 `Esc`（`useHud` 里排优先级：先关页面、再关弹框）。
**刷新 = 重新上电**（第 11 轮）：地址栏里留着 `#/set` 时按 F5 不再停在那页 —— `bootPath()` 用
Navigation Timing 的 `type === 'reload'` 认出「这是刷新」，交给 `router.replace('/')` 归位
（地址栏随即写成 `…/#/`）；**手打** `#/set` 打开（`type = 'navigate'`）照旧直达。
⚠ 「再点一次同一个芯片 = 关掉」判的是**最近一次请求的目标**（`useHud` 的 `target`，
`router.afterEach` 跟真实路由对齐）—— 路由切换是异步的，直接读 `page.value` 在连点两个芯片时
会拿到旧值、把「切到 B」误判成「再点 A → 关掉」。

⚠️ **`<AppPage>` 必须显式 `import`**：Vue 对「模板里写了却没 import」的组件会退化成运行期
`resolveComponent()`，**生产构建连警告都没有**、整页静默渲染成空，而 `check` / `build` /
`smoke` 当时全是绿的（「元素在、内容是空的」这种假绿灯最难查）。现在两道防线：`check.js`
第 9 节把这类漏 import 直接判 FAIL，`smoke.js` 每页都断言「渲染出自己的正文」。

---

## 5. 状态机与动效

| 状态 | 触发条件 | 表现 |
| --- | --- | --- |
| 上电自检 | 页面加载 | 全屏自检动画（AT 力场环 + 两进制日志 + 进度条 + **两侧立绘从屏幕外划入**），结束向上擦除。**文本域高度 = 行数 × 行高**（`--boot-rows` 由 `config.boot.lines.length` 传入）→ 自检文本永远装在自己的框里，不会压到进度条；行数再多就自动内部滚动。**停留时长可配**：写满进度条后继续停在 100% 等满 `config.boot.minMs`（默认 3000ms）才擦除进主界面；`config.boot.waitEnter = true` 则停在「按任意键 / 点击 进入主界面」等人工操作（改回 `false` 时停留期提示行显示剩余秒数）；地址栏可覆盖（`?boot=5000 / wait / 0`）。立绘：`config.boot.art` 的**预留位**（左 = 驾驶员 / 右 = 机体；`left/right.src` 填 `src/assets/art/` 里的文件名，留空则这一侧不显示；`?art=off` 关掉）。**环里六边形内部**：`config.boot.mark` 的徽记预留位 —— `nerv2.png` 被 `<clipPath id="boot-mark-clip">`（顶点就是 `hexPts` 那份）**裁进那个六边形**，`fit: 'cover'` + `scale: 1.2` 铺满并轻微放大、绕环心缩放淡入；留空 / 图名写错则**六边形里什么都不画**，`?mark=off` 关掉） |
| 停放 | 挡位 `P` 或充电 | 车速强制 0，中央大字显示 `P`，挡位铭牌 `P 驻车` |
| 骑行 | 挡位 `A` / `E` / `C` / `F` | 中央大字显示时速，左侧「导航」芯片点亮 |
| 换挡 | `A` `E` `C` `F` 键 / `G` 键 / 演示随机 | 中央六边形播放 0.56s **心跳缩放**，铭牌与右上角徽标同步换字（挡位图**交叉淡入**：当前层常显 + 旧层淡出，见第十二轮） |
| 能量回收 | 油门 < 0 或松油门滑行 | 功率转负 → 弧变绿 + `RECUP` 呼吸，**侧灯带转绿常亮** |
| 定速巡航 | 稳定油门 6 秒 或 按键 `R` | 巡航灯亮，速度跌到 3km/h 以下自动退出 |
| 转向灯 | `←` / `→`（按住），两个一起按住 = 双闪 | 400ms 闪烁，**300m 或 45s 后自动回位** |
| 侧灯带 | `stripMode(v)`（故障 > 烧氮气 > 加速 > 减速 > 驻车 > 静止） | 红闪 / 紫闪 / 蓝常亮 / 绿常亮 / 黄 / 淡青 —— 阈值 `config.strip`，颜色 `base.css` 的 `.strip.is-*` |
| 龙头锁 | `K` 键 / 停车充电 | 六边形右下斜边 `OFF`（**红**）→`ON`（琥珀），ON 时挂挡被拒 |
| 手机音源 | `Y` 键 / 演示随机 | 左侧「音乐」芯片点亮 |
| 低电 | SOC 下降 | 条变色 → 横幅 + 铭牌 CHECK → 消息芯片红闪 → 演示靠边停车、插枪、电量回升 |
| 边撑告警 | 边撑放下时尝试挂挡 | 挂挡被拒 + 红色横幅 `边撑未收起`，持续 5 秒 |

动效克制原则：常驻动画只有 5 处（侧灯带呼吸、徽记眼罩呼吸、中央大字辉光、
NERV 心跳、功率/温度跟随），**换挡时额外来一次心跳**，告警才闪烁。全部动效在
`prefers-reduced-motion: reduce` 下关闭（各组件自己的 scoped 块里各写一条 `@media`，
公共表只管 `.strip`）。

### 操作台（ControlPanel.vue）

一个可点的弹框，用来**手动决定现在演示什么**（键盘 `O`、左灯塔「设置」芯片、
`?panel=1` 三种打开方式）。它不另造一套假状态，而是走真车那两条写入路径：

| 按钮 | 写入路径 | 落到哪里 |
| --- | --- | --- |
| 挡位 `P/A/E/C/F` | `send({ gear })` → `input.push()` → `state.update(cmd)` | `shiftGear()`：会被边撑 / 龙头锁 / 充电枪**拒绝并告警**（真车逻辑） |
| 定速 / 停车 / 12·25·35·45 | `vehicle.cruiseSpeed` + `lamps.cruise` | 由物理去逼近目标车速（不是直接赋车速） |
| 急加速 / 急减速 / 滑行 | `hold(1/-1/0, ~2.5s)` | `input.js` 的油门脉冲 + `brakePower` / 能量回收，功率弧真的打满 / 变绿 |
| 仪表提示 8 连 | `send({ forceWarn })` | `state.warnings()` 里**同一条告警表** → 横幅 / READY 铭牌 / 消息芯片三处一起响应 |
| 电量 / 氮气 / 电机温度 / 天气 | 直接写字段 + `refresh()` | 滑块类连续量，立刻反映到仪表 |
| 8 个车灯开关 + 边撑 / 充电枪 / 电源 | `send({ toggleLamp / kickstandFlip / … })` | 与键盘完全同一条通路 |
| 继续 / 暂停自动驾驶 | `vehicle.auto.enabled` | 面板一动就暂停演示（否则几秒后它会把挡位车速改回去） |

`state.js` 为此新增了一个字段：`forceWarn`（`cmd.forceWarn` 写入，`null` 清除），
它只做一件事 —— 把配置表里的某条告警**插进裁决队列**，优先级排序、显示链路全都复用现成的。

---

## 6. 与参考照片的对应

| 参考照片中的元素 | 本项目实现 |
| --- | --- |
| 红色机身 + 四角螺栓 + 黄色侧灯带 | `.bezel` 渐变 + `.bezel__bolts` + `.strip`（宽 16px、上下留 34px） |
| 左上：`雾` + `15:43`（一个芯片，上天气下时间） | `TopBar.vue` 的 `.timechip.chip--tl` |
| 顶栏中间 `READY` + 左右两颗箭头 | `.plaque` + `.turn--l / .turn--r`（双闪 = 两颗一起闪） |
| `READY` 两侧那条斜向灰黑细纹饰带 | `.mesh`（顶栏 2 块：`╲ READY ╱`，共用同一中线、互为镜像） |
| 右上：挡位名（`滑行模式`）+ 挡位代号（`C`）+ 倒三角 + 4 圆点，全在框内 | `.gearchip.chip--tr`（内铭牌比外框小一圈） |
| 左侧一列 5 个六边形功能灯 | `.rail` + `.hexchip`（消息/导航/NERV/音乐/设置） |
| 六边形**压住**左右两个粗线圆 | `.timedial` / `.side`（各伸进 45px）+ `.core { z-index:3 }` |
| 六边形左侧的粗线圆（TIME / TRIP，金字标签 + 白读数） | `.timedial`（`conic-gradient` 粗环，外径 240） |
| 中央六边形 + 红色机甲 + 巨大挡位字母 | `.core`（绝对居中）+ `.core__readout`；机甲图案：`A / C / E / F` 用 `config.vehicle.gearArt` 的挡位图，其余挡位用 `emblem.js` 的原创徽记（第 10 轮） |
| 中央六边形内的挡位铭牌 | `.core__gear`（换挡时整个六边形心跳一次） |
| 六边形左下斜边的 `ODO 11971 km` | `.core__odo` |
| 六边形右下斜边的龙头锁 `OFF`（红） | `.core__lock` + `i-steerlock` |
| 六边形下方 `ASUKA` 铭条 | `.core__name` |
| 右侧粗线圆表 + `POWER` + 居中读数 + `W` 在数字下方 | `.gauge` + `.gauge__tag` + `.gauge__plate`（四位数自动降字号） |
| 底栏中间红色梯形框里的 `51% ▮▮▮ ▮▮ 145km` 两条电量条 + 两侧斜纹块 | `.battgauge::before`（梯形底框）+ `.battgauge__rows` + `.mesh--bl/--br`（与底框等高、同中线、左右镜像） |
| 左下：一整块五边形里放 网络信号（左上）+ 耳机蓝牙（左下）+ GPS（右下） | `.clusterbox.chip--bl`（`config.cluster[].slot`） |
| 右下角紫色框架 + `100%` + 斑马纹色带，框**外**上方一枚带箭头的 `NOS` 字标 | `.nosbox.chip--br` + `.bar__seg`（JS 生成 → 必须 `:deep()`）+ `.nosmark`（`#i-nos` SVG 字标） |
| 底部中间 `ninebot` | `.brand` |

数值也刻意对齐了参考照片：ODO **11971km**、电量 **51%**（落在黄色档）、
本次骑行 **0h58min**、本次里程 **28.1km**、满电续航 **145km**、
环境 **35℃**、天气 **雾**、氮气 **100%**、龙头锁 **OFF**。

> ⚠️ **关于 28.1km 的归属**：参考图里「145km 续航」和「28.1km」不能同时成立
> ——51% × 145km ≈ 74km。而 0h58min 走 28.1km ≈ 29km/h，正是**本次里程**的典型值，
> 所以本实现把 **145km 归给续航**（双电表右条：填充比例 = 当前 74.0km / 满电 145km，
> 读数写在条的右端 = `145km`），
> **28.1km 归给 TRIP**（左侧圆盘）。若实际情况相反，只需对调
> `config.vehicle.fullRangeKm` 与 `config.seed.tripKm` 两个值。

---

## 7. 工程结构（Vue 3 + Vite）

```
src/config.js            数据（阈值 / 配色 / 文案 / 芯片清单 / gearArt 挡位图）
   ↓
src/core/*.js            纯逻辑：create / update / autoDrive / warnings
                         （+ 第 9 轮的 tire / messages / nav / media / ble / settings / store，
                            + 第 10 轮的 artslot 复用（挡位图按名字解析），完全不碰 DOM）
   ↓
src/router.js            应用页路由表（vue-router 4 · hash 模式；PAGE_IDS = config.rail 的 id）
   ↓
src/composables/useHud.js  每帧推进逻辑 + 生成「显示快照」（reactive）；page = 路由 name 的 computed
   ↓
src/App.vue              <RouterView> + <KeepAlive>：页面层 `.pages` 常驻实底（转场不闪 home）
   ↓
src/components/*.vue     只读快照，负责画
```

> 运行时依赖两个：`vue` 与 `vue-router`（第 10 轮加的路由）。`tools/*.js` 仍是零依赖纯 Node。

**样式分工（v4 起，按 Vue 的惯例）** —— 这条是硬约束，别再往回写：

```
src/styles/base.css      唯一的公共表：设计令牌 + 基础重置 + 舞台/机身外壳 +
                         屏幕质感 + **共享零件**（.ico / .chip--* / .chipbg / .mesh / 公共 keyframes）
src/components/*.vue     每个组件自己的样式写在自己的 <style scoped> 里
                         （TopBar / LeftRail / TimeDial / CoreHex / PowerGauge /
                           BottomBar / WarningBanner / HelpPanel / BootOverlay /
                           ControlPanel / AppPage / MsgCenter / NavPage / NervPage /
                           MediaPage / SettingsPage / App.vue）
```

* 判断标准只有一句：**只被一个组件用的 → 写在那个组件里；被 ≥2 个组件用的 → 才进 base.css。**
* 子组件根节点会带上父组件的 scope 属性，所以 `App.vue` 可以直接给
  `.rail / .core / .timedial / .side` 这些「子组件根节点」定位置；
* 由 `v-html` 注入或 JS 生成的节点（`emblem.js` 的 `.cf-*` / `.em-*`、
  `gauges.js` 的 `.g-*` 与 `.bar__seg`）**拿不到 scope 属性** → 组件里必须用 `:deep()` 选
  （漏了就是「节点在、样式没来」：NOS 那条斑马纹色带曾经整条隐形就是这个原因）；
* ⚠ **通配选择器会压过子元素自己的定位**：`.xxx> :not(.chipbg)` 的权重是 (0,3,0)，
  比 `.nosmark[data-v]` 的 (0,2,0) 高 → 会把本该 `position:absolute` 的节点压成 `relative`
  （NOS 字标曾因此退回文档流占 41px，把 `100%` 和色带一起挤出框）。抬内容层要**点名**写；
* `@keyframes` 写在组件自己的 scoped 块里时，Vue 会**连动画名一起改名**（不会跟别处撞名）；
  共用动画（`blinkHard` / `pulseGlow`）留在 base.css，scoped 规则直接引用它们的原名即可；
* 数字读数统一 `font-variant-numeric: tabular-nums` + `font-family: var(--font-num)`，
  由**各组件自己声明**（公共表不再写一份跨组件的类名清单）。

* **两条渲染通道**
  * 60fps：功率弧、NOS 格子 —— 组件用 `registerFrame(fn)` 注册回调，
    回调里直接写 SVG 属性 / class，**不经过 Vue 的 diff**
  * 8Hz：所有数字 / 文字 / 指示灯 —— 汇总成一个 `reactive` 快照（`hud.view`），
    由 Vue diff，值没变就不碰 DOM（`rates.textHz`）
* **纯逻辑层可被 Node 直接 import**：`tools/smoke.js` 用它跑 900 帧物理断言，
  不需要 jsdom / 浏览器
* **provide / inject**：`App.vue` 调 `createHud()` 并 `provide`，子组件用
  `useHudContext()` 取；同时挂到 `window.EVA_HUD` 方便调试与接外部数据源
  （操作台就是用 `ctx.send / ctx.hold / ctx.refresh / ctx.vehicle` 写回去的）
* **几何契约也进了测试**：`tools/probe.html` 把仪表页面装进同源 iframe，
  量出 rect 与 `clip-path` 顶点写进自己的 `title`，`tools/smoke.js` 用
  `chrome --dump-dom` 读回来断言（平行四边形 / 镜像对称 / 等高 / 不重叠）。

---

## 8. 改版记录（十二轮都照着实车照片 / 使用反馈逐条改）

### 第十二轮（本次）

| # | 反馈 | 实现 |
| --- | --- | --- |
| 1 | 功率上限太小 → **10kW**；功率加大、加速要快、**能破百往上** | `config.vehicle.gears` 重排为 **A/E/C/F**：F `powerCap` **10000** / `maxSpeed` **120** / `accel` **5.2**。功率表量程仍然「从挡位表算」（最大 `powerCap` 取整到 200 → **10000W = 满量程 10kW**，`gauges.js` 的算法一行没改），刻度 32 格 → **40 格（250W/格）**。`brakePower` 3.4 → **6.5**、`coastDrag` 0.5 → **0.9**；演示油门增益 0.085 → **0.16**，段落重排（转向灯 40% / **直线加速 18%** / 换挡 14% / 市区 14% / 灯光音源），起步挡 X1 → **C**。⚠ `thermal.heatGain` 1.10 → **0.30**：量程提了 6 倍，不降升温系数就会几秒烧到 160℃ 顶死 |
| 2 | 换挡改用键盘：**`A` = A 挡、`C` = C 挡**；`X1`/`X2` 不考虑 | `core/input.js` 的 `GEAR_KEYS` 由 `1~6` 换成 **`a` `e` `c` `f` + `p`**；`X1`/`X2` 从 `gearOrder`/`gears` 移除。让位的三个键：转向（原 `A`/`F`）→ **方向键**，定速巡航（原 `C`）→ **`R`**。帮助浮层同步，`check.js` 静态盯住键表 / 帮助文案 / 残留数字键 |
| 3 | **切换挡位时中间的图有概率消失** | ① 去掉 `<Transition mode="out-in">`（leave 被打断时容器会停在没有 enter 的中间态 = DOM 空一拍）；② 换 `src` 的 `<img>` 是**新元素**，1.3MB 的 `gear-a.png` 解码完之前是透明的。现在 `CoreHex.vue` 用**两层图层**：当前层**无动画常显**（`#v-gear-art` / `#v-emblem` / `#v-gear-veil` 都在这一层）、旧层（`.core__layer--out`）盖在上面 `gearFadeOut` 淡出，由**定时器**（`config.strip.fadeMs` 320ms）摘掉 —— 不等 `transitionend`（虚拟时间下不可靠）；`onMounted` 里把四张挡位图 `new Image()` **预解码**。顺带把 `gearArt.veil` 真的画出来（第十一轮那条「配了没画」的 warn 清掉） |
| 4 | `←`/`→` 转向、`↑`/`↓` 加减速、**左右一起按 = 双闪** | `input.js` 转向改成**电平**语义（`wantL`/`wantR` → `wantHaz = wantL && wantR`），并且**只在状态变化时发一次 `cmd`**（每帧都发会把 `turnSince`/`turnDist` 清零 → `turnAuto` 的单边自动回位失效）。`↑`/`↓` 与 `W`/`S` 同源。另外把「还按着键」也算进「人工操作中」：长按 `↑` 不会被演示抢走控制权 |
| 5 | 氛围灯带要跟驾驶状态：氮气**紫闪** / 加速**蓝常亮** / 减速**绿常亮** / 故障**红闪** / 静止**淡青** / 驻车**黄** | 新状态机 `core/state.js → stripMode(v)`，优先级 **fault > boost > accel > brake > park > idle**；阈值进 `config.strip`（`burnRatio` 与 NOS 消耗共用 —— 原来 `0.72` 是 `update()` 里的裸常量）；快照加 `view.strip`，`App.vue` 挂 `is-<状态>`，颜色 / 闪烁在 `base.css`（每态 `--sc/--sh/--sd` 三个令牌，常亮 = `animation: none`，闪烁 = `steps(1,end)`）。`prefers-reduced-motion` 里补上 `.strip.is-*`（优先级比 `.strip` 高，只写 `.strip` 压不住） |
| 6 | `gearchip__dual` 那块地方是**挡位**，不是「双电 / 三电模式」 | 删掉 `config.brand.dualMode`（注释里写明不要再加回来）；右上角徽标第二行改成 `view.gearShort`（`#v-gear-code`：P/A/E/C/F），和第一行挡位名组成完整挡位铭牌。`check.js` 盯住「`#v-gear-code` ← `view.gearShort`」与「config 里不许再出现 `dualMode`」 |

**测试契约**：`check.js` 第 12 节 —— 10kW（F 的 `powerCap === 10000`、`maxSpeed > 100`、量程算出来必须是 10000）、挡位表 `AECF`、键盘（`GEAR_KEYS` 正好 a/e/c/f/p、无 `1~6 → X1/X2` 残留、`←/→` + `wantHaz`、`↑/↓` 接进油门、`anyDown` 长按不失权）、灯带六态（六条规则 + 主色 + 动画名 + 六色互不重复 + reduced-motion + `stripMode` 的优先级顺序串）、中央立绘（剥掉注释后模板里**不许再有 `<Transition>`**、必须有 `.core__layer--out`/`gearFadeOut`/`prevTimer`/`new Image()`、当前层不许挂动画、`#v-gear-veil` 必须存在）、徽标第二行 = 挡位代号、帮助浮层是新键且不含旧键。`smoke.js`：**核心仿真 +12 条**（真物理：F 挡峰值 112.6km/h > 100、0→100 < 12s、0→60 < 5s、峰值 9370W > 9000、`stripMode` 六态与优先级、满油门先蓝后紫）；**渲染 +26 条**（灯带真类名 + 常亮 + 蓝色；一次注入六个类名验 base.css 解出来的颜色/动画；**`?gearburst=12` 跨帧连按换挡 → `empty === 0`**、图层数 1~2、最后 1 层且有孩子、图 = 当前挡位那张、层/图 opacity 1/0.95、veil 0.42、裁切区 470×440；演示跑 9s 后中央依然可见；**新键表键盘链路 5 条** —— 按 `A` 挂 A 挡 / 按住 `←` 左转向 / 挂挡后灯带转淡青 / `←`+`→` = 双闪且单边让位 / 按 `R` 定速；⚠ 探针里 rAF 不推进，这 5 条用 `EVA_HUD.dispatch()` 消费指令队列，断言看状态）。check 163 → **190**，smoke 248 → **290**。

**诊断开关 `?gearburst=N`**（`useHud.js`，与 `?photo=` / `?panel=1` / `?probe=1` 同类，默认不跑）：每 220ms 换一次挡、换 N 次，并在**每次换挡的下一帧**检查「中央那一层还有没有孩子」，把 `{times, done, empty, min, max}` 记进 `window.__gearburst`。做它的原因：`probe.html` 的按键是**一次性派发**的（同一 tick 连按 6 个挡位键只换一次挡），复现不了「连按」的时序 —— 有了它，「换挡时中央不许空」这件事才有一条**跨帧**的动态证据（而不是只有静态契约）。

**顺手清掉的两处旧账**：① 第十一轮那条关于 `#v-gear-veil` 的观察 —— 现在节点真的画出来了，4 条 `warn` 归零；② `smoke.js` 里「`A` 键打左转向」这类文案（键位已变）以及 `shot.js` / 出图文档里所有 `gear:X1` / `gear:X2` / `1800W` 的遗留（挡位表里已经没有 X1/X2，写进去只会命中 `gearDef()` 的兜底分支）。

### 第十一轮

| # | 反馈 | 实现 |
| --- | --- | --- |
| 1 | 刷新页面后应该回到 **`/#/`** | `router.js`：`isReload()` 读 `performance.getEntriesByType('navigation')[0].type === 'reload'`；`bootPath()` 三条分支 —— ① `?page=`（出图 / 冒烟 / 文档）永远优先，② 地址栏 `#/msg` 深链只在**不是刷新**时直达，③ 其余（没写 hash / 不认识 / 刷新）→ `'/'`，由 `main.js` 在 mount 前 `router.replace()` 落定 → 首帧即仪表本体、地址栏稳定 `…/#/`。读不到 Navigation Timing 时按「不是刷新」处理（宁可留深链，不误伤新打开） |
| 2 | 播放器要滚一下才看得到操作条 | `AppPage` 新增 **`fit`**（→ `.page--fit`，`base.css`：`.page.page--fit .page__body { overflow: hidden; scrollbar-gutter: auto }`）；`MediaPage` 用 flex 自己分高度：左列卡片撑满 → `.playerwrap > .player` 吃掉富余高度（**去掉 16:9 定高**）、`#media-bar` / 进度条 / 音量条固定在下方；右列「来源 / 列表（内部滚）/ 支持清单」。⚠ 画面盒类名从 `.stage` 改成 `.player*`：`base.css` 里 `.stage` 是 HUD 缩放舞台（1300×760 + `transform`），撞名会把画面盒按舞台尺寸撑开、把操作条压在底下 |
| 3 | 控制台报 `<path> d` / `<circle> cx` 的 **NaN** | `gauges.js` 的量程读错了键：`CONFIG.vehicle.modes`（不存在）→ `powerMax = 0` → 0W 时 `0/0 = NaN` 写进 `<path d>` / `<circle cx cy>`；有功率时 `x/0 = Infinity` → `pct` 恒为 1、**数值弧永远画满**（不报错的静默故障）。改：读 `CONFIG.vehicle.gears`（X2 最高 1800W → 量程 1800）、`powerMax > 0` 兜底、进 SVG 的数字统一走 `num()` / `f2()`（NaN / undefined 当 0）。780W → 253°，0W → 140° 且游标隐藏 |

**测试契约**：`check.js` 第 11 节（功率量程的键与兜底、`fit` / `.page--fit` / `.player*` 的类名契约、`isReload()` + `bootPath()` 分支齐全且 `smoke.js` 里有对应断言）；`smoke.js` 新增 12 条：功率表量程、功率弧无 NaN、780W 停在 253°、有功率时游标可见、0W 停在 140° 且游标隐藏、正文区 `overflow: hidden`、内容不超出可视高度、操作条在可视区内、画面盒不溢出槽位、手打 `#/set` 直达、**真刷新一次**后回仪表本体且地址栏为 `#/`（`probe.html` 新增 `reload=` / `reloadHash=`：同文档切到 `#/set` → `location.reload()` → 等 load 再量）、**探针总账**（`missProbes` 为空，无头浏览器偶发不吐 title 会自动重试一次，两次都空报 FAIL）。check 153 → **163**，smoke 241 → **248**。

**顺手清掉的旧伤**：① `smoke.js` 里对 `#v-gear-code` 的断言（该元素早已在 `TopBar.vue` 里停用 → id 契约一直是红的）；② 「车速在动」这条**随机假 FAIL**（断言第 900 帧的瞬时车速，而 `autoDrive` 用 `Math.random` → 改成看 15s 内峰值车速）；③ 「划入方向相反」原来读**当帧** `transform`（动画跑完就是 `0.0 / 0.0`）→ 改成读**动画第一帧**（`getAnimations()` 的 keyframes，与时间无关）。
⚠ 另一处观察：`CoreHex.vue` 在 16:57 被改掉了暗幕节点（`#v-gear-veil`），而 `config.vehicle.gearArt.veil = .42` 还留着 → `smoke` 每次会打 4 条 `warn`（配了没画）。要么补回节点、要么把配置里的 `veil` 去掉 + 同步本文档与 README 里关于暗幕的描述。

### 第十轮

| # | 反馈 | 实现 |
| --- | --- | --- |
| 1 | 界面切换接 **vue-router**，而且要**保活** | `src/router.js`：hash 模式（要能双击 `dist/index.html` 在 `file://` 下跑，history 模式需要服务端回退）+ 一条条写明的路由表 + `PAGE_IDS = config.rail`；`App.vue` 用 `<RouterView v-slot>` + `<KeepAlive>`；`useHud.page` = 路由 `name` 的 computed（`EVA_HUD.page.value` 行为不变 → 左灯塔高亮 / `Esc` / `?page=` 全不受影响）；`?page=` 在 mount 前被 `bootPath()` 翻译成路由地址 → 出图 / 冒烟首帧就停对地方。⚠ 「再点一次关掉」用 `target`（最近一次请求的目标）+ `router.afterEach`，**不能读 `page.value`**（路由异步，连点两个芯片会误判） |
| 2 | 导航 → 消息中心**闪一下 home** | 根因：旧页 `v-if` 卸载 + 新页 `pageIn` 从 `opacity: 0` 淡入 → 中间那几帧露出的就是下面的仪表本体。改成**常驻实底** `.pages`（渐变底色与 `--page-z` 从 `.page` 挪过来）+ `pageSw` **交叉淡入**（两页同时在场、`absolute` 互相重叠）；`.pages.is-off` 负责「没开页面」的隐藏与不吃点击 |
| 3 | 设置页纵向滚动太长 | 左栏 5 个六边形芯片分节（复用首页灯塔的 `.hexchip` / `.chipbg`），右栏只渲染当前这一节；`config.pages.set.body` 1000 → 1120；BMS 那一节内部再分两列；每节按 ≈540px 排过版 → **整页不滚动**；`?sec=bms` 可直达某一节 |
| 4 | 消息中心的胎温胎压挪到设置那边 | 整块读数（`.tlive`：两轮 kPa / bar / ℃ + 细进度条）搬进「胎压胎温」这一节的开头，并把「立刻胎压告警 / 恢复读数」两个按钮一起搬过去；消息中心只留消息列表 + 三个推送演示 |
| 5 | 六边形的机器人图案换成 **A / C / E / F 挡位图**，但**动画要保留** | `src/assets/gear/` 的原图 → `npm run art`（`cutout.js` 新增 `gear/` 来源 + `FILE_TUNING` 给背景偏灰的 C.png 单独放低阈值）→ `art/gear-*.png`；`config.vehicle.gearArt`（`map` / `fit` / `opacity` / `blend` / `veil` / `fallbackEmblem`）→ `CoreHex.vue` 用 `core/artslot.js` 解析；形状继续由 `.core__hex` 的 `clip-path` 裁，上面压一层 `veil` 暗幕保证「时速 / P」读得清；`P / X1 / X2` 回落原创机甲徽记。**心跳动画一行没动**（`.core.is-beat → coreBeat`），图案另做 `gearSw` 交叉淡入 |

**这一轮的测试契约**：`check.js` 第 10 节 —— 路由契约（`config.rail` 每个 id 都有路由、每条路由的组件都 import 了、`App.vue` 必须有 `<KeepAlive>`）、转场契约（`.pages` 实底 / `.is-off` / `pageSw` 的 transition 与进入帧、`pageSw-*` 不许进 scoped 块）、**换挡心跳与挡位图接线**（`coreBeat` 还在、心跳挂在 `view.gear` 上、`CoreHex` 真的接了 `gearArt` + `resolveArt`）、`gearArt.map` 的预留位校验（对得上 `art/` 里的图 + 必须带 alpha）；`smoke.js` 每页把「有入场动画 / 页面自己实底」换成「**压在常驻实底 `.pages` 上** / **由路由给出来**」，并新增交叉淡入（`pageSw-enter` 与 `pageSw-leave` 同时在场）、关闭后 `.pages.is-off`、**保活两条**、挡位图 6 条、设置分节 5 条、消息中心不再画胎压。check 136 → **153**，smoke 213 → **241**。

**这一轮踩的坑**：① 路由是异步的（见上表第 1 行的 `target`）；② 探针环境里**连 CSS 过渡也停在第一帧**（以前只知道动画会停）—— 好处是「`.page` 上挂着 `pageSw-enter-from`」反倒成了可断言的转场证据，坏处是「读当帧 `opacity` 判断可见性」一律不成立（可见性改看 `.pages` 有实底）；③ `probe.html` 的 `js=` 表达式之间用 `|` 分隔 → 表达式里写 `||` 会被切断（用三元表达式，别用 `||`）。

### 第九轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 左灯塔五个芯片只有「设置」能开弹框，其余四个是死的 | 新增 `AppPage.vue` **页面外壳** + 五个页面组件：外壳统一「六边形芯片标 + 中文标题 + 拉丁副标题 + hint + `#actions` 插槽 + 状态读数 + ✕ + 五个页签」，正文宽度按 `config.pages[id].body` 居中收窄；`App.vue` 用 `v-if` **同一时刻只挂一页** → 关掉页面时 HUD 的 DOM 与第九轮之前完全一致 |
| 2 | 页面层要压在仪表上、又不能压住告警 | `base.css` 新增「应用页框架」一节：`--page-z: 6`（仪表本体 2 < 页面 6 < 告警横幅 8 < 操作弹框 20）、`.page` 用 radial-gradient **实底**（不透出仪表）+ `pageIn .2s` 入场；公共零件 `.card / .btn / .seg / .tgl / .fld / .sld / .meter / .kv / .tag / .note / .plist` 也在这里，各页自己的排版仍在自己的 `<style scoped>`（判断标准不变） |
| 3 | 芯片的「亮着」和「这页开着」在视觉上要能分开 | `LeftRail.vue` 拆成两套类：`is-on`（状态点亮：告警 / 行驶 / 播放 / 帮助）与 `is-open`（页面开着：底色换琥珀描边）；消息芯片角标从写死的 `1` 改成**未读数**（最多 99，没有未读但正在告警时兜底显示 1） |
| 4 | 五个页面各自要干什么 | ① 消息中心 `core/messages.js`（四条来源 / 同 key 去重 / 未读计数）；② 导航 `core/nav.js`（三家 × 四种出行模式归一化，**直线估算兜底并明确标注**，开始导航按实时车速推进）；③ NERV 只留占位（说了暂时不做）；④ 媒体播放器 `core/media.js`（File System Access API + 白名单 / `canPlayType` 两道过滤 + Object URL 懒创建）；⑤ 设置 `core/tire.js` / `settings.js` / `store.js` / `ble.js`（胎压阈值即时参与裁决、改完存 localStorage、BMS 是可选骨架） |
| 5 | （顺手补的两处） | ① `check.js` 新增第 9 节「**组件引用契约**」；② 徽记那两条「读当帧值」的假 FAIL 断言改成立绘那套做法（配置值读 `--mark-o`、几何除掉当帧 `transform` 的缩放），并在 `check.js` 里静态盯「`markIn` 的 `to` 帧不许写 `opacity`」 |

**⚠️ 本轮最大的坑**：`<AppPage>` 忘了 `import` → Vue 退化成运行期 `resolveComponent()`，
**生产构建连警告都没有**，整页静默渲染成空；而当时 `check` / `build` / `smoke` 全绿。
这跟第六轮「JS 生成的节点必须 `:deep()`」、第五轮「通配选择器压过子元素定位」是同一类
**安静故障**：DOM 在、样式 / 内容没来。所以「第 9 节静态契约」+「每页渲染出自己的正文」
两条防线都留着；诊断手段也记一笔：`tools/probe.html` + `chrome --dump-dom` 量页面层
（`?photo=<非空>&page=msg` 可以跳过开机动画直达某个页面）。

**测试上的老坑又踩了一次**：探针环境里 CSS 动画停在第一帧，所以**任何「读当帧 `opacity` /
`rect`」的断言都不成立**。立绘（`bootArtIn`）当初就改成「读内层 `--art-o` + 把当帧
`transform` 位移减掉」，这一轮徽记（`markIn`，`from { scale(.88); opacity: .2 }`）的两条
断言忘了照做，量出来永远是 `.2` 和 0.88 倍。改成同一套做法后，它们才是真正的
「配置 → CSS 变量 → 观感」契约，而不是假 FAIL。

### 第八轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 自检页那个**环里的六边形内部要显示 NERV** | `BootOverlay.vue` 的 `<svg class="boot__ring">` 里加一层 `<clipPath id="boot-mark-clip">`（顶点直接用 `hexPts` 那一份，不复制几何）+ `<image class="b-mark" clip-path="url(#boot-mark-clip)">`：图按文件名从 `src/assets/art/` 取（默认 `nerv2.png`），**裁进六边形** → 只可能在六边形里出现、绝不可能越界（也不参与任何排流，它是 SVG 的子节点）。默认 `fit: 'cover'` + `scale: 1.2`（铺满并放大到 1.2 倍，把图自己那圈圆形边界裁掉、字母更大更可读）、`opacity: .92` + `drop-shadow` 红光，`is-armed` 时绕环心缩放淡入；`prefers-reduced-motion` 下直接显示 |
| 2 | 留空 / 图名写错不能崩，也不能又变成白板 | 同一套安静降级：`src` 留空 → 六边形里什么都不画；名字写错 → 不画 + 控制台一条 `[boot.mark]` warn；`npm run check`（三个槽共用同一段检查）多一条「环里徽记（六边形内部）→ src/assets/art/nerv2.png（RGBA 1900×1970）」。`nerv2.png` 也是白底不透明 PNG → 先过 `npm run art` 抠底（`tools/cutout.js` 的「没点名就按 config 处理」现在把 `boot.mark.src` 一起算上，`src/assets/` 里放的还是原图） |
| 3 | 别糊掉六边形的描边；不透明度不能被入场动画吃掉 | ① 图层顺序定死「圈 → 徽记 → `.b-hex` 描边 → 刻度」：描边画在图**之后**（否则图会盖掉内半条边），探针新增的 `order` 断言盯着；② 不透明度走 `--mark-o`、**不写进 keyframes** —— 动画里 `to { opacity: 1 }` 的优先级高于行内样式、会盖掉配置值，所以入场动画只动 `transform`（`from { transform: scale(.88); opacity: .2 }`，`to` 不写 opacity = 落回 `--mark-o`） |

**这一轮的测试契约**（改坏立刻 FAIL）：`tools/probe.html` 新增 `order`（文档顺序断言，
`order=A~B` = 先 A 后 B、B 在上层），并把 SVG `<image>` 的 `svgHref` / `par`
（preserveAspectRatio）/ `clipId` / `clipPts`（clip-path 那层 `clipPath` 里 `<polygon>`
的顶点数）量出来；`imgdims` 从「只认 `background-image`」扩成「`background-image` 或
`<image>` 的 href」。于是「用的是 config 里那张图」「真能解码出 1900×1970」
「被裁进一个 6 顶点的多边形」「铺满 / 缩进 = `config.boot.mark.fit`」
「描边画在徽记之上（文档顺序）」「徽记与六边形同心、框 = 六边形包围盒 × `scale`」
「不透明度 / 混合模式来自配置」「`?mark=off` 真的不画」这 11 条进了冒烟（147 → 159）。

⚠ 新踩的坑：`order` 的分隔符**不能用 `<`** —— 探针要把结果写进本页 `title`，
而 `chrome --dump-dom` 会把 title 里的 `<` 转义成 `&lt;`，冒烟拿到的键对不上、
断言假 FAIL（第一版就这么挂的；换成 `~` 才对上）。

**顺手补上的键盘链路断言**（smoke 159 → 162）：`tools/probe.html` 多了 `key=` /
`keyDown=` / `js=` 三个参数（派发按下+松开 / 只按下不松手 / 在 iframe 里求值），
于是「按 `O` 开操作弹框、再按 `Esc` 关」也进了冒烟。来由是个真实故障：`App.vue` 里
`import ControlPanel` 还在、模板里的 `<ControlPanel />` 被漏掉 → 按 `O` 时
`panelOpen` 翻成 `true` 而 DOM 里空无一物（「O 键打开配置的功能没了」）；
只断言 `?panel=1` 是抓不到按键链路的。

### 第七轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 开机自检页太空，想在背景两侧加**立绘**：左边驾驶员、右边机体，从屏幕外**划入** | 上一版是 `bootart.js` 生成的**原创几何剪影**（左 = 机体 / 右 = 驾驶员，全部由「锥形条 + 多边形 + 折线」拼出来，刻意不含官方美术素材）。本轮按使用者的要求把它换成**放真图**：那个模块已删除，改成 `src/core/artslot.js` 的**预留位** —— 图放 `src/assets/art/`，`config.boot.art.left/right.src` 只写文件名。`BootOverlay.vue` 里各一层 `.boot__art--l / --r`：`left/right: -24px` 钉在屏幕外缘，`@keyframes bootArtIn` 从 `translateX(±46%)` 划入（方向由 `--art-dir` 取符号，`slideMs: 900`，右侧 `--art-delay: 60ms`），`fill-mode: both` 停在最后一帧 |
| 2 | 立绘要**融进背景**、不挡读数、不弄坏擦除 | ① 融合：朝屏幕中心一侧 `mask-image: linear-gradient(...)` 羽化 + `--art-o`（默认 .88）+ `drop-shadow` 红光；`blend: 'screen'` 是备选（暗底全息口感，真图默认 `normal`，保住线稿的对比）；② 不挡读数：立绘是 `.boot` 的**绝对定位子层**（`position: absolute` + `z-index: 0`）→ 不参与 flex 排流，中列文字后面再加 `.boot__scrim` 压暗（`scrim: .55`），层级收口成「立绘 0 < 能量线 1 < 压暗层 2 < 文字 3」（`.boot__ring/__title/__log/__bar` 点名抬到 3）；③ 擦除：因为就在 `.boot` 内部，跟着 `.is-done` 的 `clip-path` 一起被擦走，零额外代码；④ 细节：四角锁定框、脚下地面辉光、A.T. 力场六边形涟漪、自上而下扫过一次的扫描线；`is-hold` 时立绘极慢内移 + `drop-shadow` 呼吸（图片没有可点名的零件，所以把「发光件呼吸」换成整体辉光，和位移写进同一条 keyframes）；`prefers-reduced-motion` 下直接显示、不划入 |
| 3 | 手上的图是**白底不透明 PNG**（`colorType=2`，没有 alpha），直接铺上去是两块白板，连 `mix-blend-mode: screen` 也救不了（白 = 最大值，screen 去掉的只有黑） | 新增零依赖的 `tools/cutout.js`（`npm run art`）：自己解 PNG（zlib + 5 种滤镜）→ **从四条边泛洪吃掉「亮 + 中性」的连通区** → 再编码成 RGBA PNG（每行自适应滤波）。三个关键取舍：① 只吃**和边连通**的 → 图内部的白色（白衬衫、白盔甲）被线稿围住，不会被误伤（全局色键会直接毁掉浅色主体）；② 泛洪允许 **≤ tol 的相邻亮度差**（默认 60）→ 能连片吃掉 222~235 的灰白晕影和「透明区导出成棋盘格」这种背景自己的硬边，而线稿边缘（白 255 → 黑 20）一定停；③ 泛洪区外沿 2px 按亮度给一次半透明 → 抗锯齿边不留白圈。最后**按计数阈值裁掉透明边**（否则背景上几十个杂点就能把边距撑住，裁了等于没裁），`contain` 缩放的才是立绘本体。`--map` 打 ASCII 透明度图（`.` 透明 / `+` 半透明 / `w` 残留白灰 / `#` 立绘）+ 四类占比，换图调阈值不用靠眼睛猜 |
| 4 | 开关 / 换图 / 调参 | `config.boot.art`：`enabled` / `left.right.src`（文件名 → `src/assets/art/`；`./art/x.png` → `public/`；URL → CDN；**留空 = 这一侧不渲染**）/ `w` / `opacity` / `blend` / `flip`（水平镜像）/ `tag` / `slideMs` / `scrim`；地址栏覆盖 `?art=off` / `?art=1`。解析统一走 `core/artslot.js`：`import.meta.glob` 在**构建期**把 `src/assets/art/*` 展开成「名字 → 带哈希的 URL」，于是换图 = 改一行 config、没人引用的图不进包、名字写错时返回空串（这一侧安静地不显示）。`npm run check` 会在构建前拦住「图名对不上」和「图没抠白底（PNG 无 alpha）」。
| 5 | （顺手修掉的两处不一致） | 文档里 `waitEnter` 还写着 `false`（`config.js` 已是 `true`）→ 改文档并让 `waitEnter` 的提示行断言按配置分支；`smoke.js` 那条「停留期提示行给出还有几秒」假 FAIL 随之消失 |

**测试方法上的新坑（值得记一笔）**：探针环境（`--dump-dom`）里 **CSS 动画也停在第一帧**
（和第六轮发现的「过渡不推进」是同一类现象），所以「立绘划到位置了、可见了」不能直接量当帧
`rect` / `opacity`。改成量三件不依赖帧的东西：`animation-name` / `animation-fill-mode` / `animation-duration`
（证明入场真的挂在身上、且停在最后一帧）+ 内层 `--art-o`（证明可见性来自配置）+
「把当帧 `transform` 的 X 位移减掉」还原落位（证明两块各自贴一侧、内沿停在中间文字列两边）。

**换成图片后新增的那个坑**：「预留位」最容易坏的地方是**路径写错** ——
元素在、尺寸也在、`animation` 也照旧，只有图没了，而 `background-image` 不像 `<img>`
那样会报错（不出现碎图标正是我们当初选它的原因）。所以探针多加一步：把测到的
`background-image` 拿去 `new Image()` **真加载一次**，把 `naturalWidth × naturalHeight`
写进 `imgdims`（挂掉是 `FAIL` / `TIMEOUT`），冒烟里断言「左 924×1809 / 右 1558×2358」。
于是「图名对不上」「Vite 没把图打进 dist」「`base: './'` 下 URL 解析错」这三类错误
都会当场 FAIL，而不是等出图时才发现两边空着。
顺带因此抓到一个真 bug：`@keyframes` 里 `calc(-46% * var(--art-dir))` **符号写反了**，
左立绘会从屏幕中间往外滑 —— 现在有断言盯着「左从左边进、右从右边进」。

### 第六轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 开机自检页要**停久一点**（约 3s），而且「等多久进主界面」要**可配置** | `config.boot` 新增 `minMs: 3000`（= 从页面出现算起的**最短停留**：日志约 2s 写完，写满后继续停在 100% 补足到 3s 再红闪擦除；想「写满后再停 3s」就设 5000 左右）与 `waitEnter: true`（不自动进入，停在「按任意键 / 点击 进入主界面」等人工操作；改回 `false` 时停留期提示行显示倒计时）；`holdMs` 兜底改成 `max(holdMs, minMs + 1500)`，`waitEnter` 时不装自动兜底（只留 `window.onerror`）。地址栏可覆盖：`?boot=5000` / `?boot=wait` / `?boot=0` |
| 2 | GPS 的 SVG 图标要**雷达那种形状** | `#i-gps` 从「地图大头针」重画成**雷达盘**：圆盘 + 45° 扇形扫描波（右上）+ 圆心枢轴点 + 目标回波点（右下）。第一版把内圈弧 / 扫描线 / 回波点全挤在右上象限，22px 下糊成一团 → 改成「元素的分布占满不同象限 + 实心扇形（不用细线）」才清晰 |
| 3 | 右下角**氮气条还是没生成好**（只剩 `100%`，斜条没了） | **两个真凶**：① `.bar__seg` 的规则写在 `BottomBar.vue` 的 scoped 块里，但节点是 `gauges.js` 用 `document.createElement('i')` 建的 → **没有 scope 属性**，选择器不命中 → 色带整条隐形（改成 `.nosbox__segs :deep(.bar__seg)`）；② `.nosbox> :not(.chipbg){position:relative}` 权重 (0,3,0) 压过 `.nosmark[data-v]` 的 `position:absolute`，NOS 字标退回文档流占 41px（`height:auto` 的 `<b>` + 自动最小高度），把读数与色带推出框、色带被 flex 压成 2px（改成点名 `.nosbox__pct / .nosbox__segs`；`.clusterbox` 那处同款通配也一并点名）。最后按参考图重排成「上 100% / 下 22px 斑马纹色带」，斜条 `-20deg`、间隙 3px |
| 4 | （测试方法）自检停留这类**时间相关**的行为没法稳定断言 | `tools/probe.html` 新增 `when=` / `whenGone=`（轮询到条件成立/消失再量，不依赖挂载耗时）与 `cls` / `styleW` / `bg` / `bgImg` 字段；`probe()` 支持 `budget`。踩到的坑：虚拟时间下 **CSS 过渡不推进** → 「进度条到没到 100%」断言**行内 `styleW`**，别断言渲染宽度 |

### 第五轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 启动页**进度条与自检文本叠在一起** | `.boot__log` 不再写死 96px：高度 = `calc(var(--boot-rows) * 1.7em)`，`--boot-rows` 由 `config.boot.lines.length` 传进来（7 行 = 142.8px，正好装下）；再加 `overflow-y: auto` + `scrollbar-width: none` + 「真的溢出才加」的底部淡出 + 每次写行都 `scrollTop = scrollHeight` 自动跟随 → 文本永远在自己的框里，压不到进度条 |
| 2 | READY 左右的 mesh「**还是没做好平行四边形**」，而且两块要**对称 + 等高** | 上一轮的 `±15px` 上下错位本身就不对称（实测左块中心比铭牌低 14px、右块高 14px）→ 顶栏一对改成 `--mesh-dy: 0`（与底栏一致，共用同一条中线）；形状继续用镜像多边形令牌保证真平行四边形；另外把「上下边等长 + 左右斜边等长」「镜像顶点重合」「同中线」「与红框等高」「到中线等距」五条写成 **几何契约测试**（见 `tools/probe.html`），以后改坏会立刻 FAIL |
| 3 | CSS 要按 Vue 的惯例拆：**组件自己的样式写在自己的 `<style scoped>` 里**，只有公共的才单独列文件 | 删掉 `styles/layout.css`、`components.css`、`boot.css` 三个「零件大杂烩」，规则按组件归属搬进各自 `.vue`（原样搬运，规则级 diff 核对过零丢失）；`base.css` 只留令牌 / 重置 / 外壳 / 屏幕质感 / 4 个共享零件；跨组件类名清单（等宽数字）拆回各组件；`v-html`/JS 生成的 SVG 改用 `:deep()`；`check.js` 跟着改成能读 `<style scoped>`，并从行内 `:style` 里收集运行期 CSS 变量 |
| 4 | 想要一个**操作弹框**，点按钮自己决定演示什么（挡位 / 速度 / 仪表提示 / 消耗氮气 / 急加速 / 急减速…） | 新增 `ControlPanel.vue`（键盘 `O` / 左灯塔「设置」芯片 / `?panel=1`）：挡位、定速（滑杆 + 5 个快捷值）、急加速 / 急减速 / 滑行、8 条仪表提示 + 清除、电量 / 氮气 / 电机温度滑杆、消耗氮气、8 个车灯开关 + 边撑 / 充电枪 / 电源、天气、自动驾驶开关、一键回到「参考图那一帧」；写入全部复用 `input.push()` / 油门脉冲 / `state.update()` 真车规则，`state.js` 只多了一个 `forceWarn` 字段 |
| 5 | （顺手修掉的既有问题） | `smoke.js` 里两条一直 FAIL 的断言：功率圆表底部挡位名早已按反馈下线 → 删断言；图标数量阈值 `> 15` 实际是 15 → 改成 `>= 15`。`check.js` 的 id 契约会把 HTML 注释里的 id 也算进去 → 先剥注释再扫 |

### 第四轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | `battgauge__track` 必须**始终一样的尺寸** | 两条电量条改成同一套 grid：左行「读数 + 轨道」、右行「轨道 + 读数」，轨道都落在 `1fr` 列；两侧读数槽改成固定 **62px**（原来 `min-width: 60/34px`，读数变长就会挤窄轨道）→ 任何读数 / 任何状态下两个轨道尺寸完全一致（实测两轮都是 128px） |
| 2 | 底栏 `mesh--bl` / `mesh--br` 要**互相对称**、和 `.battgauge::before` **一样高** | 尺寸与形状收进 base.css 三个令牌：`--mesh-w:132` / `--mesh-h:40`（红梯形框高 = `.battgauge` 的高度）/ `--mesh-sk:24%`；`.battgauge` 直接用 `--mesh-h` 定高、`::before` 用 `height:100%` → 装饰块与红框永远等高 |
| 3 | 两对 `mesh` 都要**平行 + 对称** | 形状改用一对镜像多边形令牌 `--mesh-slash`(╱) / `--mesh-slash-r`(╲)（每块都是真平行四边形：上下边水平等长、左右斜边同斜率）；位置统一 `top:50% + translateY(-50% + var(--mesh-dy))`：底栏一对 `--mesh-dy:0`（同一中线）、顶栏一对 `±15px`（相反数 → 参考照片那种 `╲ READY ╱`），离铭牌左右都是 46px；底栏右侧那块顺带正名为 `--br`（原来是 `--tr`，与 `chip--br` 等象限命名不一致）。**⚠ 第五轮反馈：顶栏这 `±15px` 错位看起来并不对称，已改成 `0`（同一中线）** |
| 4 | 满电续航读数应该是 `145km` | `.battgauge__cap#v-range-max` 从 `view.rangeText`（74.0km）改回 `view.rangeMax`；中间那两块备注（`容量` / `74.0km`）保持不渲染 → 两条电量条紧挨在中间，两端才是读数，与参考图一致 |


### 第三轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 转向灯应该在 **`READY` 左右两侧**，并演示 **左转 / 右转 / 双闪** | `.topbar__c` 里放成 左箭头 ← 铭牌 → 右箭头；状态层新增 `lamps.hazard`（`req.hazard`），双闪时左右同步闪、`H` 键切换、单边转向自动取消；演示自动驾驶拆成三个显式场景；`A` 键退出双闪 |
| 2 | **温度图标不要了** | 删掉顶栏右侧的 `.lamp--temp`（环境温度 35℃）与 `i-thermo` 图标；电机温度仍在功率圆表里 |
| 3 | 左下角三图标位置：**信号左上 / 耳机蓝牙左下 / GPS 右下** | `config.cluster[].slot`（`tl / bl / br`）+ `.clusterbox__ico.is-*` 三处定位；`.clusterbox` 改成 2×2 格（40×34） |
| 4 | `READY` 左右、电量条左右都要有**灰黑色带斜细纹的平行四边形** | 新增 `.mesh`（交叉斜纹 + 灰黑渐变 + `clip-path` 平行四边形，`opacity:.5`），4 处：`--tl/--tr`（顶栏，左低右高）、`--bl/--tr`（底栏，左下右上） |
| 5 | 电量条要**压在梯形红色背景框下面** | `.battgauge::before`：左边缘斜切 8% 的红色梯形底框；两条电量条包进 `.battgauge__rows`（`z-index:1`）压在它上面 |
| 6 | 功率四位数（>999）会**突出圆环** | 数值改成 `.gauge__plate` 自动宽度圆角牌（`min-width:84px`）+ `len-3/4/5` 逐级降字号（49/37/30px）；`W` 单独一行放下方（与参考图一致） |
| 7 | `NOS` 字样要用 **SVG**（`os` 上方有箭头），并放到**五边形外侧** | 新增 `#i-nos` 图标（描边几何字：N 折线 / O 圆角框 / S 折线 + OS 上方箭头）；`.nosmark` 用 `bottom: calc(100% + 4px)` 挂在五边形外面 |
| 8 | 右上角「`×2 模式`」的「模式」多余；内框压到了外五边形 | `brand.dualMode` → `×2`（并删掉 `i-mode` 图标）；`.gearchip` padding 6/15 → 8/16，两块内铭牌 `min-width` 固定、`justify-items:start`，不再顶到轮廓 |
| 9 | 左右两个圆与六边形要有**重叠**（原图是六边形压住圆） | `.timedial` / `.side` 从「距中线 302 / 贴右侧」改成 `calc(50% + 190px)`（各向中心挪 112px）；`.core` 加 `z-index:3` 压在上面 |
| 10 | 两侧黄灯条太细太窄，上下要留距离 | `base.css` `.strip`：9px → 16px、上下内缩 16 → 34px、左右内缩 10 → 22px |

> 顺带：左侧圆盘内两行从「胶囊里标签 + 数值」改成参考图那样的「**金色标签牌 + 白色读数**」上下排。

### 第二轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 左上角不该有座桶/骑行状态图标，只有「天气 + 时间」，且上天气下时间 | 删掉 `.icochip--ride` 与 `i-helmet`，改成 `.timechip`（琥珀天气图标 + 25px 时间两行） |
| 2 | 右上角多出三个按钮；`新国标 + ×2 模式` 框里的倒三角与 4 个点跑到框外 | 删掉巡航 / ABS / 座桶锁三个芯片（含 3 个图标）；新增 `.gearchip`，三角 + 4 点回到框内右侧 |
| 3 | 左下角应该是**一个**五边形装三个图标；切角位置错了；四个角的五边形要对称 | 合并成一块 `.clusterbox.chip--bl`（内含 3 组图标）；四个角落芯片统一为**切角朝屏幕中心、圆角朝屏幕外角**的镜像四件套 `--penta-tl/tr/bl/br` |
| 4 | 氮气条应该是（像电量那样的）紫色不规则五边形，不该放到框外 | `.nosbar + .battbox` 合并成 `.nosbox.chip--br`：紫色框架内含 `NOS` 标签 + `100%` 读数 + 5 条紫色斜条；副电 BATT 读数按照片删掉 |
| 5 | 中央大六边形旋转角度错了，上下两条边要平行于屏幕横向 | `--hex` 与 `.core__hex` 改成**平顶六边形**（25% / 75%），`emblem.js#buildFrame()` 同步重画（470×440） |
| 6 | 左右两个状态圆圈大小不一 | `.timedial` 由 164 → **240**，与功率圆表外径（`RING=128 × 268/300 + 描边` ≈ 239）一致 |
| 7 | 左侧五个六边形也要调整旋转角度 | `.hexchip` 换成平顶六边形，58×50、间隙 4px（照片里几乎相接） |
| 8 | 挡位是 A 助力推行 / E 经济 / C 滑行 / F 激烈 / X1 新国标 / X2 新国飚，要显示在中央六边形里，换挡时六边形要有心跳动画 | `config.vehicle.gears` 六挡 + `P` 驻车；状态层改 `rideGear / gearDef / cycleGear`；新增 `.core__gear` 铭牌 + `coreBeat` 0.56s 心跳；键盘改 `1`~`6` / `P` / `G`；右上角徽标即当前挡位 |
| 9 | 龙头锁 OFF 应该是红色而不是灰色 | `.core__lock` 默认 `--c-red-2`（带红色辉光），ON 才转琥珀 |

### 第一轮

| # | 反馈 | 处理 |
| --- | --- | --- |
| 1 | 启动后 P 的位置应该是时速数字 | 中央改成单一「大字槽」：`P` 档 `P`，行驶中显示时速 + `km/h` + 挡位角标 |
| 2 | 左侧 5 个芯片图标错了 | 换成 消息 / 导航 / NERV / 音乐 / 设置（新增 5 个图标） |
| 3 | 左侧应该是六边形 | 新增 `--hex`，`.pentchip` → `.hexchip` |
| 4 | 双电要并列一排 | `.battgauge` 改 `flex-direction: row`，底栏中间合并成一行 |
| 5 | 「五边形」= 右下切一刀 + 左上带弧度 | 新增 `--penta` / `--penta-r`，`clip-path` 切角 + `border-radius` 保弧度 |
| 6 | 右上：新国标 + ×2 模式 + 倒三角 + 4 圆点 | 新增 `.certchip` 与 `.leveldots` |
| 7 | 左下：信号 / 耳机蓝牙 / GPS，1 上 2 下 | 新增 `config.cluster` + `.clusterchip` |
| 8 | ODO 放到六边形左下边 | `.core__odo` |
| 9 | 六边形右下角是龙头锁 OFF | `.core__lock` + `i-steerlock`，并接入「上锁不能挂挡」 |
| 10 | 整体改 Vue 3 + Vite，去掉 server.js | 全量重构到 `src/` 分层；`js/` `css/` `server.js` 已删除；`check.js` 会把旧结构残留当成失败项 |

**实现取舍**：

* 左下角严格按照片只留 3 组状态（信号 / 耳机蓝牙 / GPS），而且装在同一块五边形里；
  原来的「告警三角」并入左侧**消息**芯片（红闪 + 角标），三重冗余不变。
* 第三轮把转向灯从「功率圆表左侧 / 右转向 + 环境温度」改成「`READY` 左右各一颗」——
  参考照片里紧挨铭牌的就是这两颗箭头，环境温度那一颗按反馈删除。
* 六边形与左右两个圆**故意重叠**（各 45px）：`z-index` 上六边形更高，
  与实车照片一致；`--stage-w` 下主体区仍有富余，不会挤压灯塔与底栏。
* `.mesh` 斜纹块是**纯装饰**（`pointer-events:none`、`aria-hidden`），
  不参与任何状态表达，删掉不影响功能。
* 右上角那三个功能灯按反馈删掉了（`lamps.cruise / abs / seat` 字段仍在状态里，
  只是不再上屏）。巡航行为本身没变，只是不再占用顶栏位置。
* 「双电」按「容量条 + 续航条并列」实现（照片上 51% 与 145 在同一行）。
  两条的填充比例物理上必然相同（续航与电量成正比），这是正确行为，不是 bug。
* 副电 `auxSoc` 仍在状态里（USB 供电会掉电），但按照片不再单独上屏 ——
  参考图右下角那块紫框上的读数其实是 **NOS 百分比**，不是副电。
* 龙头锁用了独立的 `lamps.lock` 字段（默认 OFF，与照片一致），
  没有复用旧的「车辆锁」概念。
* `P` 与六个骑行挡位共用同一个 `gear` 字段：`P` 是驻车态，其余是骑行挡位 ——
  顺手把原先独立的「骑行模式（ECO/DRIVE/SPORT）」也合并了，少一套概念。

---

## 9. 已知取舍与后续可做

* **美术是原创几何**：仪表本体（徽记 `emblem.js`、圆表 `gauges.js`、图标 `icons.js`）都是
  自己画的通用工业语言，不含官方美术素材。想要"更像"，把 `core/emblem.js` 的返回值换成
  自己的 `<image>`（保持 300×300 画布与镜像轴 x=150 即可）。
* 开机自检的两侧立绘是**预留位**：`src/assets/art/` + `config.boot.art` 换成你自己的图即可
  （白底图先 `npm run art` 抠透明底）。⚠ 仓库里现成的那两张是使用者自己放进去的素材，
  不是本项目绘制；要公开分发的话请按素材本身的授权确认 —— 留空那两行 `src` 就会回到
  纯文字自检页，功能不受影响。
* NOS 氮气条只有 5 格（对齐照片的 5 段），分辨率不如线性条，属于有意取舍。
* 物理模型是**演示级**：一阶加速 + 功率估算 + 电池 Wh 积分 + 一阶热模型，
  用于让指针动得合理，不是标定模型。
* NERV 图标按用户提供的 `prototype/nerv.jfif` 重画成 24×24 剪影（半片叶子 + 斜叶柄 +
  `NE / RV` 两行字母），只是**示意性简化**，不是官方矢量文件。
* **地图三家的 key / CORS 是「跑不通也能用」的那一处**：高德 WebService 支持跨域直连，
  百度 / 腾讯多数端点要 JSONP 或自建 `proxy` 转发；key 留空 / 被拦 / 结构不认识时一律退到
  **直线估算**并明确标出来，绝不假装是真实路线。真机联调要自己填 key（`config.apps.nav.keys`）。
* **BMS 的 UUID 与字段偏移没有实机校验**（手上没有保护板）：`core/ble.js` 把它们全收在
  `BOARDS` 一张表里，实机抓包后只改一处；JK / ANT 目前只记录原始帧。另外 Web Bluetooth 只在
  Chromium + **安全上下文**（`file://` / `localhost` / `https://`）里存在，`http://192.168.x.x`
  会被整体禁用 —— 所以设置页里那张「环境自检」卡片会把结论和原因直接写出来。
* **媒体只加载浏览器真的能播的格式**（白名单扩展名 + `canPlayType`），`.mkv / .avi / .wmv`
  这类故意不在白名单里；不支持 File System Access 的内核退回 `<input type="file">`
  （功能一样，少了「记住上次那个文件夹」）。
* **NERV 页是空占位**（使用者明确说暂时不做）：不留死链、也不假装有功能，
  想好了往 `NervPage.vue` 里加。
* **保活与路由的代价**：第 10 轮为「切页不卸载」引入了 `vue-router`（运行时第二个依赖）与
  `<KeepAlive>` —— 访问过的页面实例会一直活着（内存换体验）。本项目只有 5 个页面、每页都是
  纯前端状态，代价可以接受；真要回收就加 `:max` 或 `:include`。hash 模式是**为了 `file://`**
  （双击 `dist/index.html` 就能跑）—— 如果以后挂到服务器上想要干净路径，换 `createWebHistory`
  即可，路由表本身不用动。
* **挡位图（A / C / E / F）是使用者放进 `src/assets/gear/` 的素材**（和自检页立绘同一条提醒：
  要公开分发请按素材本身的授权确认）。`P` 没有对应图 → 回落原创机甲徽记；
  `config.vehicle.gearArt.enabled = false` 就完全不显示图。⚠ C.png 的背景不是纯白（180~235 的
  浅蓝灰），`cutout.js` 默认的种子阈值抠不动它，所以 `FILE_TUNING` 里给这一张单独放低了
  `seed / floor / sat`；换图时若发现「整块背景没被抠掉」，先 `--dry --map` 看一眼背景亮度。
* 后续可做：多语言、深浅主题切换、WebSocket 数据源适配器、
  关键帧截图回归测试（`tools/shot.js` 已经打好底子）。
