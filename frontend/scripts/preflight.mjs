#!/usr/bin/env node
/**
 * 本地启动检查 / 上线前置检查（只读编排脚本）
 *
 * 把分散的检查串成一条可重复流程，任一环节失败立即指出具体环节：
 *   阶段 1  运行环境      node / npm 版本
 *   阶段 2  依赖锁文件    scripts/check-lockfile.mjs（锁文件存在且与 package.json 一致）
 *   阶段 3  模板元数据    scripts/validate-templates.mjs（缺字段/分类未声明/样例不匹配）
 *   阶段 4  类型检查      vue-tsc --noEmit（仅 verify/CI 模式）
 *   阶段 5  生产构建      vite build（仅 verify/CI 模式）
 *
 * 用法：
 *   node scripts/preflight.mjs          开发模式：阶段 1-3，npm run dev 前自动执行
 *   node scripts/preflight.mjs --ci     上线/流水线模式：阶段 1-5
 *
 * 全程只读：不安装依赖、不改写模板或源码、不产生临时产物，可安全重复执行。
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const ciMode = process.argv.includes('--ci')

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`
}

function banner(title) {
  console.log(`\n${c.bold(`── ${title}`)}`)
}

function fail(stage, hint) {
  console.log(`\n${c.red(c.bold(`✗ 流程在【${stage}】环节中断`))}`)
  if (hint) console.log(`  ${hint}`)
  console.log(c.dim('  修复后重新执行同一命令即可，检查过程不会改动任何文件。'))
  process.exit(1)
}

function runNodeScript(stage, scriptName) {
  const r = spawnSync(process.execPath, [join('scripts', scriptName)], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) {
    fail(stage, `详情见上方 ${scriptName} 输出。`)
  }
}

console.log(c.bold(ciMode ? '上线/流水线前置检查（preflight --ci）' : '本地启动检查（preflight）'))
console.log(c.dim(`工作目录: ${root}`))

// ---- 阶段 1：运行环境 ----
banner('阶段 1/5 · 运行环境')
const nodeOk = process.versions.node.split('.').map(Number)[0] >= 18
const nodeVersion = process.versions.node
const npmVersion = (() => {
  const r = spawnSync('npm', ['-v'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
})()
console.log(`  Node.js ${nodeVersion}${nodeOk ? '' : c.red('  （需要 Node.js >= 18）')}`)
console.log(`  npm ${npmVersion ?? c.red('未找到（请先安装 npm）')}`)
if (!nodeOk) fail('运行环境', '请升级到 Node.js 18 或更高版本。')
if (!npmVersion) fail('运行环境', '未找到 npm，请先安装 Node.js（自带 npm）。')

// ---- 阶段 2：依赖锁文件 ----
banner('阶段 2/5 · 依赖锁文件（package-lock.json）')
runNodeScript('依赖锁文件', 'check-lockfile.mjs')

// ---- 阶段 3：模板元数据 ----
banner('阶段 3/5 · 模板元数据（src/data/templates.json）')
runNodeScript('模板元数据', 'validate-templates.mjs')

if (!ciMode) {
  console.log(`\n${c.green('✓ 启动检查全部通过')} —— 继续启动开发服务器（vite）。`)
  console.log(c.dim('  提示：npm run verify 可在本地复现流水线的完整检查（含类型检查与构建）。'))
  process.exit(0)
}

// ---- 阶段 4：类型检查（CI/上线） ----
banner('阶段 4/5 · TypeScript 类型检查（vue-tsc --noEmit）')
let r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vue-tsc', '--noEmit'],
  { cwd: root, stdio: 'inherit' }
)
if (r.status !== 0) {
  fail('TypeScript 类型检查', '请修复上方报告的类型错误；若错误来自依赖版本漂移，先按阶段 2 提示刷新锁文件并 npm ci。')
}

// ---- 阶段 5：生产构建（CI/上线） ----
banner('阶段 5/5 · 生产构建（vite build）')
r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'build'],
  { cwd: root, stdio: 'inherit' }
)
if (r.status !== 0) {
  fail('生产构建', '构建失败，详见上方 vite 输出；产物目录 frontend/dist 未生成有效内容，请勿部署。')
}

console.log(`\n${c.green(c.bold('✓ 上线/流水线前置检查全部通过'))}（环境 → 锁文件 → 模板 → 类型检查 → 构建）`)
console.log(c.dim('  生产产物位于 frontend/dist，可交由部署环节发布。'))
