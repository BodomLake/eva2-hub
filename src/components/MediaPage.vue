<script setup>
/*!
 * MediaPage.vue — 媒体播放器（左侧灯塔第 4 个芯片，原来叫「音乐」）
 * ==================================================================
 * 音视频都放：mp3 / m4a / flac / wav… 和 mp4 / m4v / webm…
 *   · 资源来自**电脑本地文件**：File System Access API 选文件 / 选文件夹
 *     （不支持的内核自动退回 <input type="file">，功能一样、少了「记住文件夹」）
 *   · **只加载浏览器真的能播的**：白名单扩展名 + canPlayType 两道过滤，
 *     其余算「跳过」并把数量报出来（页面上直接列支持清单）
 *   · 纯前端：Object URL + <video> 播放，不上传、不联网
 *   · 列表 / 音量 / 循环 / 自动下一首存浏览器；文件夹句柄存 IndexedDB，
 *     下次「恢复上次文件夹」一键重建列表（浏览器会再问一次读权限）
 */
import { computed, reactive, ref, onBeforeUnmount } from 'vue';
import { CONFIG as C } from '../config.js';
import { useHudContext } from '../composables/useHud.js';
import {
  makeItem, ensureUrl, releaseUrl, pickFiles, pickFolder, restoreLast, saveHandle, clearHandle,
  supportedList, fsAccess, playable, fmtTime, fmtSize
} from '../core/media.js';
/* ⚠ 必须显式 import <AppPage>（理由见 MsgCenter.vue 里的同一行注释） */
import AppPage from './AppPage.vue';

const hud = useHudContext();
const media = hud.settings.state.media;

const st = reactive({
  items: [],
  idx: -1,
  playing: false,
  time: 0,
  duration: 0,
  skipped: 0,
  scanned: 0,
  status: '选文件或选文件夹开始 · 只收浏览器能播的音视频',
  error: '',
  haveHandle: false,
  shuffle: false
});

const stage = ref(null);                       // <video> 元素（音频也用它放）
const supported = supportedList();             // { audio:[…], video:[…] }
const fsOk = fsAccess();

const list = computed(function () {
  if (media.filter === 'all') return st.items;
  return st.items.filter(function (it) { return it.kind === media.filter; });
});
const current = computed(function () { return st.items[st.idx] || null; });
const progress = computed(function () {
  return st.duration > 0 ? Math.round(st.time / st.duration * 1000) / 10 : 0;
});

/* ---------------------------- 列表维护 ---------------------------- */
function addPairs(pairs) {
  let ok = 0, bad = 0;
  pairs.forEach(function (p) {
    const info = playable(p.file);
    if (!info.ok) { bad += 1; return; }
    st.items.push(makeItem(p.file, p.rel));
    ok += 1;
  });
  st.skipped += bad;
  st.status = '新增 ' + ok + ' 个可播放文件' + (bad ? '，跳过 ' + bad + ' 个（浏览器播不了）' : '') +
    ' · 共 ' + st.items.length + ' 项';
  if (st.idx < 0 && st.items.length) st.idx = 0;
}

async function doPick() {
  st.error = '';
  try {
    const files = await pickFiles();
    if (files.length) addPairs(files.map(function (f) { return { file: f, rel: f.name }; }));
  } catch (e) {
    st.error = '选文件失败：' + (e.message || e);
  }
}

async function doFolder() {
  st.error = '';
  st.status = '正在扫描文件夹…';
  try {
    const res = await pickFolder();
    if (res.handle) {
      st.haveHandle = await saveHandle('media', res.handle);
    }
    st.scanned = res.total;
    addPairs(res.items);
    if (res.total) {
      st.status = '扫描 ' + res.total + ' 个文件 · 收录 ' + res.items.length + ' 个' +
        (res.skipped ? ' · 跳过 ' + res.skipped + ' 个' : '') +
        (res.items.length >= C.apps.media.maxScan ? '（已达上限 ' + C.apps.media.maxScan + '）' : '');
    }
  } catch (e) {
    st.error = '扫文件夹失败：' + (e.message || e);
  }
}

