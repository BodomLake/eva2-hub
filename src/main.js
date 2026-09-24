/*!
 * main.js — 应用入口（Vue 3 + Vite）
 * ------------------------------------------------------------------
 * 样式只需引入一张公共表：src/styles/base.css
 * （设计令牌 + 基础重置 + 舞台/机身外壳 + 屏幕质感 + 共享零件 .ico/.chipbg/.mesh）。
 * 各组件**自己**的样式全部写在自己的 <style scoped> 里，由 Vite 按需注入 —— 
 * 这就是 Vue 项目的常规分工：公共的才单独列文件。 */
import { createApp } from 'vue';
import App from './App.vue';
import { router, bootPath } from './router.js';

import './styles/base.css';

const app = createApp(App);
app.use(router);

/* 先把初始路由落定再挂载：
     · ?page=msg 出图时第一帧就停在消息页（不闪一下仪表本体）；
     · 地址栏留着 #/set 时按 F5 → bootPath() 给回 '/'（刷新 = 重新上电，回仪表本体）。
   返回空串 = 地址栏本来就是我们要的那一页，交给 vue-router 自己落位。 */
const boot = bootPath();
const ready = boot ? router.replace(boot) : router.isReady();
ready.catch(function () { /* 地址不合法就当作没写 */ })
  .then(function () { app.mount('#app'); });
