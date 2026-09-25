#!/usr/bin/env node
/**
 * 部署入口（只读检查 + 构建产物确认）
 *
 * 发布前把"按锁文件干净安装 → 完整前置检查（类型检查+构建）→ 产物确认"
 * 串成一条可重复流程，任一环节失败立即指出具体环节并以非零码退出，
 * 供部署平台/发布流水线直接调用：
 *
 *   node scripts/deploy.mjs
 *
 * 环境变量：
 *   SKIP_NPM_CI=1   跳过 npm ci（部署平台已自行安装依赖时使用）
 *
 * 除 npm ci 写入 node_modules 与 vite build 写入 dist 外，
 * 不改动源码、模板或锁文件；重复执行结果一致。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const c = {
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`
}

function banner(title) {
  console.log(`\n${c.bold(`══ ${title}`)}`)
}

function run(cmd, args, stage, hint) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) {
    console.log(`\n${c.red(c.bold(`✗ 部署流程在【${stage}】环节中断（退出码 ${r.status}）`))}`)
    if (hint) console.log(`  ${hint}`)
    process.exit(1)
  }
}

console.log(c.bold('部署流程：干净安装 → 前置检查/构建 → 产物确认'))

banner('部署阶段 1/3 · 按锁文件干净安装（npm ci）')
if (process.env.SKIP_NPM_CI === '1') {
  console.log(c.dim('  SKIP_NPM_CI=1，跳过 npm ci（假定部署平台已安装依赖）'))
} else {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  run(npm, ['ci'], '干净安装',
    'npm ci 要求 package-lock.json 与 package.json 完全一致；如失败请在本地 npm install 更新锁文件并提交后重试。')
}

banner('部署阶段 2/3 · 完整前置检查（环境 → 锁文件 → 模板 → 类型检查 → 构建）')
run(process.execPath, [join('scripts', 'preflight.mjs'), '--ci'], '前置检查/构建',
  '根据上方指出的具体环节修复后，重新执行 node scripts/deploy.mjs。')

banner('部署阶段 3/3 · 构建产物确认（frontend/dist）')
const distEntry = join(root, 'dist', 'index.html')
if (!existsSync(distEntry)) {
  console.log(`\n${c.red(c.bold('✗ 部署流程在【产物确认】环节中断：未找到 dist/index.html'))}`)
  console.log('  vite build 报告成功但产物缺失，请检查构建配置后重试，不要发布空产物。')
  process.exit(1)
}
console.log(`  已确认 ${c.green('dist/index.html')} 存在，静态资源就绪。`)

console.log(`\n${c.green(c.bold('✓ 部署就绪'))} —— frontend/dist 可由静态服务器 / 托管平台发布。`)
console.log(c.dim('  本流程未改动任何源码、模板或锁文件，可安全重复执行。'))
