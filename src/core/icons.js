/*!
 * icons.js — 内联 SVG 图标精灵
 * ------------------------------------------------------------------
 * 全部图标都是 24×24 描边图形，颜色跟随 currentColor，
 * 由 App.vue 一次性注入 <body>，再用 <use href="#i-xxx"> 引用。
 * 换成自己的图标：保持 symbol id 不变替换图形即可。
 */

const SYMBOLS = [
    /* 天气：雾（左上角芯片第一行，参考图那颗琥珀色图标） */
    '<symbol id="i-fog" viewBox="0 0 24 24">' +
      '<path d="M15.6 6.6a3.3 3.3 0 0 0-6.4-.9"/>' +
      '<path d="M7.4 10.4h9.2M4.6 14h14.8M7.4 17.6h9.2"/>' +
    '</symbol>',

    /* 天气：晴 */
    '<symbol id="i-sun" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="4.4"/>' +
      '<path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6"/>' +
      '<path d="M5.6 5.6l1.9 1.9M16.5 16.5l1.9 1.9M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9"/>' +
    '</symbol>',

    /* 天气：多云 */
    '<symbol id="i-cloud" viewBox="0 0 24 24">' +
      '<path d="M7.4 18.4h9.4a3.9 3.9 0 0 0 .4-7.8 5.3 5.3 0 0 0-10.2-.6' +
        'A3.8 3.8 0 0 0 7.4 18.4z"/>' +
    '</symbol>',

    /* 天气：雨 */
    '<symbol id="i-rain" viewBox="0 0 24 24">' +
      '<path d="M7.4 14.6h9.4a3.9 3.9 0 0 0 .4-7.8 5.3 5.3 0 0 0-10.2-.6' +
        'A3.8 3.8 0 0 0 7.4 14.6z"/>' +
      '<path d="M8.6 17.6l-1 3M12 17.6l-1 3M15.4 17.6l-1 3"/>' +
    '</symbol>',

    /* 能量回收 */
    '<symbol id="i-regen" viewBox="0 0 24 24">' +
      '<path d="M4.4 12A7.6 7.6 0 0 1 17.4 6.6"/>' +
      '<path d="M19.6 12a7.6 7.6 0 0 1-13 5.4"/>' +
      '<path d="M17.4 2.6v4.2h-4.2M6.6 21.4v-4.2h4.2"/>' +
    '</symbol>',

    /* 大灯 */
    '<symbol id="i-beam" viewBox="0 0 24 24">' +
      '<path d="M3.6 8.4h4.6l6-3.4v14l-6-3.4H3.6z"/>' +
      '<path d="M17.6 9.6l3.4-2M17.6 14.4l3.4 2M18.6 12h3"/>' +
    '</symbol>',

    /* 龙头锁（车把 + 锁体）：六边形右下角的开关标志 OFF / ON */
    '<symbol id="i-steerlock" viewBox="0 0 24 24">' +
      '<path d="M3.4 8.4h17.2"/>' +
      '<path d="M12 8.4v2.7"/>' +
      '<rect x="8.4" y="11.1" width="7.2" height="5.9" rx="1.8"/>' +
      '<path d="M10.3 11.1v-1.2a1.7 1.7 0 0 1 3.4 0v1.2"/>' +
      '<path d="M12 14.2v1.3"/>' +
    '</symbol>',

    /* 消息（左侧灯塔第 1 个） */
    '<symbol id="i-msg" viewBox="0 0 24 24">' +
      '<path d="M4.8 4.8h14.4a1.8 1.8 0 0 1 1.8 1.8v8a1.8 1.8 0 0 1-1.8 1.8H9.9l-4.3 3.8v-3.8H4.8' +
        'A1.8 1.8 0 0 1 3 14.6V6.6a1.8 1.8 0 0 1 1.8-1.8z"/>' +
      '<path d="M7.2 9h9.6M7.2 12.2h6.2"/>' +
    '</symbol>',

    /* 导航（左侧灯塔第 2 个） */
    '<symbol id="i-nav" viewBox="0 0 24 24">' +
      '<path d="M20.8 3.2 3.4 10.4l7.3 2.9 2.9 7.3z"/>' +
    '</symbol>',

    /* NERV（左侧灯塔第 3 个）：照着 prototype/nerv.jfif 画的 ——
     * 半片叶子（实心） + 斜向叶柄 + 「NE / RV」两行字母（字母与叶片同色，融成一个剪影）。 */
    '<symbol id="i-nerv" viewBox="0 0 24 24">' +
      '<path fill="currentColor" stroke="none" d="M17.2 2.6c2.6 1.6 4 4.6 4 7.8 0 3.8-.6 7.4-.4 11' +
        ' 0 .4-.2.6-.6.6-.4 0-.6-.3-.7-.7-1.3-3.7-4.1-6.7-6.1-9.7-1.5-2.3-2-5.5-.4-7.5' +
        ' 1-1.3 2.4-1.9 4.2-1.5z"/>' +
      /* 叶柄 */
      '<path d="M2.4 2.4 11.6 11.6" stroke-width="1.1"/>' +
      /* NE / RV */
      '<g stroke-width="1.05">' +
        '<path d="M1.4 14.2V9.6l5.2 4.6V9.6"/>' +
        '<path d="M13.2 9.6H9.8v4.6h3.4M9.8 11.9h2.9"/>' +
        '<path d="M4.8 21.4v-4.8h2.5a1.2 1.2 0 0 1 0 2.4H4.8l2.7 2.4"/>' +
        '<path d="M11.4 16.6 13.9 21.4l2.5-4.8"/>' +
      '</g>' +
    '</symbol>',

    /* 音乐（左侧灯塔第 4 个） */
    '<symbol id="i-music" viewBox="0 0 24 24">' +
      '<path d="M9.4 18V6.6l9.8-2.2v11.2"/>' +
      '<circle cx="6.8" cy="18.2" r="2.6"/><circle cx="16.6" cy="15.8" r="2.6"/>' +
    '</symbol>',

    /* 设置（左侧灯塔第 5 个） */
    '<symbol id="i-set" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="3.4"/>' +
      '<path d="M12 2.8v2.6M12 18.6v2.6M3.4 12h2.6M18 12h2.6"/>' +
      '<path d="M5.9 5.9 7.8 7.8M16.2 16.2l1.9 1.9M18.1 5.9l-1.9 1.9M7.8 16.2 5.9 18.1"/>' +
    '</symbol>',

    /* GPS 定位（左下角芯片组第 3 个）—— **雷达盘**：
     * 圆形盘面 + 一条扇形扫描波（右上）+ 一个目标回波点（右下）。
     * 中心不放圆点、不画细线，22px 下笔画不会糊成一团。
     * 不再用地图大头针（参考图里这颗表达的是「雷达 / 定位中」）。 */
    '<symbol id="i-gps" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="8.8"/>' +
      '<path d="M12 12 12 3.2A8.8 8.8 0 0 1 18.2 5.8z" fill="currentColor" stroke="none"/>' +
      '<circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>' +
      '<circle cx="15.8" cy="17.4" r="1.4" fill="currentColor" stroke="none"/>' +
    '</symbol>',

    /* 耳机（与蓝牙图标同框 = 「耳机带蓝牙」） */
    '<symbol id="i-headset" viewBox="0 0 24 24">' +
      '<path d="M4.8 14.6v-3.4a7.2 7.2 0 0 1 14.4 0v3.4"/>' +
      '<rect x="2.9" y="13.4" width="4.2" height="6.8" rx="1.9"/>' +
      '<rect x="16.9" y="13.4" width="4.2" height="6.8" rx="1.9"/>' +
    '</symbol>',

    /* 蓝牙（与耳机图标同框 = 「耳机带蓝牙」） */
    '<symbol id="i-bt" viewBox="0 0 24 24">' +
      '<path d="M7 7.2l10 9.6-5 4.2V3l5 4.2L7 16.8"/>' +
    '</symbol>',

    /* 左 / 右转向 */
    '<symbol id="i-arrow-l" viewBox="0 0 24 24">' +
      '<path d="M14.6 5.2 7.4 12l7.2 6.8"/><path d="M8.4 12h12"/>' +
    '</symbol>',
    '<symbol id="i-arrow-r" viewBox="0 0 24 24">' +
      '<path d="M9.4 5.2 16.6 12l-7.2 6.8"/><path d="M3.6 12h12"/>' +
    '</symbol>',

    /* 信号强度 */
    '<symbol id="i-signal" viewBox="0 0 24 24">' +
      '<path d="M4.6 19.4v-3.4M9.2 19.4v-6.4M13.8 19.4v-9.6M18.4 19.4V5.4"/>' +
    '</symbol>',

    /* 告警三角 */
    '<symbol id="i-warn" viewBox="0 0 24 24">' +
      '<path d="M12 4.4 21 19.6H3z"/><path d="M12 10.2v4.2M12 17.1v.1"/>' +
    '</symbol>',

    /* NOS 氮气徽标（右下角紫色五边形「外侧」那一枚）
     * 参考图里「os」上方还有一道箭头 —— 纯文本做不出来，所以整个字标
     * 用几何描边画成 SVG（N 一笔折线 / O 圆角方框 / S 折线 + OS 上方的箭头）。 */
    '<symbol id="i-nos" viewBox="0 0 32 22">' +
      /* N */
      '<path d="M1.4 20.4 1.4 9.4 9 20.4 9 9.4"/>' +
      /* O */
      '<rect x="13" y="9.4" width="8.4" height="11" rx="1.6"/>' +
      /* S */
      '<path d="M30.4 11.4 24.4 11.4 24.4 14.8 30.4 14.8 30.4 18.4 24.4 18.4"/>' +
      /* 「os」上方那道箭头 */
      '<path d="M15.8 6.4 22.4 1.6 30 5.4"/>' +
    '</symbol>',

    /* USB 供电 */
    '<symbol id="i-usb" viewBox="0 0 24 24">' +
      '<rect x="8.6" y="14.4" width="6.8" height="6.4" rx="1.7"/>' +
      '<path d="M12 14.4V4.2"/><path d="M12 4.2 9.6 7.4M12 4.2l2.4 3.2"/>' +
    '</symbol>',

    /* ============================================================
     * 第 9 轮新增：五个应用页用到的图标
     * ========================================================== */

    /* 消息中心：铃铛（未读提示）/ 历史（故障码）/ 天气骤变预警 */
    '<symbol id="i-bell" viewBox="0 0 24 24">' +
      '<path d="M6.4 10.2a5.6 5.6 0 0 1 11.2 0c0 4 1.4 5.4 1.4 5.4H5s1.4-1.4 1.4-5.4z"/>' +
      '<path d="M10.2 18.6a2 2 0 0 0 3.6 0"/>' +
    '</symbol>',
    '<symbol id="i-history" viewBox="0 0 24 24">' +
      '<path d="M3.8 12a8.4 8.4 0 1 0 2.7-6.2"/>' +
      '<path d="M3.4 4.2v4.4h4.4"/><path d="M12 7.8v4.6l3.2 1.9"/>' +
    '</symbol>',
    '<symbol id="i-cloud-bolt" viewBox="0 0 24 24">' +
      '<path d="M8.2 15.2h8.2a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.5-.6 3.5 3.5 0 0 0 .9 7.8z"/>' +
      '<path d="M13.2 14.4l-2.2 3.6h3.2l-2 3.4"/>' +
    '</symbol>',

    /* 胎压胎温（消息中心 / 设置页共用） */
    '<symbol id="i-tire" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4"/>' +
      '<path d="M12 3.6v5M12 15.4v5M3.6 12h5M15.4 12h5"/>' +
    '</symbol>',

    /* 四种出行模式（core/nav.js 的 MODES 引用这几个 id） */
    '<symbol id="i-car" viewBox="0 0 24 24">' +
      '<path d="M3.4 15.4h17.2V12l-1.9-4.6a1.6 1.6 0 0 0-1.5-1H6.8a1.6 1.6 0 0 0-1.5 1L3.4 12z"/>' +
      '<circle cx="7.4" cy="17.4" r="1.9"/><circle cx="16.6" cy="17.4" r="1.9"/>' +
      '<path d="M6.4 12h11.2"/>' +
    '</symbol>',
    '<symbol id="i-bus" viewBox="0 0 24 24">' +
      '<rect x="4.6" y="3.4" width="14.8" height="14.6" rx="2.2"/>' +
      '<path d="M4.6 12.4h14.8M8.6 3.4v4.6M15.4 3.4v4.6"/>' +
      '<circle cx="8.2" cy="20.4" r="1.4"/><circle cx="15.8" cy="20.4" r="1.4"/>' +
    '</symbol>',
    '<symbol id="i-bike" viewBox="0 0 24 24">' +
      '<circle cx="5.8" cy="17.4" r="3.4"/><circle cx="18.2" cy="17.4" r="3.4"/>' +
      '<path d="M5.8 17.4 10 8.2h4.4l3.8 9.2"/>' +
      '<path d="M8.6 8.2h4.6M12.6 8.2l2-3.2h3"/>' +
    '</symbol>',
    '<symbol id="i-walk" viewBox="0 0 24 24">' +
      '<circle cx="13.2" cy="4.2" r="1.8"/>' +
      '<path d="M13 6.6 10.6 10l2 3.2-1.2 6.8M13 6.6l2.8 3.4M14.4 13.6l1.2 6.4M10.6 10 7.6 12.6"/>' +
    '</symbol>',

    /* 导航：搜索 / 定位 / key / 路线 */
    '<symbol id="i-search" viewBox="0 0 24 24">' +
      '<circle cx="10.6" cy="10.6" r="6"/><path d="M15.1 15.1 20.4 20.4"/>' +
    '</symbol>',
    '<symbol id="i-locate" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="2.2"/>' +
      '<path d="M12 2.4v3.6M12 18v3.6M2.4 12H6M18 12h3.6"/>' +
    '</symbol>',
    '<symbol id="i-key" viewBox="0 0 24 24">' +
      '<circle cx="7.8" cy="16.2" r="3.6"/>' +
      '<path d="M10.4 13.6 20.4 3.6M17.4 2.6l4 4M14.8 5.2l4 4"/>' +
    '</symbol>',
    '<symbol id="i-route" viewBox="0 0 24 24">' +
      '<circle cx="5.8" cy="4.6" r="2.2"/>' +
      '<path d="M8 4.6h5.4a3.4 3.4 0 0 1 0 6.8H9.2a3.6 3.6 0 0 0 0 7.2h4.4"/>' +
      '<path d="M13.6 16.4l2.8 2.2-2.8 2.2"/>' +
    '</symbol>',

    /* 播放器：播放 / 暂停 / 上一首 / 下一首 / 随机 / 循环 / 音量 / 文件夹 / 视频 */
    '<symbol id="i-play" viewBox="0 0 24 24"><path d="M7.6 4.8 19 12l-11.4 7.2z"/></symbol>',
    '<symbol id="i-pause" viewBox="0 0 24 24"><path d="M8.8 5v14M15.2 5v14"/></symbol>',
    '<symbol id="i-prev" viewBox="0 0 24 24">' +
      '<path d="M18.6 5.4v13.2L9 12z"/><path d="M5.4 5.4v13.2"/>' +
    '</symbol>',
    '<symbol id="i-next" viewBox="0 0 24 24">' +
      '<path d="M5.4 5.4v13.2L15 12z"/><path d="M18.6 5.4v13.2"/>' +
    '</symbol>',
    '<symbol id="i-shuffle" viewBox="0 0 24 24">' +
      '<path d="M3.6 6.8h3.2l10 10.4h3.6M3.6 17.2h3.2l10-10.4h3.6"/>' +
      '<path d="M18.2 4.2 20.6 6.8 18.2 9.4M18.2 14.6 20.6 17.2 18.2 19.8"/>' +
    '</symbol>',
    '<symbol id="i-repeat" viewBox="0 0 24 24">' +
      '<path d="M4.6 12a7.4 7.4 0 0 1 7.4-7.4h4.4"/>' +
      '<path d="M14.4 2.6l2.9 2-2.9 2"/>' +
      '<path d="M19.4 12a7.4 7.4 0 0 1-7.4 7.4H7.6"/>' +
      '<path d="M9.6 21.4l-2.9-2 2.9-2"/>' +
    '</symbol>',
    '<symbol id="i-volume" viewBox="0 0 24 24">' +
      '<path d="M4.6 9.6h3.2l4-3.4v11.6l-4-3.4H4.6z"/>' +
      '<path d="M15 9.4a3.6 3.6 0 0 1 0 5.2M17.6 6.8a7.2 7.2 0 0 1 0 10.4"/>' +
    '</symbol>',
    '<symbol id="i-folder" viewBox="0 0 24 24">' +
      '<path d="M3.4 18.4V6.6a1.6 1.6 0 0 1 1.6-1.6h3.6l2.2 2.6h8.2a1.6 1.6 0 0 1 1.6 1.6v9.2' +
        'a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6z"/>' +
    '</symbol>',
    '<symbol id="i-film" viewBox="0 0 24 24">' +
      '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2"/>' +
      '<path d="M8.4 4.6v14.8M15.6 4.6v14.8M3.4 9.4h17.2M3.4 14.6h17.2"/>' +
    '</symbol>',

    /* 设置页：BMS / 保护板 / 连接 / 读取 / 坐垫 / 边撑 / 版权 / 清空 */
    '<symbol id="i-bms" viewBox="0 0 24 24">' +
      '<rect x="2.6" y="7.4" width="16.4" height="9.2" rx="2"/>' +
      '<path d="M21.4 10.4v3.2M6.6 10.6v2.8M10.6 10.6v2.8M14.6 10.6v2.8"/>' +
    '</symbol>',
    '<symbol id="i-shield" viewBox="0 0 24 24">' +
      '<path d="M12 3.2 19.6 6v6.2c0 4.2-2.9 7.4-7.6 8.6-4.7-1.2-7.6-4.4-7.6-8.6V6z"/>' +
      '<path d="M9 12.2l2.2 2.2 4-4.2"/>' +
    '</symbol>',
    '<symbol id="i-link" viewBox="0 0 24 24">' +
      '<path d="M10 13.8a3.6 3.6 0 0 1 0-5.1l2.6-2.6a3.6 3.6 0 0 1 5.1 5.1l-1.3 1.3"/>' +
      '<path d="M14 10.2a3.6 3.6 0 0 1 0 5.1l-2.6 2.6a3.6 3.6 0 0 1-5.1-5.1l1.3-1.3"/>' +
    '</symbol>',
    '<symbol id="i-refresh" viewBox="0 0 24 24">' +
      '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20.4 4v4.4h-4.4"/>' +
    '</symbol>',
    '<symbol id="i-seat" viewBox="0 0 24 24">' +
      '<path d="M4 15.6h16"/>' +
      '<path d="M6.4 15.6v3.2a1.4 1.4 0 0 0 1.4 1.4h8.4a1.4 1.4 0 0 0 1.4-1.4v-3.2"/>' +
      '<path d="M7.6 12.8c2.8-1.6 6.4-1.8 9-.5"/>' +
      '<path d="M18.2 3.4v4.4M16 5.6h4.4"/>' +
    '</symbol>',
    '<symbol id="i-kickstand" viewBox="0 0 24 24">' +
      '<path d="M15.6 4.4 7.6 15.2l3.4 5"/>' +
      '<path d="M4.4 20.4h15.2M12.6 4.4h7"/>' +
    '</symbol>',
    '<symbol id="i-info" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2M12 7.8v.1"/>' +
    '</symbol>',
    '<symbol id="i-trash" viewBox="0 0 24 24">' +
      '<path d="M4.6 7.4h14.8M9.4 7.4V5.2a1.4 1.4 0 0 1 1.4-1.4h2.4a1.4 1.4 0 0 1 1.4 1.4v2.2"/>' +
      '<path d="M6.6 7.4l1 12a1.6 1.6 0 0 0 1.6 1.5h5.6a1.6 1.6 0 0 0 1.6-1.5l1-12"/>' +
      '<path d="M10.4 11v6M13.6 11v6"/>' +
    '</symbol>'
  ];

/* 精灵图 HTML（App.vue 用 v-html 注入一次） */
export function spriteMarkup() {
  return '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'style="position:absolute;width:0;height:0;overflow:hidden">' +
    SYMBOLS.join('') + '</svg>';
}

export { SYMBOLS };