async function doRestore() {
  st.error = '';
  st.status = '恢复上次的文件夹…';
  try {
    const res = await restoreLast();
    if (!res) { st.error = '没有可恢复的文件夹（或读权限被拒绝）'; st.status = ''; return; }
    addPairs(res.items);
    st.status = '已恢复上次的文件夹 · 收录 ' + res.items.length + ' 个';
  } catch (e) {
    st.error = '恢复失败：' + (e.message || e);
  }
}

async function forgetFolder() {
  await clearHandle('media');
  st.haveHandle = false;
  st.status = '已忘掉上次的文件夹';
}

function clearAll() {
  stop();
  st.items.forEach(releaseUrl);
  st.items = [];
  st.idx = -1;
  st.skipped = 0;
  st.scanned = 0;
  st.status = '列表已清空';
}

function removeAt(i) {
  const it = st.items[i];
  if (st.idx === i) stop();
  releaseUrl(it);
  st.items.splice(i, 1);
  if (st.idx > i) st.idx -= 1;
  if (st.idx >= st.items.length) st.idx = st.items.length - 1;
}

function onDrop(e) {
  const files = Array.prototype.slice.call(e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files : []);
  if (files.length) addPairs(files.map(function (f) { return { file: f, rel: f.name }; }));
}

/* ---------------------------- 播放控制 ---------------------------- */
function playAt(i) {
  const it = st.items[i];
  if (!it) return;
  const el = stage.value;
  if (!el) return;
  if (st.idx !== i) {
    const old = st.items[st.idx];
    if (old) releaseUrl(old);
    st.idx = i;
  }
  const url = ensureUrl(it);
  el.src = url;
  el.volume = Number(media.volume);
  el.play().then(function () {
    st.playing = true;
    hud.setMediaPlaying(true);
  }).catch(function (e) {
    st.playing = false;
    hud.setMediaPlaying(false);
    st.error = '浏览器拒绝播放：' + (e.message || e) + '（需要一次用户点击 —— 再点一下播放键）';
  });
}

function toggle() {
  const el = stage.value;
  if (!el) return;
  if (!current.value) {
    if (st.items.length) playAt(st.idx < 0 ? 0 : st.idx);
    return;
  }
  if (el.paused) {
    el.play().then(function () { st.playing = true; hud.setMediaPlaying(true); })
      .catch(function (e) { st.error = '播放失败：' + (e.message || e); });
  } else {
    el.pause();
  }
}

function stop() {
  const el = stage.value;
  st.playing = false;
  hud.setMediaPlaying(false);
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  try { el.load(); } catch (e) { /* 忽略 */ }
  st.time = 0;
  st.duration = 0;
}

function step(dir) {
  if (!st.items.length) return;
  let i = st.idx;
  if (st.shuffle) {
    i = Math.floor(Math.random() * st.items.length);
  } else {
    i = (i + dir + st.items.length) % st.items.length;
  }
  playAt(i);
}

function next() {
  if (!media.autoplayNext) { stop(); return; }
  if (st.idx === st.items.length - 1 && !media.loopAll) { stop(); return; }
  step(1);
}

function onLoaded() {
  const el = stage.value;
  if (!el) return;
  st.duration = isFinite(el.duration) ? el.duration : 0;
  if (current.value) current.value.duration = st.duration;
}

function onTime() {
  const el = stage.value;
  if (!el) return;
  st.time = el.currentTime || 0;
  if (!st.duration && isFinite(el.duration)) st.duration = el.duration;
}

function seek(v) {
  const el = stage.value;
  if (!el || !st.duration) return;
  el.currentTime = Number(v) / 1000 * st.duration;
}

function setVolume(v) {
  media.volume = Number(v);
  const el = stage.value;
  if (el) el.volume = Number(v);
}

function onError() {
  st.playing = false;
  hud.setMediaPlaying(false);
  st.error = '这个文件浏览器解不了码（换一个格式，或看下面「支持清单」）';
}

onBeforeUnmount(function () {
  st.items.forEach(releaseUrl);
  hud.setMediaPlaying(false);
});
</script>

