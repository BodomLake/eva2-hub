/*!
 * nav.js — 导航数据层（i-nav）
 * ==================================================================
 * 三家地图供应商（高德 / 百度 / 腾讯）× 四种出行模式（汽车 / 公交 / 骑行 / 步行）
 * 统一成同一个形状，界面只认这一套：
 *
 *   { kind: 'api' | 'approx', provider, mode, distance(m), duration(s),
 *     steps: [{ text, distance(m), duration(s) }], raw }
 *
 * 三件事说清楚：
 *   ① key 从哪来：优先「浏览器里填过的」（core/settings.js → localStorage），
 *      没填就用 config.apps.nav.keys 的默认值；三家都允许留空。
 *   ② 传输：默认 fetch（CORS）→ 失败自动退 JSONP（百度 / 腾讯的 WebService 支持
 *      callback）；也可以设 transport='jsonp' 直接走 JSONP，或填 proxy 走自己的转发。
 *      ⚠ 高德 WebService 支持跨域直连；百度 / 腾讯多数端点要 JSONP 或代理。
 *      这条不测也能跑界面 —— 被拦下来时界面会**明确报出原因**，并给直线估算兜底。
 *   ③ 没 key / 被拦 / 解析不了 → approxRoute()（直线 × 道路系数 + 方位词），
 *      界面会标成「直线估算」，绝不假装是真实路线。
 *
 * 纯逻辑（除了 fetch / JSONP 两个函数），Node 里能 import 做单测。
 */
import { CONFIG as C } from '../config.js';

/* ============================ 供应商 ============================ */
export const PROVIDERS = [
  {
    id: 'amap', name: '高德地图', short: '高德', en: 'AMAP',
    host: 'https://restapi.amap.com',
    keyLabel: 'Web 服务 key', keyHint: '高德开放平台 → 应用管理 → Web 服务',
    reg: 'https://lbs.amap.com/dev/key/app',
    coords: 'lng,lat',             // 高德 / 腾讯：经度在前
    jsonp: false,                  // 支持 CORS 直连
    note: 'restapi.amap.com 支持跨域，浏览器可直接请求'
  },
  {
    id: 'baidu', name: '百度地图', short: '百度', en: 'BAIDU',
    host: 'https://api.map.baidu.com',
    keyLabel: '浏览器端 AK', keyHint: '百度地图开放平台 → 控制台 → 应用 AK（浏览器端 / Web 服务）',
    reg: 'https://lbsyun.baidu.com/apiconsole/key',
    coords: 'lat,lng',             // 百度：纬度在前
    jsonp: true,
    note: '多数端点不给 CORS 头 → 走 JSONP（callback=），或填 proxy 转发'
  },
  {
    id: 'tencent', name: '腾讯地图', short: '腾讯', en: 'TENCENT',
    host: 'https://apis.map.qq.com',
    keyLabel: 'WebService key', keyHint: '腾讯位置服务 → 控制台 → key 管理（勾选 WebService API）',
    reg: 'https://lbs.qq.com/dev/console/application/mine',
    coords: 'lat,lng',
    jsonp: true,
    note: '支持 JSONP；直连需要服务端转发或域名白名单'
  }
];

/* ============================ 出行模式 ============================ */
/*   ride = 骑行（电动车 / 自行车）—— **默认优先**（config.apps.nav / 设置里默认 mode: 'ride'）
 *   speed km/h 只用于「直线估算」的耗时；factor = 实际路程 / 直线距离的经验系数 */
export const MODES = [
  { id: 'car',  name: '汽车', en: 'DRIVE',   icon: 'i-car',  speed: 28, factor: 1.28 },
  { id: 'bus',  name: '公交', en: 'TRANSIT', icon: 'i-bus',  speed: 18, factor: 1.34 },
  { id: 'ride', name: '骑行', en: 'RIDE',    icon: 'i-bike', speed: 16, factor: 1.16, prefer: true },
  { id: 'walk', name: '步行', en: 'WALK',    icon: 'i-walk', speed: 4.6, factor: 1.06 }
];

