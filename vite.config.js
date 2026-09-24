/*!
 * vite.config.js — Vue 3 + Vite 构建配置
 * ------------------------------------------------------------------
 * base: './'  → dist/index.html 里所有资源都用相对路径引用，
 *               构建产物可以直接双击打开 / 被 tools/shot.js 用 file:// 截图。
 * target: es2019 → 覆盖车机浏览器（Chromium 7x+ 级别的内嵌内核）。
 */
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2019',
    cssTarget: 'chrome70',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900
  }
});