<template>
  <AppPage pid="music" fit :status="current ? (st.playing ? 'PLAYING' : 'PAUSED') : 'IDLE'">
    <template #actions>
      <button class="btn btn--sm" type="button" @click="doPick">
        <svg class="ico"><use href="#i-film" /></svg>选文件
      </button>
      <button class="btn btn--sm" type="button" @click="doFolder">
        <svg class="ico"><use href="#i-folder" /></svg>选文件夹
      </button>
    </template>

    <div class="page__cols media">

      <!-- ==================== 左列：播放器 ==================== -->
      <div class="media__col media__col--main">
        <section class="card card--amber">
          <header class="card__hd">
            <svg class="ico"><use href="#i-music" /></svg>播放器 · PLAYER
            <small>{{ current ? current.kind.toUpperCase() + ' · .' + current.ext : '未选择' }}</small>
          </header>
          <div class="card__body">
            <!-- 音频 / 视频共用一个 <video>：视频出画面，音频只出声音 + 下面的唱片块。
                 ⚠ 这一层的类名故意**不叫 .stage** —— base.css 里 .stage 是「HUD 缩放舞台」
                 （1300×760 + transform），撞名会把画面盒按那块舞台的尺寸撑开。 -->
            <div class="playerwrap">
              <div class="player" :class="{ 'is-audio': !current || current.kind === 'audio' }">
                <video
                  ref="stage"
                  class="player__video"
                  playsinline
                  @loadedmetadata="onLoaded"
                  @timeupdate="onTime"
                  @play="st.playing = true; hud.setMediaPlaying(true)"
                  @pause="st.playing = false; hud.setMediaPlaying(false)"
                  @ended="next"
                  @error="onError"
                ></video>
                <div class="player__disc" aria-hidden="true">
                  <span class="player__ring"></span>
                  <svg class="ico player__note"><use href="#i-music" /></svg>
                </div>
              </div>
            </div>

            <div class="np">
              <b class="np__name">{{ current ? current.name : '还没有选择文件' }}</b>
              <span class="np__sub">
                {{ current ? (current.rel + ' · ' + fmtSize(current.size)) : '支持 mp4 / webm / mp3 / flac / wav …（见右下支持清单）' }}
              </span>
            </div>

            <div class="row row--tight" id="media-bar">
              <button class="btn btn--sm" type="button" title="上一首" @click="step(-1)">
                <svg class="ico"><use href="#i-prev" /></svg>
              </button>
              <button class="btn btn--sm is-on" type="button" :title="st.playing ? '暂停' : '播放'" @click="toggle">
                <svg class="ico"><use :href="st.playing ? '#i-pause' : '#i-play'" /></svg>{{ st.playing ? '暂停' : '播放' }}
              </button>
              <button class="btn btn--sm" type="button" title="下一首" @click="step(1)">
                <svg class="ico"><use href="#i-next" /></svg>
              </button>
              <button class="btn btn--sm" type="button" @click="stop">停止</button>
              <span class="spacer"></span>
              <button class="btn btn--sm" :class="{ 'is-on': st.shuffle }" type="button" @click="st.shuffle = !st.shuffle">
                <svg class="ico"><use href="#i-shuffle" /></svg>随机
              </button>
              <button class="btn btn--sm" :class="{ 'is-on': media.loopAll }" type="button" @click="media.loopAll = !media.loopAll">
                <svg class="ico"><use href="#i-repeat" /></svg>循环
              </button>
            </div>

            <div class="row">
              <span class="np__time">{{ fmtTime(st.time) }}</span>
              <input
                class="sld np__seek" type="range" min="0" max="1000" step="1"
                :value="progress" @input="seek($event.target.value)"
              >
              <span class="np__time">{{ fmtTime(st.duration) }}</span>
            </div>

            <div class="row">
              <svg class="ico"><use href="#i-volume" /></svg>
              <input
                class="sld np__vol" type="range" min="0" max="1" step="0.02"
                :value="media.volume" @input="setVolume($event.target.value)"
              >
              <span class="fld__v">{{ Math.round(media.volume * 100) }}<i>%</i></span>
              <span class="spacer"></span>
              <button
                class="btn btn--sm" :class="{ 'is-on': media.autoplayNext }" type="button"
                @click="media.autoplayNext = !media.autoplayNext"
              >放完自动下一首</button>
            </div>

            <p v-if="st.error" class="media__msg is-err">{{ st.error }}</p>
          </div>
        </section>
      </div>

      <!-- ==================== 右列：资源来源 / 播放列表 / 支持清单 ==================== -->
      <div class="media__col media__col--side">
        <section class="card">
          <header class="card__hd">
            <svg class="ico"><use href="#i-folder" /></svg>本地资源 · SOURCE
            <small>{{ fsOk ? 'File System Access API' : '退回 input[file]' }}</small>
          </header>
          <div class="card__body">
            <div class="row row--tight">
              <button class="btn btn--sm" type="button" @click="doPick">选文件</button>
              <button class="btn btn--sm" type="button" @click="doFolder">选文件夹</button>
              <button class="btn btn--sm" type="button" :disabled="!fsOk" @click="doRestore">
                <svg class="ico"><use href="#i-refresh" /></svg>恢复上次
              </button>
              <button class="btn btn--sm btn--ghost" type="button" :disabled="!fsOk" @click="forgetFolder">忘记</button>
            </div>
            <div class="row row--tight">
              <span class="seg">
                <button class="seg__btn" :class="{ 'is-on': media.filter === 'all' }" type="button" @click="media.filter = 'all'">全部</button>
                <button class="seg__btn" :class="{ 'is-on': media.filter === 'audio' }" type="button" @click="media.filter = 'audio'">
                  <svg class="ico"><use href="#i-music" /></svg>音频
                </button>
                <button class="seg__btn" :class="{ 'is-on': media.filter === 'video' }" type="button" @click="media.filter = 'video'">
                  <svg class="ico"><use href="#i-film" /></svg>视频
                </button>
              </span>
              <span class="spacer"></span>
              <button class="btn btn--sm btn--ghost" type="button" @click="clearAll">
                <svg class="ico"><use href="#i-trash" /></svg>清空
              </button>
            </div>
            <p class="note">{{ st.status }}</p>
            <p v-if="!fsOk" class="note">
              当前内核没有 <code>showOpenFilePicker</code>（或页面不是安全上下文）→
              自动退回 <code>input[type=file]</code>：选文件照样能用，只是不能「记住上次的文件夹」。
            </p>
          </div>
        </section>

        <section class="card media__listcard">
          <header class="card__hd">
            <svg class="ico"><use href="#i-film" /></svg>播放列表 · PLAYLIST
            <small>{{ list.length }} / {{ st.items.length }} 项</small>
          </header>
          <div class="card__body" @dragover.prevent @drop.prevent="onDrop">
            <div v-if="!list.length" class="empty">把音视频文件拖到这里，或点上面的「选文件 / 选文件夹」</div>
            <div class="plist media__list">
              <div
                v-for="it in list" :key="it.id"
                class="plist__row" :class="{ 'is-on': current && current.id === it.id }"
                @click="playAt(st.items.indexOf(it))"
              >
                <svg class="ico"><use :href="it.kind === 'video' ? '#i-film' : '#i-music'" /></svg>
                <span class="media__name">{{ it.name }}</span>
                <i>{{ fmtSize(it.size) }}</i>
                <button class="btn btn--sm btn--ghost" type="button" title="从列表移除" @click.stop="removeAt(st.items.indexOf(it))">✕</button>
              </div>
            </div>
          </div>
        </section>

        <section class="card card--flat media__sup">
          <header class="card__hd">
            <svg class="ico"><use href="#i-info" /></svg>支持清单 · SUPPORTED
            <small>canPlayType 实测</small>
          </header>
          <div class="card__body">
            <div class="kv">
              <span class="kv__k">音频</span>
              <span class="kv__v">{{ supported.audio.join(' / ') || '（无）' }}</span>
            </div>
            <div class="kv">
              <span class="kv__k">视频</span>
              <span class="kv__v">{{ supported.video.join(' / ') || '（无）' }}</span>
            </div>
            <div class="kv">
              <span class="kv__k">已跳过</span>
              <span class="kv__v">{{ st.skipped }}<em>个（非音视频 / 内核不支持）</em></span>
            </div>
            <p class="note">
              白名单在 <code>config.apps.media</code>，再加 <code>canPlayType</code> 二道过滤 ——
              <b>浏览器播不了的格式根本不会进列表</b>（.mkv / .avi / .wmv 故意不收）。
            </p>
          </div>
        </section>
      </div>
    </div>
  </AppPage>