export function providerOf(id) {
  return PROVIDERS.filter(function (p) { return p.id === id; })[0] || PROVIDERS[0];
}
export function modeOf(id) {
  return MODES.filter(function (m) { return m.id === id; })[0] || MODES[2];
}
/* key 取值：界面填的优先，其次 config 默认值 */
export function keyOf(keys, providerId) {
  const k = (keys || {})[providerId];
  if (k) return String(k).trim();
  return String((C.apps.nav.keys || {})[providerId] || '').trim();
}

/* ============================ URL 构造 ============================ */
/* p = { lng, lat } → 供应商要求的坐标串 */
export function coordsOf(p, provider) {
  const lng = Number(p.lng), lat = Number(p.lat);
  return providerOf(provider).coords === 'lat,lng' ? (lat + ',' + lng) : (lng + ',' + lat);
}

/*
 * 造 URL。kind:
 *   'route'   路线规划（mode = car | bus | ride | walk）
 *   'place'   关键字搜地点（keyword + city）
 *   'regeo'   逆地理（坐标 → 地址）
 *   'geocode' 地址 → 坐标（address）
 */
export function buildUrl(kind, o) {
  o = o || {};
  const P = providerOf(o.provider);
  const key = keyOf(o.keys, P.id);
  const mode = o.mode || 'ride';
  const from = o.from || C.apps.nav.origin;
  const to = o.to || C.apps.nav.dest;
  const city = o.city || C.apps.nav.city;

  if (kind === 'route') {
    const a = coordsOf(from, P.id), b = coordsOf(to, P.id);
    if (P.id === 'amap') {
      if (mode === 'car') return P.host + '/v3/direction/driving?origin=' + a + '&destination=' + b +
        '&extensions=all&strategy=0&key=' + key;
      if (mode === 'bus') return P.host + '/v3/direction/transit/integrated?origin=' + a + '&destination=' + b +
        '&city=' + encodeURIComponent(city) + '&cityd=' + encodeURIComponent(city) + '&strategy=0&key=' + key;
      if (mode === 'ride') return P.host + '/v4/direction/bicycling?origin=' + a + '&destination=' + b +
        '&key=' + key;                                    /* 骑行只有 v4 端点 */
      return P.host + '/v3/direction/walking?origin=' + a + '&destination=' + b + '&key=' + key;
    }
    if (P.id === 'baidu') {
      const path = { car: 'driving', bus: 'transit', ride: 'riding', walk: 'walking' }[mode] || 'riding';
      return P.host + '/directionlite/v1/' + path + '?origin=' + a + '&destination=' + b +
        '&ak=' + key + '&output=json';
    }
    const path2 = { car: 'driving', bus: 'transit', ride: 'bicycling', walk: 'walking' }[mode] || 'bicycling';
    return P.host + '/ws/direction/v1/' + path2 + '/?from=' + a + '&to=' + b + '&key=' + key + '&output=json';
  }

  if (kind === 'place') {
    const kw = encodeURIComponent(o.keyword || '');
    if (P.id === 'amap') {
      return P.host + '/v3/place/text?key=' + key + '&keywords=' + kw +
        '&city=' + encodeURIComponent(city) + '&citylimit=true&offset=10&page=1&extensions=base';
    }
    if (P.id === 'baidu') {
      return P.host + '/place/v2/search?query=' + kw + '&region=' + encodeURIComponent(city) +
        '&output=json&ak=' + key + '&page_size=10&scope=2';
    }
    return P.host + '/ws/place/v1/search?keyword=' + kw +
      '&boundary=' + encodeURIComponent('region(' + city + ',0)') + '&page_size=10&key=' + key + '&output=json';
  }

  if (kind === 'regeo') {
    const c = coordsOf(o.at || from, P.id);
    if (P.id === 'amap') return P.host + '/v3/geocode/regeo?key=' + key + '&location=' + c + '&extensions=base';
    if (P.id === 'baidu') return P.host + '/reverse_geocoding/v3/?location=' + c + '&output=json&ak=' + key;
    return P.host + '/ws/geocoder/v1/?location=' + c + '&key=' + key + '&output=json';
  }

  /* geocode：地址 → 坐标 */
  const addr = encodeURIComponent(o.address || '');
  if (P.id === 'amap') return P.host + '/v3/geocode/geo?key=' + key + '&address=' + addr + '&city=' + encodeURIComponent(city);
  if (P.id === 'baidu') return P.host + '/geocoding/v3/?address=' + addr + '&city=' + encodeURIComponent(city) + '&output=json&ak=' + key;
  return P.host + '/ws/geocoder/v1/?address=' + addr + '&key=' + key + '&output=json';
}

