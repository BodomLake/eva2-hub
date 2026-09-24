/*!
 * router.js — 五个应用页的路由（vue-router 4 · hash 模式 + KeepAlive 保活）
 * ==================================================================
 * 路由表就是 config.rail 那五颗芯片（页面外壳的页签也读同一份清单）：
 *
 *     /                      仪表本体（没有页面打开）
 *     /msg /nav /nerv /music /set
 *
 * 为什么是 **hash 模式**：整套东西要能「双击 dist/index.html」在 file:// 下跑，
 * 而 history 模式需要服务端把未知路径回退到 index.html —— file:// 做不到。
 *
 * 两件配套的事（都在 App.vue + base.css 里落地）：
 *   ① **保活**：<RouterView> + <KeepAlive> 把访问过的页面缓存住 —— 切页、关页
 *      都不卸载（本地播放器不断、导航路线不丢、设置里选的那一节还在），
 *      所以 openPage/closePage 只是「换路由」，不是「销毁重建」。
 *   ② **转场不闪 home**：页面层是一个常驻的实底容器（`.pages`）—— 页与页
 *      交叉淡入时，透过来的也是这层底色，而不是下面的仪表本体。
 *
 * ?page=msg 这种老写法照旧能用（README / 出图 / 冒烟里的例子都靠它）：
 * main.js 启动时调 bootPath() 把它翻译成路由地址，导航落定后再挂载。
 *
 * ③ **刷新 = 重新上电**（第 11 轮）：地址栏里留着 #/set 时按 F5 不再停在那页，
 *    一律回仪表本体（地址栏随即变成 …/#/）—— 车上重新上电就该是仪表本体，
 *    而不是上次翻到的那页。判定用 Navigation Timing 的 type === 'reload'：
 *    手打 #/msg 打开（type = 'navigate'）**照旧直达**，只有真刷新才回 home。
 *
 * ⚠ 组件必须显式 import（模板里写了却没 import 时 Vue 会退化成运行期
 *   resolveComponent()，生产构建连警告都没有 —— 第九轮就是整页渲染成空）。
 *   check.js 第 9 节会静态盯着这里与 App.vue。
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import { CONFIG as C } from './config.js';

import MsgCenter from './components/MsgCenter.vue';
import NavPage from './components/NavPage.vue';
import NervPage from './components/NervPage.vue';
import MediaPage from './components/MediaPage.vue';
import SettingsPage from './components/SettingsPage.vue';

/* 页面 id = config.rail 的 id = 路由 name（useHud / LeftRail / AppPage 都用它） */
export const PAGE_IDS = C.rail.map(function (r) { return r.id; });

/* 「没打开任何页面」时渲染的空组件：仪表本体照旧在它下面 */
const HudHome = { name: 'hud', render: function () { return null; } };

/* 路由表：**一条条写明**（不按 rail 循环生成）—— 好读，而且 check.js 能静态核对
   「rail 的每个 id 都有路由 / 每条路由的组件都真的 import 了」。 */
const routes = [
  { path: '/', name: 'hud', component: HudHome },
  { path: '/msg', name: 'msg', component: MsgCenter },
  { path: '/nav', name: 'nav', component: NavPage },
  { path: '/nerv', name: 'nerv', component: NervPage },
  { path: '/music', name: 'music', component: MediaPage },
  { path: '/set', name: 'set', component: SettingsPage },
  { path: '/:pathMatch(.*)*', redirect: '/' }        // 手打错的地址回仪表本体
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes: routes
});

/* 这次「文档加载」是刷新还是新打开？
   —— 只有刷新（F5 / location.reload() / 地址栏回车重载）才把页面踢回仪表本体。
   拿 Navigation Timing 的 type 判断（'navigate' | 'reload' | 'back_forward'）。
   老内核 / 某些无头环境读不到时返回 false：宁可保留深链，也不要把「新打开」误判成刷新。 */
function isReload() {
  try {
    var list = window.performance.getEntriesByType('navigation');
    return !!(list && list[0] && list[0].type === 'reload');
  } catch (e) {
    return false;
  }
}

/* 启动时该落到哪条路由（返回 '' = 不用动路由，vue-router 自己按地址栏落位）：
     ① ?page=msg  ——  出图 / 冒烟 / 文档里的深链，永远优先（与刷新无关）
     ② #/msg      ——  地址栏深链：**新打开照旧直达**，刷新（F5）回仪表本体
     ③ 其余（没写 hash / 不认识的 hash / 刷新）—— 一律归位到 '/'
   归位走 router.replace（main.js 里就是这么用的）：不往历史里塞「首页」那一笔，
   但地址栏会稳定写成 …/#/ ，刷新完不会再停在上次那页。 */
export function bootPath() {
  const q = /[?&]page=([a-z]+)/.exec(window.location.search || '');
  const id = q ? q[1] : '';
  if (PAGE_IDS.indexOf(id) >= 0) return '/' + id;

  const m = /#\/([a-z]+)/.exec(window.location.hash || '');
  if (m && PAGE_IDS.indexOf(m[1]) >= 0 && !isReload()) return '';
  return '/';
}