</template>

<style scoped>
/*
 * 这一页要「一屏装下、不滚动」（AppPage 的 fit 属性 → 正文区 overflow:hidden）：
 *   .media__col        两列各自是 flex 纵向容器，高度铺满正文区
 *   .media__col--main  播放器卡片撑满左列 → 画面吃掉富余高度，
 *                      **底部那条操作条（#media-bar）永远在可视区内**
 *                      （以前 .stage 按 16:9 定高，把操作条顶到折叠线以下了）
 *   .media__col--side  右列三块：来源 / 列表（吃掉富余高度、自己内部滚）/ 支持清单
 */
.media { height: 100%; align-items: stretch; }

.media__col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 左列：播放器卡片撑满，卡片内部再分「标题 / 正文」两行 */
.media__col--main > .card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.media__col--main .card__hd { flex: none; }
.media__col--main > .card > .card__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 画面区（类名用 .player*，**不能叫 .stage** —— base.css 里 .stage 是 HUD 缩放舞台）：
   只负责「占住剩下的高度」，具体画多大交给里面的 <video>（object-fit: contain）。
   音频时那张「唱片」在中间 —— 大盒子看着像播放台，不觉空。 */
.playerwrap {
  flex: 1 1 auto;
  min-height: 132px;
  display: flex;
}
.player {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(90% 70% at 50% 40%, rgba(255, 122, 24, .12), rgba(6, 2, 4, .9) 70%),
    repeating-linear-gradient(180deg, rgba(0, 0, 0, .5) 0 1px, transparent 1px 3px);
  border: 1px solid rgba(255, 122, 24, .28);
  border-radius: 8px;
}
.player__video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #000; }
.player.is-audio .player__video { opacity: 0; pointer-events: none; }
.player__disc { position: absolute; inset: 0; display: none; place-items: center; }
.player.is-audio .player__disc { display: grid; }
.player__ring {
  position: absolute;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  border: 2px dashed rgba(255, 171, 61, .55);
  animation: discSpin 12s linear infinite;
}
.player__note { width: 34px; height: 34px; color: var(--c-amber); }