/* 打码显示（设置页 / 导航页上都只露头尾） */
export function maskKey(k) {
  const s = String(k || '');
  if (!s) return '未填';
  if (s.length <= 10) return s.slice(0, 3) + '***';
  return s.slice(0, 6) + '***' + s.slice(-4);
}

/* ============================ 传输 ============================ */
/* 代理模板：proxy = 'http://127.0.0.1:8787/?url={url}'（没有 {url} 就当它是前缀） */
export function withProxy(url, proxy) {
  const p = proxy && String(proxy).trim();
  if (!p) return url;
  return p.indexOf('{url}') >= 0 ? p.replace('{url}', encodeURIComponent(url)) : (p + encodeURIComponent(url));
}

async function fetchJson(url) {
  if (typeof fetch === 'undefined') throw new Error('当前环境没有 fetch');
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

let cbSeq = 0;

/* JSONP（百度 / 腾讯的 WebService 都认 callback=；高德不需要） */
export function jsonp(url, timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (typeof document === 'undefined') { reject(new Error('JSONP 需要浏览器环境')); return; }
    const cb = '__eva2nav' + (++cbSeq) + '_' + Date.now().toString(36);
    const s = document.createElement('script');
    let done = false;
    function clean() {
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    const timer = window.setTimeout(function () {
      if (done) return;
      done = true; clean(); reject(new Error('JSONP 超时（10s）'));
    }, timeoutMs || 10000);
    window[cb] = function (data) {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      clean();
      resolve(data);
    };
    s.onerror = function () {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      clean();
      reject(new Error('JSONP 脚本加载失败'));
    };
    s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
  });
}

/* 把底层错误翻成人话（界面上直接显示这一句） */
export function explain(e) {
  const msg = String((e && e.message) || e || '');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return '请求被浏览器拦下（CORS / 网络不可达）· 可改用 JSONP 传输或填代理地址';
  }
  if (/HTTP 4\d\d/.test(msg)) return '接口拒绝：' + msg + '（key 没权限 / 额度用完 / 端点写错）';
  return msg || '未知错误';
}

/* 统一出口：proxy → transport（auto = fetch 失败退 JSONP） */
export async function call(url, o) {
  o = o || {};
  const navCfg = C.apps.nav;
  const transport = o.transport || navCfg.transport || 'auto';
  const target = withProxy(url, o.proxy === undefined ? navCfg.proxy : o.proxy);
  if (transport === 'jsonp') return jsonp(target);
  try {
    return await fetchJson(target);
  } catch (e) {
    if (transport === 'fetch' || (o.proxy === undefined ? navCfg.proxy : o.proxy)) throw new Error(explain(e));
    try {
      return await jsonp(target);
    } catch (e2) {
      throw new Error(explain(e) + ' · JSONP 也不行：' + explain(e2));
    }
  }
}

