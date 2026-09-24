/*!
 * media.js — 本地媒体资源（i-music → 媒体播放器）
 * ==================================================================
 * 纯前端播放器要解决的三件事，全在这里：
 *
 *   ① 取资源：**File System Access API**
 *        window.showOpenFilePicker()  选文件（可多选）
 *        window.showDirectoryPicker() 选文件夹（递归扫，只收音视频）
 *      不可用的浏览器（Firefox / Safari / 老内核 / 非安全上下文）自动退回
 *      <input type="file"> —— 功能一样，只是不能「记住上次那个文件夹」。
 *   ② 只加载「浏览器真的能播的」：先按扩展名过白名单（config.apps.media），
 *      再问 canPlayType() —— 两道都过才进列表，其余算「跳过」并报数量。
 *      （.mkv / .avi / .wmv 这类浏览器基本不支持的格式故意不在白名单里。）
 *   ③ 记住上次的文件夹：FileSystemDirectoryHandle 可以塞进 IndexedDB，
 *      下次打开「恢复上次文件夹」一个按钮就能重建整个播放列表。
 *
 * Object URL 是**懒创建**的（播放前才 createObjectURL，切歌时 revoke），
 * 不然一次选 600 个文件会瞬间吃掉几百 MB 内存。
 */
import { CONFIG as C } from '../config.js';

function M() { return C.apps.media; }

/* ============================ 类型判定 ============================ */
/* 扩展名 → { kind, ext, mime }（白名单以外一律 null） */
export function kindOf(name, mime) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const A = M().audio, V = M().video;
  if (A[ext]) return { kind: 'audio', ext: ext, mime: mime || A[ext] };
  if (V[ext]) return { kind: 'video', ext: ext, mime: mime || V[ext] };
  return null;
}

/* 浏览器真的能解码吗（Node 里没有 document → 交给白名单决定） */
export function canPlay(mime, kind) {
  if (typeof document === 'undefined') return true;
  try {
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    if (!el.canPlayType) return true;
    return !!el.canPlayType(mime);
  } catch (e) {
    return true;
  }
}

/* 最终判定：info = { ok, kind, ext, mime, reason } */
export function playable(fileOrName, mime) {
  const name = typeof fileOrName === 'string' ? fileOrName : (fileOrName && fileOrName.name);
  const info = kindOf(name, mime || (fileOrName && fileOrName.type));
  if (!info) return { ok: false, kind: null, ext: '', mime: '', reason: '不是音视频格式' };
  if (!canPlay(info.mime, info.kind)) {
    return { ok: false, kind: info.kind, ext: info.ext, mime: info.mime, reason: '浏览器不支持 .' + info.ext };
  }
  return { ok: true, kind: info.kind, ext: info.ext, mime: info.mime, reason: '' };
}

/* 当前浏览器支持的扩展名清单（页面上直接列给用户看） */
export function supportedList() {
  const cfg = M();
  const out = { audio: [], video: [] };
  ['audio', 'video'].forEach(function (k) {
    Object.keys(cfg[k]).forEach(function (ext) {
      if (canPlay(cfg[k][ext], k)) out[k].push(ext);
    });
  });
  return out;
}

/* 有没有 File System Access API（媒体页 / 设置页都显示这条结论） */
export function fsAccess() {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

/* ============================ 格式化 ============================ */
/* 秒 → 03:24 / 1:02:03 */
export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = function (n) { return (n < 10 ? '0' : '') + n; };
  return h > 0 ? (h + ':' + p(m) + ':' + p(ss)) : (m + ':' + p(ss));
}

export function fmtSize(b) {
  const v = Number(b) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1048576) return (v / 1024).toFixed(0) + ' KB';
  if (v < 1073741824) return (v / 1048576).toFixed(1) + ' MB';
  return (v / 1073741824).toFixed(2) + ' GB';
}

export function basename(p) {
  return String(p || '').replace(/\\/g, '/').split('/').pop();
}

/* ============================ 选文件 / 选文件夹 ============================ */
function fallbackInput(accept, dir) {
  return new Promise(function (resolve) {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept || '';
    if (dir) input.webkitdirectory = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      const files = Array.prototype.slice.call(input.files || []);
      if (input.parentNode) input.parentNode.removeChild(input);
      resolve(files);
    }, { once: true });
    input.click();
  });
}