.np { flex: none; display: grid; gap: 2px; margin: 8px 0 7px; }
.np__name { font-size: 14px; color: var(--ink); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.np__sub { font-size: 11px; color: var(--ink-3); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.np__time {
  flex: none;
  font-family: var(--font-num);
  font-size: 11px;
  color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.np__seek { flex: 1 1 auto; }
.np__vol { flex: 0 0 110px; }

/* 右列：来源（固定）/ 列表（吃掉富余高度，列表内部自己滚）/ 支持清单（固定） */
.media__col--side > .card { flex: none; }
.media__col--side > .media__listcard {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.media__listcard .card__hd { flex: none; }
.media__listcard > .card__body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.media__listcard .empty { margin: auto; }

.media__list { flex: 1 1 auto; min-height: 0; max-height: none; overflow: auto; }
.media__list .plist__row { gap: 6px; }
.media__name { flex: 1 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.media__msg { margin: 8px 0 0; font-size: 11px; color: var(--c-amber); }
.media__msg.is-err { color: #ffb0a0; }

/* 支持清单压扁一点：三行键值 + 两句提示，别把右列的列表挤没了 */
.media__sup .card__body { padding: 6px 14px 8px; }
.media__sup .note { margin-top: 5px; font-size: 10px; line-height: 1.5; }

@keyframes discSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .stage__ring { animation: none; }
}
</style>

