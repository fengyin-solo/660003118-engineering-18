#!/usr/bin/env node
/**
 * 一键可重复检查流程：把「依赖锁 → 模板元数据 → 类型 → 构建 → 本地启动」串成一条线。
 *
 * 阶段：
 *   1/5 依赖安装检查   锁文件必须存在且与 package.json 一致（npm ci，严格按锁文件安装）
 *   2/5 模板元数据校验 data/templates.json 字段/正则/分类/样例
 *   3/5 类型检查       vue-tsc --noEmit
 *   4/5 生产构建       vite build
 *   5/5 本地启动冒烟   vite 开发服务器能启动、能响应首页（验证“本地开发真的跑得起来”）
 *
 * 特性：
 *   - 任一阶段失败立即停止，输出中明确标出是哪个阶段失败，退出码非 0
 *   - 默认只读语义：不改写模板内容、不修改锁文件；构建产物 dist/ 在结束时清理
 *     （dist/ 本就被 .gitignore 忽略）。CI 需要保留产物时设置 KEEP_DIST=1 或传 --keep-dist
 *   - 冒烟逻辑见 scripts/smoke-dev.mjs，服务器退出时必定回收，不留下残留进程
 *
 * 用法：node scripts/check.mjs [--keep-dist]
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { runDevSmoke } from './smoke-dev.mjs'
import { checkLockfile } from './check-lockfile.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const KEEP_DIST = process.env.KEEP_DIST === '1' || process.argv.includes('--keep-dist')
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const stages = [
  ['1/5', '依赖安装检查', '锁文件缺失或与 package.json 不一致（依赖版本无法复现）'],
  ['2/5', '模板元数据校验', 'data/templates.json 存在缺字段、非法正则、分类或样例问题'],
  ['3/5', '类型检查', 'vue-tsc --noEmit'],
  ['4/5', '生产构建', 'vite build'],
  ['5/5', '本地启动冒烟', 'vite 开发服务器']
]

function banner(no, title) {
  console.log(`\n▶ [阶段 ${no}] ${title}`)
}

function ok(no, title, detail) {
  console.log(`  ✓ 阶段 ${no}「${title}」通过${detail ? ` — ${detail}` : ''}`)
}

function runNpm(args) {
  const r = spawnSync(NPM, args, { cwd: ROOT, stdio: 'inherit' })
  return r.status === 0
}

function cleanupDist() {
  rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true })
}

function failStage(no, hint) {
  console.error(`  ✗ 阶段 ${no} 失败：${hint}`)
  process.exit(1)
}

async function main() {
  console.log('正则可视化调试器 —— 一键检查流程（依赖锁 → 模板校验 → 类型 → 构建 → 本地启动）')

  // 阶段 1：锁文件存在且与 package.json 规格一致，再 npm ci 严格按锁安装
  const [no1, title1, hint1] = stages[0]
  banner(no1, title1)
  if (!checkLockfile().ok) failStage(no1, hint1)
  console.log('  · 执行 npm ci（严格按锁文件安装，保证各机器依赖版本一致）')
  if (!runNpm(['ci', '--ignore-scripts'])) failStage(no1, hint1)
  ok(no1, title1, '依赖已按锁文件安装，各机器版本一致')

  // 阶段 2：模板元数据
  const [no2, title2, hint2] = stages[1]
  banner(no2, title2)
  if (!runNpm(['run', '--silent', 'validate:templates'])) failStage(no2, hint2)
  ok(no2, title2)

  // 阶段 3：类型检查
  const [no3, title3] = stages[2]
  banner(no3, title3)
  if (!runNpm(['run', '--silent', 'typecheck'])) {
    failStage(no3, 'TypeScript 类型检查未通过（vue-tsc --noEmit）')
  }
  ok(no3, title3)

  // 阶段 4：生产构建（失败时清理半成品 dist，避免留下临时产物）
  const [no4, title4] = stages[3]
  banner(no4, title4)
  if (!runNpm(['run', '--silent', 'build:only'])) {
    cleanupDist()
    failStage(no4, 'vite build 未通过（已清理半成品 dist/）')
  }
  ok(no4, title4, '产物输出到 dist/')

  // 阶段 5：本地启动冒烟（复用 smoke-dev.mjs，失败时同样清理 dist）
  const [no5, title5, hint5] = stages[4]
  banner(no5, title5)
  const smoke = await runDevSmoke()
  if (!smoke.ok) {
    console.error(`  ✗ ${smoke.error.message}`)
    if (!KEEP_DIST) cleanupDist()
    failStage(no5, hint5)
  }
  console.log(`  （开发服务器日志）\n${smoke.log.trimEnd().split('\n').map(l => '    ' + l).join('\n')}`)
  ok(no5, title5, `${smoke.url} 返回 200 且包含 #app 挂载点`)

  if (KEEP_DIST) {
    console.log('  · KEEP_DIST=1：保留 dist/ 供后续部署使用')
  } else {
    cleanupDist()
    console.log('  · 已清理构建产物 dist/（检查流程不在工作区留下产物）')
  }

  console.log('\n✅ 全部 5 个阶段通过：依赖可复现、模板元数据有效、类型/构建/本地启动均正常')
}

main().catch(e => {
  console.error('检查流程异常中断：', e)
  process.exit(1)
})
