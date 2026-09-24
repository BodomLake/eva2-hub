/*!
 * emblem.js — 中央六边形外框 + 机甲徽记（原创几何造型）
 * ------------------------------------------------------------------
 * 徽记是「EVA-02 配色 + 机甲头盔」的原创几何再设计，不包含任何
 * 官方美术素材。想换成自己的图片：把 build() 的返回值换成
 * 一个 <image href="assets/core.png" .../> 即可（保持 300×300 画布）。
 */

  /* 生成平顶（flat-top）六边形顶点：上/下两条边水平，左右两个尖角在中线 */
  function hexPoints(cx, cy, r) {
    var w = r;                         // 半宽
    var h = r * 0.936;                 // 半高（与 .core 的 470×440 同比）
    return [
      [cx - w, cy], [cx - w / 2, cy - h], [cx + w / 2, cy - h],
      [cx + w, cy], [cx + w / 2, cy + h], [cx - w / 2, cy + h]
    ];
  }
  function poly(pts) {
    return pts.map(function (p) {
      return p[0].toFixed(1) + ',' + p[1].toFixed(1);
    }).join(' ');
  }

  /* ---------------------------------------------------------------
   * 六边形外框（绘制到 CoreHex.vue 的 <svg class="core__frame">，viewBox 0 0 470 440）
   * 平顶六边形：上/下两条边平行于屏幕横向，左右两个顶点落在中线高度上。
   * 说明：顶点百分比与 CoreHex.vue 里 .core__hex 的 clip-path 一一对应，
   *       改一个必须改另一个。
   * ------------------------------------------------------------- */
  function buildFrame() {
    var W = 470, H = 440, M = 6;
    var CX = W / 2, CY = H / 2;
    var pts = [[M, CY], [W * 0.25, M], [W * 0.75, M],
               [W - M, CY], [W * 0.75, H - M], [W * 0.25, H - M]];
    var outer = poly(pts);
    var inner = poly(pts.map(function (p) {
      return [CX + (p[0] - CX) * 0.945, CY + (p[1] - CY) * 0.945];
    }));

    var s = '<defs>';
    s += '<linearGradient id="coreStroke" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#ff8a3d"/>' +
         '<stop offset="45%" stop-color="#e2001a"/>' +
         '<stop offset="100%" stop-color="#ff5a2a"/></linearGradient>';
    s += '<linearGradient id="coreFin" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#ff9a3d"/>' +
         '<stop offset="100%" stop-color="#7d0a12"/></linearGradient>';
    s += '<linearGradient id="coreFill" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="rgba(70,10,18,.55)"/>' +
         '<stop offset="100%" stop-color="rgba(6,2,4,.85)"/></linearGradient>';
    s += '</defs>';

    /* 外发光 + 内部渐变 + 内外双描边 */
    s += '<polygon class="cf-outer" points="' + outer + '" opacity=".3" ' +
         'transform="translate(' + CX + ' ' + CY + ') scale(1.03) translate(' + (-CX) + ' ' + (-CY) + ')"/>';
    s += '<polygon class="cf-fill" points="' + outer + '"/>';
    s += '<polygon class="cf-outer" points="' + outer + '"/>';
    s += '<polygon class="cf-inner" points="' + inner + '"/>';

    /* 六个顶点朝内的短刻度（左右两个尖角用白色高亮） */
    for (var i = 0; i < 6; i++) {
      var p = pts[i];
      var vx = p[0] - CX, vy = p[1] - CY;
      var len = Math.sqrt(vx * vx + vy * vy);
      var ux = vx / len, uy = vy / len;
      var w = (i === 0 || i === 3) ? '' : ' cf-tick--w';
      s += '<line class="cf-tick' + w + '" ' +
           'x1="' + (p[0] - ux * 22).toFixed(1) + '" y1="' + (p[1] - uy * 22).toFixed(1) +
           '" x2="' + (p[0] - ux * 27).toFixed(1) + '" y2="' + (p[1] - uy * 27).toFixed(1) + '"/>';
    }

    /* 左右尖角内侧的小翼片（平顶六边形的两个尖角） */
    s += '<path class="cf-fin" d="M' + (W - M) + ' ' + CY + ' L' + (W - M - 30) + ' ' + (CY - 19) +
         ' L' + (W - M - 30) + ' ' + (CY + 19) + ' Z"/>';
    s += '<path class="cf-fin" d="M' + M + ' ' + CY + ' L' + (M + 30) + ' ' + (CY - 19) +
         ' L' + (M + 30) + ' ' + (CY + 19) + ' Z"/>';

    /* 顶部尖刺 + 底部倒角 */
    s += '<path class="cf-chev" d="M' + (CX - 14) + ' 3 L' + CX + ' -15 L' + (CX + 14) + ' 3"/>';
    s += '<path class="cf-chev" d="M' + (CX - 14) + ' ' + (H - 3) + ' L' + CX + ' ' + (H + 15) +
         ' L' + (CX + 14) + ' ' + (H - 3) + '"/>';

    return s;
  }
  /* ---------------------------------------------------------------
   * 机甲徽记（300×300；只画左半再镜像，保证绝对对称）
   * 数组格式: [标签, d, fill, stroke, strokeWidth, className]
   * ------------------------------------------------------------- */
  var HALF = [
    /* 肩甲 */
    ['path', 'M150 188 L104 200 L76 228 L74 272 L150 284 Z', 'url(#emRed)', '#3d050a', 2],
    /* 肩甲橙色饰条 */
    ['path', 'M150 194 L110 205 L90 228 L90 238 L150 214 Z', 'url(#emOrange)', 'none', 0],
    /* 头盔主体 */
    ['path', 'M150 40 L106 52 L80 84 L76 126 L94 164 L122 180 L150 186 Z', 'url(#emRed)', '#330409', 2.2],
    /* 额头高光板 */
    ['path', 'M150 48 L114 58 L98 84 L150 76 Z', 'url(#emOrange)', 'none', 0],
    /* 面罩暗带（眼窝底） */
    ['path', 'M78 100 L150 88 L150 122 L84 136 Z', '#2a0703', '#ff6a3d', 1.2],
    /* 眼罩：宽距斜切，刻意放在 P 字两侧露出 */
    ['path', 'M84 104 L138 96 L138 116 L90 126 Z', 'url(#emEye)', '#d9ffd0', 1.2, 'em-eye'],
    /* 侧鳍 */
    ['path', 'M78 82 L38 84 L28 108 L70 132 Z', 'url(#emOrange)', '#4d1005', 2],
    ['path', 'M74 88 L46 90 L40 106 L68 120 Z', '#2a0703', 'none', 0],
    /* 下颌 */
    ['path', 'M150 186 L118 178 L100 200 L126 216 L150 220 Z', '#4a0a10', '#ff6a3d', 1.4],
    /* 下颌格栅 */
    ['path', 'M124 192 L124 208', 'none', '#ff9a6a', 2],
    ['path', 'M138 196 L138 212', 'none', '#ff9a6a', 2]
  ];

  function halfMarkup() {
    return HALF.map(function (d) {
      var a = 'd="' + d[1] + '"';
      a += ' fill="' + (d[2] || 'none') + '"';
      if (d[3] && d[3] !== 'none') {
        a += ' stroke="' + d[3] + '" stroke-width="' + d[4] + '" stroke-linejoin="round"';
      }
      if (d[5]) a += ' class="' + d[5] + '"';
      return '<path ' + a + '/>';
    }).join('');
  }

  function buildEmblem() {
    var s = '<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">';

    s += '<defs>';
    s += '<linearGradient id="emRed" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#ff5b45"/><stop offset="52%" stop-color="#d8121f"/>' +
         '<stop offset="100%" stop-color="#7d0a12"/></linearGradient>';
    s += '<linearGradient id="emOrange" x1="0" y1="0" x2="0" y2="1">' +
         '<stop offset="0%" stop-color="#ffd9a0"/><stop offset="55%" stop-color="#ff8a2a"/>' +
         '<stop offset="100%" stop-color="#c24a06"/></linearGradient>';
    s += '<linearGradient id="emEye" x1="0" y1="0" x2="1" y2="0">' +
         '<stop offset="0%" stop-color="#f2ffd9"/><stop offset="60%" stop-color="#4ef08a"/>' +
         '<stop offset="100%" stop-color="#16a04e"/></linearGradient>';
    s += '<radialGradient id="emCore" cx="50%" cy="45%" r="60%">' +
         '<stop offset="0%" stop-color="#ffffff"/><stop offset="45%" stop-color="#e879f9"/>' +
         '<stop offset="100%" stop-color="#7e22ce"/></radialGradient>';
    s += '<filter id="emGlow" x="-60%" y="-60%" width="220%" height="220%">' +
         '<feGaussianBlur stdDeviation="5" result="b"/>' +
         '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    s += '</defs>';

    /* --- 背景：同心六边形 + 放射刻度 --- */
    var back = '';
    var rings = [[132, .30], [112, .22], [92, .16]];
    for (var k = 0; k < rings.length; k++) {
      back += '<polygon points="' + poly(hexPoints(150, 152, rings[k][0])) +
              '" fill="none" stroke="rgba(255,90,42,' + rings[k][1] + ')" stroke-width="1.4"/>';
    }
    for (var i = 0; i < 12; i++) {
      var a = Math.PI / 180 * (30 * i - 90);
      var r1 = 118, r2 = i % 3 === 0 ? 126 : 122;
      back += '<line x1="' + (150 + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (152 + r1 * Math.sin(a)).toFixed(1) +
              '" x2="' + (150 + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (152 + r2 * Math.sin(a)).toFixed(1) +
              '" stroke="rgba(255,150,60,.42)" stroke-width="' + (i % 3 === 0 ? 2 : 1.2) + '"/>';
    }
    s += '<g opacity=".85">' + back + '</g>';

    /* --- 机甲本体：左半 + 镜像 --- */
    var body = halfMarkup();
    s += '<g>' + body + '</g>';
    s += '<g transform="translate(300,0) scale(-1,1)">' + body + '</g>';

    /* --- 中轴线部件（不可镜像的部分） --- */
    s += '<path d="M150 40 L138 47 L136 104 L150 96 Z" fill="url(#emOrange)" opacity=".95"/>';
    s += '<path d="M144 14 L156 14 L153 44 L147 44 Z" fill="url(#emOrange)" stroke="#55170a" stroke-width="1.4"/>';
    s += '<path d="M145 6 L155 6 L154 17 L146 17 Z" fill="#d946ef"/>';
    s += '<path d="M150 40 L150 186" stroke="rgba(255,150,90,.45)" stroke-width="1.2"/>';

    /* 胸口能量核 */
    s += '<polygon points="' + poly(hexPoints(150, 246, 13)) +
         '" fill="url(#emCore)" stroke="#f0abfc" stroke-width="1.6" filter="url(#emGlow)"/>';
    s += '<polygon points="' + poly(hexPoints(150, 246, 5.5)) + '" fill="#fff" opacity=".9"/>';

    s += '</svg>';
    return s;
  }


export { buildFrame, buildEmblem as build };
