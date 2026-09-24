/*!
 * main.js — 应用入口（Vue 3 + Vite）
 * ------------------------------------------------------------------
 * 样式只需引入一张公共表：src/styles/base.css
 * （设计令牌 + 基础重置 + 舞台/机身外壳 + 屏幕质感 + 共享零件 .ico/.chipbg/.mesh）。
 * 各组件**自己**的样式全部写在自己的 <style scoped> 里，由 Vite 按需注入 —— 
 * 这就是 Vue 项目的常规分工：公共的才单独列文件。 */
import { createApp } from 'vue';
import App from './App.vue';

import './styles/base.css';

createApp(App).mount('#app');
