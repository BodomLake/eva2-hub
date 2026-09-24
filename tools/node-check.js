/*!
 * tools/node-check.js — 构建前的 Node 版本闸门
 * ------------------------------------------------------------------
 * Vite 5 需要 Node ≥ 18。这台机器上 nvm 已装好 20.17.0，
 * 默认（14.17.0）跑不了，所以在这里明确提示一句，而不是丢一堆报错。
 * 该脚本本身只用 ESM 基础语法，Node 12+ 都能执行。
 */
const NEED = 18;
const major = parseInt(process.versions.node.split('.')[0], 10);

if (major < NEED) {
  console.error('');
  console.error('  ✗ Vite 需要 Node ≥ ' + NEED + '，当前是 v' + process.versions.node);
  console.error('    本机已有：nvm use 20.17.0    然后重跑 npm run dev / npm run build');
  console.error('');
  process.exit(1);
}