/* 选文件（多选）→ File[] */
export async function pickFiles() {
  if (fsAccess()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        excludeAcceptAllOption: false,
        types: [{
          description: '音视频（按浏览器能播的格式）',
          accept: {
            'audio/*': Object.keys(M().audio).map(function (e) { return '.' + e; }),
            'video/*': Object.keys(M().video).map(function (e) { return '.' + e; })
          }
        }]
      });
      const out = [];
      for (let i = 0; i < handles.length; i++) out.push(await handles[i].getFile());
      return out;
    } catch (e) {
      if (e && e.name === 'AbortError') return [];        // 用户自己取消，不算错
      /* 内核不支持这种用法 → 退回 input */
    }
  }
  return fallbackInput('audio/*,video/*');
}

/* 选文件夹（递归扫音视频）→ { items:[{file,rel}], skipped, total, handle } */
export async function pickFolder() {
  if (fsAccess() && typeof window.showDirectoryPicker === 'function') {
    let handle = null;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if (e && e.name === 'AbortError') return { items: [], skipped: 0, total: 0, handle: null };
      handle = null;
    }
    if (handle) {
      const res = await scanHandle(handle);
      res.handle = handle;
      return res;
    }
  }
  const files = await fallbackInput('audio/*,video/*', true);
  const items = [];
  let skipped = 0;
  files.forEach(function (f) {
    if (playable(f).ok) items.push({ file: f, rel: f.webkitRelativePath || f.name });
    else skipped += 1;
  });
  return { items: items, skipped: skipped, total: files.length, handle: null };
}

/* 递归扫一个目录句柄（handle.entries() 是 File System Access 的异步迭代器） */
export async function scanHandle(dir) {
  const cfg = M();
  const items = [];
  let skipped = 0, total = 0;

  async function rec(handle, prefix, depth) {
    if (items.length >= cfg.maxScan) return;
    let entries;
    try {
      entries = handle.entries();
    } catch (e) {
      return;
    }
    for await (const pair of entries) {
      if (items.length >= cfg.maxScan) return;
      const name = pair[0], h = pair[1];
      if (name.charAt(0) === '.') continue;               // 跳过隐藏项
      if (h.kind === 'directory') {
        if (depth < cfg.maxDepth) await rec(h, prefix + name + '/', depth + 1);
        continue;
      }
      total += 1;
      let file = null;
      try { file = await h.getFile(); } catch (e) { continue; }
      if (playable(file).ok) items.push({ file: file, rel: prefix + name });
      else skipped += 1;
    }
  }

  await rec(dir, '', 0);
  return { items: items, skipped: skipped, total: total, handle: dir };
}

/* ============================ 播放列表条目 ============================ */
let itemSeq = 0;

/* file → 列表项（url 懒创建，见 ensureUrl） */
export function makeItem(file, rel) {
  const info = playable(file);
  return {
    id: ++itemSeq,
    name: file.name,
    rel: rel || file.name,
    size: file.size || 0,
    kind: info.kind,
    ext: info.ext,
    mime: info.mime || file.type || '',
    file: file,
    url: '',
    bad: !info.ok,
    reason: info.reason,
    duration: 0
  };
}

/* 播放前才建 Object URL；换歌 / 清空时记得 releaseUrl() */
export function ensureUrl(item) {
  if (!item) return '';
  if (item.url) return item.url;
  try {
    item.url = URL.createObjectURL(item.file);
  } catch (e) {
    item.url = '';
  }
  return item.url;
}

export function releaseUrl(item) {
  if (item && item.url) {
    try { URL.revokeObjectURL(item.url); } catch (e) { /* 忽略 */ }
    item.url = '';
  }
}

/* ============================ 记住上次的文件夹 ============================ */
/* FileSystemDirectoryHandle 是「可结构化克隆」的 → 能直接存进 IndexedDB，
   下次打开还能拿回同一个文件夹（浏览器会再问一次读权限，这是规范要求）。 */
const DB_NAME = 'eva2-hud';
const DB_STORE = 'handles';

function idb() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === 'undefined') { reject(new Error('没有 IndexedDB')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

export async function saveHandle(kind, handle) {
  try {
    const db = await idb();
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(handle, kind);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  } catch (e) {
    return false;
  }
}

export async function loadHandle(kind) {
  try {
    const db = await idb();
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(kind);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  } catch (e) {
    return null;
  }
}

export async function clearHandle(kind) {
  try {
    const db = await idb();
    return await new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(kind);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  } catch (e) {
    return false;
  }
}

/* 「恢复上次文件夹」：拿回句柄 → 要权限 → 重新扫一遍 */
export async function restoreLast() {
  const h = await loadHandle('media');
  if (!h) return null;
  try {
    if (h.queryPermission) {
      let p = await h.queryPermission({ mode: 'read' });
      if (p !== 'granted' && h.requestPermission) p = await h.requestPermission({ mode: 'read' });
      if (p !== 'granted') return null;
    }
    const res = await scanHandle(h);
    res.handle = h;
    return res;
  } catch (e) {
    return null;
  }
}

