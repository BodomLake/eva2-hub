/*!
 * ble.js — BMS 保护板（i-set）的 Web Bluetooth 方案
 * ==================================================================
 * ⚠ 先把结论放在最前面（本机实测，见 README「BMS 与蓝牙可行性」一节）：
 *
 *   Web Bluetooth 只在 **Chromium 内核**（Chrome / Edge）+ **安全上下文**
 *   （file:// 、http://localhost、http://127.0.0.1、https://）下存在。
 *   实测同一台机器、同一个 Chrome：
 *     file:///…            → navigator.bluetooth = object   ✔
 *     http://127.0.0.1     → navigator.bluetooth = object   ✔
 *     http://192.168.x.x   → navigator.bluetooth = undefined ✘（不安全上下文，整体禁用）
 *   Firefox / Safari / 老车机内核没有这个 API；而且 requestDevice() 必须由
 *   **用户手势**触发（点按钮），没法后台静默扫描。
 *
 *   结论：方案在「Chromium 桌面 / 安卓 Chrome / 车机 Chromium」上可行，
 *   在别的内核上不可行。所以这里按「UI 先做全 + 真连接做成可选骨架」：
 *     · UI（SettingsPage.vue）完好：型号选择 / 连接状态 / 每串电压 / 原始帧日志
 *     · 数据来源三选一：演示数据（默认）→ 真机连接 → 历史最后一份
 *     · 四种保护板的 service / characteristic UUID 都列在上面那张表里，
 *       解析器把「字段偏移」全部提出来放一个表，实机抓包后只改一处。
 *
 * 关于四种板子（社区已公开的部分，**均未经实机校验**）：
 *   嘉百达 JBD / 彦阳 YY —— 0xDD 0xA5 帧 + 16 位和校验；FF00/FF01/FF02
 *   极空 JK           —— 0x55 0xAA 帧 + CRC16；FFE0/FFE1（原厂 App 与社区
 *                        集成都用这一对，BMS 周期上报）
 *   蚂蚁 ANT          —— 老款是经典蓝牙 SPP（浏览器够不着，必须原生桥）；
 *                        BLE 版常见 FF00/FF01
 * 因此：JK / ANT 目前**只记录原始帧**（解析表留空），JBD / YY 做尽力解析
 * （标 verified: false，界面会跟着显示「未实机校验」）。
 */
import { CONFIG as C } from '../config.js';

/* 16 位短 UUID → 128 位标准写法 */
function U(hex) {
  return hex + '-0000-1000-8000-00805f9b34fb';
}

export const BOARDS = [
  {
    id: 'jbd', name: '嘉百达', en: 'JBD / JIABAIDA',
    service: U('0000ff00'), notify: U('0000ff01'), write: U('0000ff02'),
    frame: 'jbd', parse: true, namePrefix: '',
    note: 'DD A5 帧 + 16 位和校验；FF00/FF01/FF02 是 JBD 生态最通用的一组',
    feature: '十六串电压 / 总压 / 电流 / 容量 / 循环 / 双 NTC 温度'
  },
  {
    id: 'yy', name: '彦阳', en: 'YANYANG',
    service: U('0000ffe0'), notify: U('0000ffe1'), write: U('0000ffe1'),
    frame: 'jbd', parse: true, namePrefix: '',
    note: '多数彦阳型号与 JBD 同族（DD A5 帧），UUID 有的走 FFE0/FFE1',
    feature: '与 JBD 同族协议（字段偏移共用一张表）'
  },
  {
    id: 'jk', name: '极空', en: 'JK BMS',
    service: U('0000ffe0'), notify: U('0000ffe1'), write: U('0000ffe1'),
    frame: 'jk', parse: false, namePrefix: 'JK',
    note: '0x55AA 帧 + CRC16，BMS 周期上报；帧格式待实机抓包补齐（当前只记原始帧）',
    feature: '电压 / 电流 / 每串电压 / MOS 温度 / 均衡状态'
  },
  {
    id: 'ant', name: '蚂蚁', en: 'ANT BMS',
    service: U('0000ff00'), notify: U('0000ff01'), write: U('0000ff02'),
    frame: 'ant', parse: false, namePrefix: 'ANT',
    note: '老款蚂蚁是经典蓝牙 SPP（浏览器无法访问）；BLE 版常见 FF00/FF01，帧格式待实测',
    feature: 'BLE 版才可能被浏览器连上；SPP 版必须走原生桥'
  }
];

