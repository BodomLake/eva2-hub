/*!
 * messages.js — 消息中心（i-msg）的数据层
 * ------------------------------------------------------------------
 * 收集**整个系统**的提示，一条管道进、一处去重、一处算未读：
 *   · 胎压胎温异常   → pushTire()    （core/tire.js 裁决出来后自动进）
 *   · 天气骤变预警   → pushAlert()   （远程服务器推送：WebSocket / HTTP 都行）
 *   · 历史故障码     → seedFaults()  （上电时把 config.apps.faults.history 灌进来）
 *   · 系统 / 提示类  → push({ kind:'system' | 'info' })
 *
 * 纯逻辑、零 Vue / 零 DOM：用 subscribe() 通知渲染层（useHud.js 里转成 reactive）。
 * 去重规则：同一个 key（kind+code）在 dedupeMs 内再来一次 = 同一条消息，
 * 只把时间戳刷新、次数 +1、重新标成未读 —— 免得「胎压报警」每帧刷一条。
 */

export const KINDS = ['tire', 'weather', 'fault', 'system', 'info'];

/* 相对时间：'刚刚' / '3 分钟前' / '2 小时前' / '3 天前' */
export function agoText(ts, now) {
  const d = Math.max(0, (now || Date.now()) - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}

/* 时钟：14:07 */
export function clockText(ts) {
  const d = new Date(ts);
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getHours()) + ':' + p(d.getMinutes());
}

export function createMessages(opts) {
  opts = opts || {};
  const items = [];                 // 最新在前
  const subs = [];
  const max = opts.max || 200;
  const dedupeMs = opts.dedupeMs == null ? 30000 : opts.dedupeMs;
  let seq = 0;

  function notify() {
    for (let i = 0; i < subs.length; i++) {
      try { subs[i](items); } catch (e) { /* 订阅者出错不影响数据层 */ }
    }
  }

  /* 一条消息：{ kind, level, code, title, text, from, at, key, read } */
  function push(m) {
    if (!m || !m.title) return null;
    const now = m.at || Date.now();
    const key = m.key || ((m.kind || 'info') + ':' + (m.code || m.title));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.key === key && now - it.at < dedupeMs) {
        it.at = now;
        it.count += 1;
        it.read = false;
        if (m.text) it.text = m.text;
        if (m.level) it.level = m.level;
        items.splice(i, 1);
        items.unshift(it);          // 最近发生的排到最前（不再要求时间戳倒序）
        notify();
        return it;
      }
    }
    const it = {
      id: ++seq,
      key: key,
      kind: KINDS.indexOf(m.kind) >= 0 ? m.kind : 'info',
      level: m.level || 'info',     // red / amber / info
      code: m.code || '',
      title: m.title,
      text: m.text || '',
      from: m.from || '',
      at: now,
      read: !!m.read,
      count: 1
    };
    items.unshift(it);
    if (items.length > max) items.length = max;
    notify();
    return it;
  }

  function pushAlert(a) { return push(a); }

  function pushTire(alerts) {
    const out = [];
    (alerts || []).forEach(function (a) {
      out.push(push({
        kind: 'tire',
        level: a.level,
        code: a.id,
        title: C_TIRE_TITLE[a.id] || '胎压胎温异常',
        text: a.text,
        from: '胎压监测'
      }));
    });
    return out;
  }

  function pushFault(f) { return push(Object.assign({ kind: 'fault', from: '整车自检' }, f)); }

  /* 历史故障码：agoMin → 时间戳，默认标记已读（是「历史」，不该一上电就满屏未读） */
  function seedFaults(history, now) {
    const t0 = now || Date.now();
    (history || []).forEach(function (h) {
      push({
        kind: h.kind || 'fault',
        level: h.level || 'amber',
        code: h.code,
        title: h.title,
        text: h.text,
        from: h.from || '历史记录',
        at: t0 - (h.agoMin || 0) * 60000,
        read: h.read !== false,
        key: (h.kind || 'fault') + ':' + h.code
      });
    });
    /* 灌完按时间倒序排一次（历史记录时间戳是回溯的） */
    items.sort(function (a, b) { return b.at - a.at; });
    notify();
    return items.length;
  }

  function find(id) {
    for (let i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }

  function markRead(id, read) {
    const it = find(id);
    if (!it) return false;
    it.read = read === undefined ? true : !!read;
    notify();
    return true;
  }

  function markAllRead() {
    items.forEach(function (it) { it.read = true; });
    notify();
  }

  function remove(id) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === id) { items.splice(i, 1); notify(); return true; }
    }
    return false;
  }

  function clear() {
    items.length = 0;
    notify();
  }

  function unread() {
    let n = 0;
    for (let i = 0; i < items.length; i++) if (!items[i].read) n += 1;
    return n;
  }

  function subscribe(fn) {
    subs.push(fn);
    return function () {
      const i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  return {
    items: items,
    push: push,
    pushAlert: pushAlert,
    pushTire: pushTire,
    pushFault: pushFault,
    seedFaults: seedFaults,
    markRead: markRead,
    markAllRead: markAllRead,
    remove: remove,
    clear: clear,
    unread: unread,
    subscribe: subscribe
  };
}

/* 胎压告警 id → 消息标题（告警表里那条是通用文案，这里给个消息中心的短标题） */
const C_TIRE_TITLE = {
  TIRE_LEAK: '胎压低于下限',
  TIRE_OVER: '胎压高于上限',
  TIRE_HOT: '胎温过高',
  TIRE_WARM: '胎温偏高',
  TIRE_LOST: '胎压传感器离线'
};