/* ============================ 结果归一化 ============================ */
/* 供应商自己的错误码 → 统一判 ok */
export function verify(provider, data) {
  const P = providerOf(provider);
  if (!data || typeof data !== 'object') return { ok: false, err: '返回为空' };
  if (P.id === 'amap') {
    if (data.status === '1') return { ok: true };
    return { ok: false, err: data.info || ('errcode ' + data.errcode) };
  }
  if (Number(data.status) === 0) return { ok: true };          /* 百度 / 腾讯：status === 0 */
  return { ok: false, err: data.message || data.msg || ('status ' + data.status) };
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/* 把一家的路线 JSON 摊平成 steps。认不出来返回 null（调用方转直线估算） */
export function normalizeRoute(provider, mode, data) {
  const P = providerOf(provider);
  function pick(path) {
    let cur = data;
    for (let i = 0; i < path.length; i++) {
      if (cur == null) return null;
      cur = cur[path[i]];
    }
    return cur;
  }
  let steps = null, distance = 0, duration = 0;

  try {
    if (P.id === 'amap') {
      /* v4 骑行在 data.paths，驾车 / 步行在 route.paths，公交在 route.transits */
      const paths = pick(['route', 'paths']) || pick(['data', 'paths']);
      const via = pick(['route', 'transits']);
      const p0 = paths && paths[0];
      if (p0) {
        distance = num(p0.distance);
        duration = num(p0.duration);
        if (p0.steps && p0.steps.length) {
          steps = p0.steps.map(function (s) {
            return {
              text: s.instruction || s.road || '继续行驶',
              distance: num(s.distance),
              duration: num(s.duration)
            };
          });
        } else if (p0.segments && p0.segments.length) {
          steps = amapTransitSteps(p0.segments);
        }
      } else if (via && via[0]) {
        distance = num(via[0].distance);
        duration = num(via[0].duration);
        steps = amapTransitSteps(via[0].segments || []);
      }
    } else if (P.id === 'baidu') {
      const r0 = pick(['result', 'routes', 0]) || pick(['routes', 0]);
      if (r0) {
        distance = num(r0.distance);
        duration = num(r0.duration);
        if (r0.steps && r0.steps.length) {
          steps = r0.steps.map(function (s) {
            const vi = s.vehicle_info;
            return {
              text: (s.instruction || '继续行驶') + (vi ? '（' + (vi.name || vi.type || '乘车') + '）' : ''),
              distance: num(s.distance),
              duration: num(s.duration)
            };
          });
        }
      }
    } else {
      const r0 = pick(['result', 'routes', 0]);
      if (r0) {
        distance = num(r0.distance);
        duration = num(r0.duration) * 60;              /* 腾讯 duration 单位是分钟 */
        if (r0.steps && r0.steps.length) {
          steps = r0.steps.map(function (s) {
            return {
              text: s.instruction || (s.road_name ? '沿 ' + s.road_name + ' 行驶' : '继续行驶'),
              distance: num(s.distance),
              duration: num(s.duration) * 60
            };
          });
        }
      }
    }
  } catch (e) {
    return null;
  }

  if (!steps || !steps.length || !(distance > 0)) return null;
  return {
    kind: 'api', provider: P.id, mode: mode,
    distance: distance, duration: duration, steps: steps
  };
}

/* 高德公交：segments[].walking / .bus.buslines[0] / .railway / .taxi */
function amapTransitSteps(segments) {
  const steps = [];
  (segments || []).forEach(function (seg) {
    if (seg.walking && num(seg.walking.distance)) {
      steps.push({
        text: '步行 ' + Math.round(num(seg.walking.distance)) + ' 米',
        distance: num(seg.walking.distance), duration: num(seg.walking.duration)
      });
    }
    const bl = seg.bus && seg.bus.buslines && seg.bus.buslines[0];
    if (bl) {
      steps.push({
        text: (bl.name || '公交') + '：' +
          ((bl.departure_stop && bl.departure_stop.name) || '上车') + ' → ' +
          ((bl.arrival_stop && bl.arrival_stop.name) || '下车') +
          '（' + num(bl.via_num) + ' 站）',
        distance: num(seg.bus.distance), duration: num(seg.bus.duration)
      });
    }
    if (seg.railway && seg.railway.name) {
      steps.push({
        text: seg.railway.name + ' 乘车',
        distance: num(seg.railway.distance), duration: num(seg.railway.time)
      });
    }
    if (seg.taxi && num(seg.taxi.distance)) {
      steps.push({
        text: '打车 ' + Math.round(num(seg.taxi.distance)) + ' 米',
        distance: num(seg.taxi.distance), duration: num(seg.taxi.duration)
      });
    }
  });
  return steps.length ? steps : null;
}

/* 地名搜索 → [{ name, address, lng, lat }] */
export function normalizePlace(provider, data) {
  const P = providerOf(provider);
  const out = [];
  try {
    if (P.id === 'amap') {
      (data.pois || []).forEach(function (p) {
        const xy = String(p.location || '').split(',');
        out.push({ name: p.name, address: p.address || p.type || '', lng: num(xy[0]), lat: num(xy[1]) });
      });
    } else if (P.id === 'baidu') {
      (data.results || []).forEach(function (p) {
        const loc = p.location || {};
        out.push({ name: p.name, address: (p.area || '') + (p.address || ''), lng: num(loc.lng), lat: num(loc.lat) });
      });
    } else {
      (data.data || []).forEach(function (p) {
        const loc = p.location || {};
        out.push({ name: p.title, address: p.address || '', lng: num(loc.lng), lat: num(loc.lat) });
      });
    }
  } catch (e) {
    return [];
  }
  return out.filter(function (p) { return p.lng && p.lat; });
}

/* ============================ 几何 / 格式化 ============================ */
export function haversineKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/* 方位词（导航指引里说「朝东北行驶」） */
export function bearingText(deg) {
  const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/* 没 key / 被 CORS 拦 / 解析不了时的兜底：直线 × 道路系数 + 方位拆分步骤 */
export function approxRoute(from, to, mode) {
  const M = modeOf(mode);
  const km = Math.max(0.2, haversineKm(from, to) * M.factor);
  const mins = Math.max(1, km / M.speed * 60);
  const dirTxt = bearingText(bearing(from, to));
  const legs = [0.34, 0.44, 0.14, 0.08];
  const texts = [
    '由 ' + (from.name || '起点') + ' 出发，朝' + dirTxt + '方向',
    '沿主路继续' + dirTxt + '行驶，经过 3 个路口',
    '接近目的地，右转进入辅路',
    '到达 ' + (to.name || '终点')
  ];
  return {
    kind: 'approx',
    provider: 'straight',
    mode: M.id,
    distance: Math.round(km * 1000),
    duration: Math.round(mins * 60),
    steps: texts.map(function (t, i) {
      return {
        text: t,
        distance: Math.round(km * 1000 * legs[i]),
        duration: Math.round(mins * 60 * legs[i])
      };
    })
  };
}

export function formatDistance(m) {
  const v = Number(m) || 0;
  if (v < 1000) return Math.round(v) + ' m';
  return (v / 1000).toFixed(v < 10000 ? 2 : 1) + ' km';
}

export function formatDuration(s) {
  const v = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(v / 3600);
  const m = Math.round((v % 3600) / 60);
  if (h > 0) return h + ' 小时 ' + m + ' 分';
  return Math.max(1, m) + ' 分';
}

/* 浏览器定位（车机上就是车机自己的 GNSS；被拒绝时抛人话错误） */
export function geolocate(timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (p) {
        resolve({ lng: p.coords.longitude, lat: p.coords.latitude, acc: Math.round(p.coords.accuracy || 0) });
      },
      function (e) {
        reject(new Error('定位失败：' + ((e && e.message) || '被拒绝或超时')));
      },
      { enableHighAccuracy: true, timeout: timeoutMs || 8000, maximumAge: 30000 }
    );
  });
}

/* 一步到位：某一家的某一种出行方式规划路线（失败时抛错，交给界面决定要不要兜底） */
export async function planRoute(o) {
  o = o || {};
  const data = await call(buildUrl('route', o), o);
  const v = verify(o.provider, data);
  if (!v.ok) {
    const err = new Error('接口返回失败：' + v.err);
    err.raw = data;
    throw err;
  }
  const route = normalizeRoute(o.provider, o.mode || 'ride', data);
  if (!route) {
    const err = new Error('返回结构不认识（端点 / key 权限可能不对）');
    err.raw = data;
    throw err;
  }
  return route;
}

/* 关键字搜地点 */
export async function searchPlace(o) {
  const data = await call(buildUrl('place', o), o);
  const v = verify(o.provider, data);
  if (!v.ok) throw new Error('搜索失败：' + v.err);
  return normalizePlace(o.provider, data);
}
