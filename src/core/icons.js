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
    '</symbol>'
  ];

/* 精灵图 HTML（App.vue 用 v-html 注入一次） */
export function spriteMarkup() {
  return '<svg xmlns="http://www.w3.org/2000/svg" ' +
    'style="position:absolute;width:0;height:0;overflow:hidden">' +
    SYMBOLS.join('') + '</svg>';
}

export { SYMBOLS };