export function boardOf(id) {
  return BOARDS.filter(function (b) { return b.id === id; })[0] || BOARDS[0];
}

/* ============================ 环境自检 ============================ */
/* 设置页把结论直接摊开给用户看：能不能用、为什么不能用、怎么办 */
export function env() {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const ua = (nav && nav.userAgent) || '';
  const secure = typeof window !== 'undefined' ? !!window.isSecureContext : false;
  const hasApi = !!(nav && nav.bluetooth);
  const browser = /Edg\//.test(ua) ? 'Edge'
    : (/OPR\//.test(ua) ? 'Opera'
      : (/Firefox\//.test(ua) ? 'Firefox'
        : (/Chrome\//.test(ua) || /Chromium/.test(ua) ? 'Chrome / Chromium'
          : (/Safari\//.test(ua) && !/Chrome/.test(ua) ? 'Safari' : (ua ? '其它内核' : '非浏览器环境')))));
  const href = typeof window !== 'undefined' && window.location ? window.location.href : '';

  let verdict, headline, advice;
  if (hasApi && secure) {
    verdict = 'yes';
    headline = '可用';
    advice = '点「连接保护板」后由浏览器弹出设备选择框（必须由点击触发）；' +
      '同型号的保护板一般只允许一个连接，手机 App 连着时先断开。';
  } else if (!secure) {
    verdict = 'insecure';
    headline = '被安全上下文挡住';
    advice = '当前不是安全上下文（常见于用 http + 局域网 IP 打开车机页面）→ ' +
      '改成 https，或在车机上用 http://localhost / http://127.0.0.1 打开，或直接用 file:// 打开构建产物。';
  } else {
    verdict = 'no-api';
    headline = '当前内核不提供 Web Bluetooth';
    advice = 'Firefox / Safari / 老内核没有这个 API，也没有 polyfill → ' +
      '只能看演示数据；要真连保护板请用 Chrome / Edge（或给车机装一个 Chromium 内核浏览器）。';
  }

  return {
    secure: secure,
    hasApi: hasApi,
    browser: browser,
    ua: ua,
    href: href,
    verdict: verdict,
    headline: headline,
    advice: advice
  };
}

/* ============================ 演示数据包 ============================ */
/* 16 串（config.apps.bms.cells）随车速 / 功率轻微变化的电量包，
   让设置页与导航一样「有东西动」，不用真板子也能把 UI 走完。 */
export function demoPack(boardId, t, o) {
  o = o || {};
  const cfg = C.apps.bms;
  const board = boardOf(boardId || cfg.board);
  const n = cfg.cells;
  const tt = t || 0;
  const soc = o.soc == null ? 72 : o.soc;
  const power = o.power || 0;                     /* 正 = 放电，负 = 回充 */
  const cells = [];
  for (let i = 0; i < n; i++) {
    const mid = 1 - Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
    cells.push(Number((3.27 + mid * 0.07 + Math.sin(tt * 0.7 + i * 0.9) * 0.005).toFixed(3)));
  }
  /* 让某一串略微偏低：演示「压差」与「落后串高亮」 */
  cells[Math.floor(n / 3)] -= 0.028;
  const voltage = Number(cells.reduce(function (a, b) { return a + b; }, 0).toFixed(2));
  const cellMax = Math.max.apply(null, cells);
  const cellMin = Math.min.apply(null, cells);
  const current = voltage > 0 ? Number((power / voltage).toFixed(2)) : 0;
  const temp = Number((o.temp == null ? 31 : o.temp).toFixed(1));

  return {
    source: 'demo',
    board: board.id,
    name: o.name || cfg.name,
    cells: cells,
    cellMax: cellMax,
    cellMin: cellMin,
    delta: Number((cellMax - cellMin).toFixed(3)),
    voltage: voltage,
    current: current,
    power: Number((voltage * current).toFixed(1)),
    soc: soc,
    remainAh: Number((cfg.designAh * soc / 100).toFixed(2)),
    designAh: cfg.designAh,
    cycles: 86,
    soh: 97,
    temp: temp,
    mosTemp: Number((temp + 9).toFixed(1)),
    balancing: (1 << Math.floor(n / 3)) | (1 << (n - 1)),
    balanceOn: true,
    discharge: true,
    charge: true,
    mos: true,
    cutoffV: cfg.cutoffV,
    protector: board.en,
    t: tt
  };
}

/* ============================ 帧构造 / 解析 ============================ */
/* 所有「字段偏移」集中在这里：实机抓包后只改这一处 */
export const JBD_FIELDS = {
  cellsAt: 4,           // 串数所在字节
  cellBase: 5,          // 第 1 串电压起始字节（2 字节 / 串，大端，单位 mV）
  cellStep: 2,
  cellScale: 0.001,     // mV → V
  tempCountAfter: true, // 电压表之后 1 字节 = NTC 个数
  tempScale: 0.1,       // 温度：0.1K（- 2731 → ℃）
  currentScale: 0.01,   // 0.01A，有符号
  voltageScale: 0.01,   // 0.01V
  ahScale: 0.01,        // 0.01Ah
  verified: false       // ⚠ 未经实机校验
};

/* 读帧请求：DD A5 03 00 FF FD 77（JBD 生态的标准「读基本信息」） */
const JBD_POLL = [0xdd, 0xa5, 0x03, 0x00, 0xff, 0xfd, 0x77];

/* 16 位和校验：累加所有字节取低 16 位（JBD 用它） */
export function sum16(bytes) {
  let s = 0;
  for (let i = 0; i < bytes.length; i++) s += bytes[i];
  return s & 0xffff;
}

/* 返回 { frame, note }：frame = null 表示这个型号的读取帧还没实机校验过 */
export function buildPoll(boardId) {
  const board = boardOf(boardId || C.apps.bms.board);
  if (board.frame === 'jbd') {
    return { frame: new Uint8Array(JBD_POLL), note: 'DD A5 03 00 FF FD 77（读基本信息）' };
  }
  return {
    frame: null,
    note: board.name + ' 的读取帧未实机校验 —— 只订阅 BMS 上报；' +
      '要主动轮询请把帧构造补到 core/ble.js 的 buildPoll()'
  };
}

/* bytes → 'DD A5 03 …'（原始帧日志用） */
export function hex(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).toUpperCase();
    out.push(h.length < 2 ? '0' + h : h);
  }
  return out.join(' ');
}

/* 尽力解析；认不出来就返回 { cells:null, raw } —— 界面照样显示原始帧 */
export function parse(boardId, bytes) {
  const board = boardOf(boardId || C.apps.bms.board);
  const raw = hex(bytes);
  if (!board.parse) return { source: 'ble', board: board.id, cells: null, raw: raw, verified: false };
  const pack = parseJbd(bytes);
  if (!pack) return { source: 'ble', board: board.id, cells: null, raw: raw, verified: false };
  pack.board = board.id;
  pack.raw = raw;
  pack.verified = JBD_FIELDS.verified;
  return pack;
}

/* JBD：DD <cmd> <len> <data…> <sum16> 77 */
function parseJbd(bytes) {
  if (!bytes || bytes.length < 10 || bytes[0] !== 0xdd) return null;
  const F = JBD_FIELDS;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes[F.cellsAt];
  if (!n || n > 32) return null;
  let off = F.cellBase;
  if (off + n * F.cellStep > bytes.length - 3) return null;

  const cells = [];
  for (let i = 0; i < n; i++) {
    cells.push(Number((view.getUint16(off + i * F.cellStep, false) * F.cellScale).toFixed(3)));
  }
  off += n * F.cellStep;

  const temps = [];
  if (F.tempCountAfter && off < bytes.length - 3) {
    const ntc = bytes[off];
    off += 1;
    for (let i = 0; i < ntc && off + 2 <= bytes.length - 3; i++) {
      temps.push(Number(((view.getInt16(off, false) - 2731) * F.tempScale).toFixed(1)));
      off += 2;
    }
  }

  function take16(scale, signed) {
    if (off + 2 > bytes.length - 3) return null;
    const v = signed ? view.getInt16(off, false) : view.getUint16(off, false);
    off += 2;
    return Number((v * scale).toFixed(2));
  }

  const current = take16(F.currentScale, true);
  const voltage = take16(F.voltageScale, false);
  const remainAh = take16(F.ahScale, false);
  const designAh = take16(F.ahScale, false);
  const cycles = (off + 2 <= bytes.length - 3) ? view.getUint16(off, false) : null;
  const cellMax = Math.max.apply(null, cells);
  const cellMin = Math.min.apply(null, cells);

  return {
    source: 'ble',
    cells: cells,
    cellMax: cellMax,
    cellMin: cellMin,
    delta: Number((cellMax - cellMin).toFixed(3)),
    voltage: voltage == null
      ? Number(cells.reduce(function (a, b) { return a + b; }, 0).toFixed(2))
      : voltage,
    current: current == null ? 0 : current,
    power: Number(((current || 0) * (voltage || 0)).toFixed(1)),
    temp: temps.length ? temps[0] : null,
    temps: temps,
    remainAh: remainAh,
    designAh: designAh,
    soc: (remainAh && designAh) ? Math.round(remainAh / designAh * 100) : null,
    cycles: cycles,
    soh: null,
    mosTemp: temps.length > 1 ? temps[1] : null,
    balanceOn: null,
    discharge: null,
    charge: null,
    mos: null,
    protector: boardOf('jbd').en
  };
}

/* ============================ 真连接（可选骨架） ============================ */
/*
 * 只在 env().verdict === 'yes' 时能走通；调用方（设置页）负责在**按钮点击**里调用，
 * 因为 requestDevice() 必须由用户手势触发。
 * 成功后的数据流：GATT notify → onHex(原始帧) + onData(尽力解析)；
 * 解析不出来（JK / ANT）也照样把原始帧记进日志，界面不会空着。
 */
export async function connect(opts) {
  opts = opts || {};
  const board = boardOf(opts.board || C.apps.bms.board);
  const e = env();
  if (!e.hasApi) throw new Error('当前内核不提供 Web Bluetooth（' + e.browser + '）');
  if (!e.secure) throw new Error('不是安全上下文：请用 https / localhost / file:// 打开');

  const filters = [];
  const prefix = opts.namePrefix || board.namePrefix;
  if (prefix) filters.push({ namePrefix: prefix });
  filters.push({ services: [board.service] });       // UUID 兜底：名字对不上的也能选到

  const device = await navigator.bluetooth.requestDevice({
    filters: filters,
    optionalServices: [board.service]
  });

  const onHex = opts.onHex || function () {};
  const onData = opts.onData || function () {};
  const onState = opts.onState || function () {};
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(board.service);
  const chr = await service.getCharacteristic(board.notify);

  function onValue(ev) {
    const dv = ev.target.value;
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    onHex(hex(bytes));
    onData(parse(board.id, bytes));
  }

  await chr.startNotifications();
  chr.addEventListener('characteristicvaluechanged', onValue);

  const poll = buildPoll(board.id);
  let timer = 0;

  async function write(frame) {
    const data = frame || poll.frame;
    if (!data) return false;
    const wc = await service.getCharacteristic(board.write);
    if (wc.writeValueWithoutResponse) await wc.writeValueWithoutResponse(data);
    else await wc.writeValue(data);
    return true;
  }

  if (poll.frame && opts.pollMs) {
    timer = window.setInterval(function () { write().catch(function () {}); }, opts.pollMs);
    write().catch(function () {});
  }

  async function disconnect() {
    if (timer) window.clearInterval(timer);
    timer = 0;
    try { chr.removeEventListener('characteristicvaluechanged', onValue); } catch (err) { /* 忽略 */ }
    try { await chr.stopNotifications(); } catch (err) { /* 忽略 */ }
    try { device.gatt.disconnect(); } catch (err) { /* 忽略 */ }
    onState('offline');
  }

  device.addEventListener('gattserverdisconnected', function () {
    if (timer) window.clearInterval(timer);
    timer = 0;
    onState('offline');
  });

  onState('online');
  return {
    device: device,
    board: board,
    name: device.name || board.name,
    pollNote: poll.note,
    write: write,
    disconnect: disconnect
  };
}
